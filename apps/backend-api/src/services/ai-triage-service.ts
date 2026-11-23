// SPDX-License-Identifier: Apache-2.0
import { config } from '../config/environment.js';
import {
  AiTriageSuggestion,
  DepartmentGroupItem,
  RequestCategoryEntity,
  RequestPriority,
} from '../types/request.js';
import {
  AiDomainProfileConfig,
  loadAiConfig,
} from '../utils/ai-config-loader.js';
import {
  extractBigrams,
  matchesVietnamesePhrase,
  normalizeKeepDiacritics,
  renderPromptTemplate,
  stripVietnameseDiacritics,
  tokenizeAccentlessSafe,
  tokenizeDiacriticAware,
  toPaddedAsciiTokens,
  toPaddedDiacriticTokens,
} from '../utils/text-vector.js';

export interface AiTriageInput {
  title: string;
  description?: string;
  departments: DepartmentGroupItem[];
  categories: RequestCategoryEntity[];
}

export interface FastInsightInput extends AiTriageInput {
  currentCategoryCode?: string;
  currentDepartment?: string | null;
  currentPriority?: RequestPriority;
}

export function normalizeVietnamese(input: string): string {
  return stripVietnameseDiacritics(input);
}

/**
 * Nhận diện nhóm lớp sinh viên trong Keycloak ("Lớp" hoặc "Lớp/K11A1")
 * để không bao giờ gợi ý nhầm làm phòng ban tiếp nhận yêu cầu.
 */
export function isStudentClassGroup(dept: DepartmentGroupItem): boolean {
  const normPath = stripVietnameseDiacritics((dept.path || '').replace(/^\/+/, ''));
  const normName = stripVietnameseDiacritics(dept.name || '');
  if (normPath === 'lop' || normPath.startsWith('lop/')) return true;
  if (normName === 'lop' && (dept.sub_group_count ?? 0) > 0) return true;
  return false;
}

export function filterRealDepartments(
  departments: DepartmentGroupItem[]
): DepartmentGroupItem[] {
  return departments.filter((dept) => !isStudentClassGroup(dept));
}

function findKeywordsInText(
  diacriticText: string,
  accentlessText: string,
  candidates: readonly string[]
): string[] {
  return candidates.filter((kw) =>
    matchesVietnamesePhrase(diacriticText, accentlessText, kw)
  );
}

function doesEntityMatchHints(entityText: string, hints: readonly string[]): boolean {
  const diaEntity = normalizeKeepDiacritics(entityText);
  const asciiEntity = stripVietnameseDiacritics(entityText);
  return hints.some((hint) => {
    const diaHint = normalizeKeepDiacritics(hint);
    const asciiHint = stripVietnameseDiacritics(hint);
    return diaEntity.includes(diaHint) || asciiEntity.includes(asciiHint);
  });
}

function findMatchingDepartment(
  departments: DepartmentGroupItem[],
  departmentText?: string | null
): DepartmentGroupItem | null {
  if (!departmentText) return null;
  const normalizedTarget = stripVietnameseDiacritics(departmentText.replace(/^\/+/, ''));
  return (
    departments.find(
      (d) =>
        stripVietnameseDiacritics(d.path) === normalizedTarget ||
        stripVietnameseDiacritics(d.name) === normalizedTarget
    ) ??
    departments.find(
      (d) =>
        normalizedTarget.includes(stripVietnameseDiacritics(d.name)) ||
        stripVietnameseDiacritics(d.path).includes(normalizedTarget)
    ) ??
    null
  );
}

function buildReadableSummary(params: {
  title: string;
  departmentLabel: string | null;
  categoryName: string;
  priority: RequestPriority;
}): string {
  const cleanTitle = params.title.trim().replace(/\s+/g, ' ').slice(0, 90);
  const deptText = params.departmentLabel || 'phòng ban phụ trách';
  const priorityTag =
    params.priority === 'URGENT'
      ? 'Mức KHẨN CẤP'
      : params.priority === 'HIGH'
        ? 'Mức ƯU TIÊN CAO'
        : 'Mức bình thường';
  return `${priorityTag}: "${cleanTitle}" phù hợp tuyến ${deptText} (${params.categoryName}).`;
}

/**
 * Bộ suy luận Ngữ nghĩa Tiếng Việt giữ dấu (đọc hồ sơ & từ khóa từ config/ai/assistant-config.json).
 * Chống nhầm đồng âm bỏ dấu ("muốn" != "mượn", "kỷ" != "ký", "đang" != "đăng").
 */
export function analyzeRequestWithRuleEngine(
  input: AiTriageInput
): Omit<AiTriageSuggestion, 'latency_ms'> {
  const aiCfg = loadAiConfig();
  const diacriticStopwords = new Set(aiCfg.diacritic_stopwords);
  const accentlessStopwords = new Set(aiCfg.accentless_ambiguous_stopwords);

  const combinedRaw = `${input.title || ''} ${input.description || ''}`.trim();
  const diacriticText = toPaddedDiacriticTokens(combinedRaw);
  const accentlessText = toPaddedAsciiTokens(combinedRaw);

  const diaTokens = tokenizeDiacriticAware(combinedRaw, diacriticStopwords);
  const diaTokenSet = new Set(diaTokens);
  const diaBigramSet = new Set(extractBigrams(diaTokens));
  const safeAsciiTokenSet = new Set(
    tokenizeAccentlessSafe(combinedRaw, accentlessStopwords)
  );

  const matchedKeywords = new Set<string>();
  let bestDomain: AiDomainProfileConfig | null = null;
  let bestDomainScore = 0;

  for (const profile of aiCfg.domain_profiles) {
    const hits = findKeywordsInText(diacriticText, accentlessText, profile.keywords);
    const weightedScore = hits.reduce(
      (sum, kw) => sum + (kw.trim().includes(' ') ? 3 : 2),
      0
    );
    if (weightedScore > bestDomainScore) {
      bestDomainScore = weightedScore;
      bestDomain = profile;
    }
    for (const hit of hits) {
      matchedKeywords.add(hit);
    }
  }

  // 1. Chấm điểm từng danh mục đang bật trong PostgreSQL (giữ dấu tiếng Việt, không cộng điểm ảo từ từ đồng âm)
  const activeCategories = input.categories.filter((c) => c.is_active !== false);
  let bestCategory: RequestCategoryEntity | null = null;
  let bestCategoryScore = 0;

  for (const category of activeCategories) {
    let score = 0;
    const catComposite = `${category.name} ${category.department}`;
    const catDiaTokens = tokenizeDiacriticAware(catComposite, diacriticStopwords);
    const catDiaBigrams = extractBigrams(catDiaTokens);
    const catSafeAsciiTokens = tokenizeAccentlessSafe(
      `${category.code} ${category.name}`,
      accentlessStopwords
    );

    let directOverlap = 0;
    for (const bigram of catDiaBigrams) {
      if (diaBigramSet.has(bigram)) {
        score += 5;
        directOverlap += 5;
      }
    }
    for (const token of catDiaTokens) {
      if (diaTokenSet.has(token)) {
        score += 3;
        directOverlap += 3;
      }
    }
    for (const token of catSafeAsciiTokens) {
      if (safeAsciiTokenSet.has(token)) {
        score += 1;
        directOverlap += 1;
      }
    }

    const domainMatched =
      bestDomain !== null &&
      doesEntityMatchHints(`${category.code} ${category.name} ${category.department}`, [
        ...bestDomain.categoryHints,
        ...bestDomain.departmentHints,
      ]);
    if (domainMatched) {
      score += 4 + Math.min(bestDomainScore, 6);
    }

    // Yêu cầu phải có tín hiệu thật từ nội dung hoặc domain rõ ràng
    const hasMeaningfulSignal = directOverlap >= 4 || (domainMatched && bestDomainScore >= 2);
    if (hasMeaningfulSignal && score > bestCategoryScore) {
      bestCategoryScore = score;
      bestCategory = category;
    }
  }

  // 2. Chấm điểm các Group/Phòng ban thực tế từ Keycloak (LOẠI BỎ hoàn toàn nhóm "Lớp" và "Lớp/*")
  const realDepartments = filterRealDepartments(input.departments);
  let bestDepartment: DepartmentGroupItem | null = null;
  let bestDeptScore = 0;

  for (const dept of realDepartments) {
    let score = 0;
    const deptComposite = `${dept.name} ${dept.path} ${dept.display_label}`;
    const diaDeptName = normalizeKeepDiacritics(dept.name);
    const asciiDeptName = stripVietnameseDiacritics(dept.name);
    const asciiDeptPath = stripVietnameseDiacritics(dept.path);

    if (
      diaDeptName &&
      matchesVietnamesePhrase(diacriticText, accentlessText, dept.name)
    ) {
      score += 7;
      matchedKeywords.add(dept.name);
    } else if (
      asciiDeptPath &&
      asciiDeptPath.length >= 3 &&
      matchesVietnamesePhrase(diacriticText, accentlessText, dept.path)
    ) {
      score += 5;
    }

    for (const token of tokenizeDiacriticAware(deptComposite, diacriticStopwords)) {
      if (diaTokenSet.has(token)) {
        score += 2;
      }
    }

    if (bestDomain && doesEntityMatchHints(deptComposite, bestDomain.departmentHints)) {
      score += 6 + Math.min(bestDomainScore, 6);
    }

    if (
      bestCategory &&
      (stripVietnameseDiacritics(bestCategory.department) === asciiDeptPath ||
        asciiDeptPath.startsWith(`${stripVietnameseDiacritics(bestCategory.department)}/`) ||
        stripVietnameseDiacritics(bestCategory.department) === asciiDeptName)
    ) {
      score += 4;
    }

    if (score > bestDeptScore) {
      bestDeptScore = score;
      bestDepartment = dept;
    }
  }

  if (!bestDepartment && bestCategory) {
    bestDepartment = findMatchingDepartment(realDepartments, bestCategory.department);
  }

  // Bảo đảm tính nhất quán Phòng ban <-> Danh mục
  if (bestDepartment && bestCategory) {
    const normDept = stripVietnameseDiacritics(bestDepartment.path);
    const normCatDept = stripVietnameseDiacritics(bestCategory.department);
    const sameDept =
      normCatDept === normDept ||
      normDept.startsWith(`${normCatDept}/`) ||
      normCatDept.startsWith(`${normDept}/`);
    if (!sameDept) {
      const deptCategories = activeCategories.filter(
        (c) =>
          stripVietnameseDiacritics(c.department) === normDept ||
          normDept.startsWith(`${stripVietnameseDiacritics(c.department)}/`)
      );
      bestCategory = deptCategories[0] ?? null;
    }
  }

  if (bestDepartment && !bestCategory && bestDomainScore >= 2) {
    const normDept = stripVietnameseDiacritics(bestDepartment.path);
    const deptCategories = activeCategories.filter(
      (c) =>
        stripVietnameseDiacritics(c.department) === normDept ||
        normDept.startsWith(`${stripVietnameseDiacritics(c.department)}/`)
    );
    // Chỉ tự gắn danh mục nếu có ít nhất 1 từ khóa trùng với danh mục của phòng đó, ngược lại giữ OTHER
    const matchingDeptCat = deptCategories.find((cat) => {
      const tokens = tokenizeDiacriticAware(cat.name, diacriticStopwords);
      return tokens.some((t) => diaTokenSet.has(t));
    });
    bestCategory = matchingDeptCat ?? null;
  }

  // 3. Phân tích mức độ ưu tiên từ config ngoài
  const urgentHits = findKeywordsInText(
    diacriticText,
    accentlessText,
    aiCfg.priority_keywords.urgent
  );
  const highHits = findKeywordsInText(
    diacriticText,
    accentlessText,
    aiCfg.priority_keywords.high
  );
  for (const hit of [...urgentHits, ...highHits]) {
    matchedKeywords.add(hit);
  }

  let suggestedPriority: RequestPriority = 'NORMAL';
  if (urgentHits.length > 0) {
    suggestedPriority = 'URGENT';
  } else if (highHits.length > 0) {
    suggestedPriority = 'HIGH';
  }

  const suggestedDeptPath = bestDepartment?.path ?? bestCategory?.department ?? null;
  const suggestedDeptLabel =
    bestDepartment?.display_label ??
    (suggestedDeptPath ? suggestedDeptPath.split('/').join(' / ') : null);
  const suggestedCategoryCode = bestCategory?.code ?? 'OTHER';
  const suggestedCategoryName = bestCategory?.name ?? 'Yêu cầu khác';

  const totalSignal =
    Math.min(bestDomainScore, 6) +
    (bestCategoryScore > 0 ? 2 : 0) +
    (bestDeptScore > 0 ? 2 : 0);
  const confidence =
    totalSignal === 0
      ? 0.45
      : Math.min(0.96, Math.max(0.55, Number((0.52 + totalSignal * 0.045).toFixed(2))));

  const reasonParts: string[] = [];
  if (bestDomain) {
    reasonParts.push(`Nhận diện nhóm nghiệp vụ "${bestDomain.label}"`);
  }
  if (matchedKeywords.size > 0) {
    const preview = Array.from(matchedKeywords).slice(0, 4).join(', ');
    reasonParts.push(`khớp cụm từ [${preview}]`);
  }
  if (suggestedDeptLabel) {
    reasonParts.push(`phù hợp phòng ban "${suggestedDeptLabel}"`);
  }
  if (bestCategory?.requires_evidence) {
    reasonParts.push('danh mục này khuyến nghị đính kèm minh chứng');
  }
  if (reasonParts.length === 0) {
    reasonParts.push('Chưa có từ khóa chuyên biệt trùng khớp, nên chọn phòng ban phù hợp thủ công');
  }

  return {
    suggested_department: suggestedDeptPath,
    suggested_department_label: suggestedDeptLabel,
    suggested_category_code: suggestedCategoryCode,
    suggested_category_name: suggestedCategoryName,
    suggested_priority: suggestedPriority,
    confidence,
    summary: buildReadableSummary({
      title: input.title,
      departmentLabel: suggestedDeptLabel,
      categoryName: suggestedCategoryName,
      priority: suggestedPriority,
    }),
    reason: `${reasonParts.join('; ')}.`,
    keywords_matched: Array.from(matchedKeywords).slice(0, 6),
    provider: 'rule-nlp-engine',
  };
}

interface OllamaRawResult {
  department_path?: string;
  category_code?: string;
  priority?: string;
  summary?: string;
  reason?: string;
}

function buildOllamaPrompt(input: AiTriageInput): string {
  const aiCfg = loadAiConfig();
  const realDepartments = filterRealDepartments(input.departments);
  const deptLines = realDepartments
    .slice(0, 25)
    .map((d) => `- "${d.path}" (${d.display_label})`)
    .join('\n');
  const catLines = input.categories
    .filter((c) => c.is_active !== false)
    .slice(0, 30)
    .map((c) => `- "${c.code}": ${c.name} [Phòng: ${c.department}]`)
    .join('\n');

  return renderPromptTemplate(aiCfg.prompts.triage_prompt_template, {
    departments_list: deptLines || '- (Chưa có danh sách phòng ban)',
    categories_list: catLines || '- "OTHER": Yêu cầu khác',
    title: input.title,
    description: input.description || '(Không có)',
  });
}

export class AiTriageService {
  async suggestTriage(
    input: AiTriageInput,
    options?: {
      fetchImpl?: typeof fetch;
      aiEnabled?: boolean;
      ollamaUrl?: string;
      ollamaModel?: string;
      timeoutMs?: number;
    }
  ): Promise<AiTriageSuggestion> {
    const start = Date.now();
    const ruleBaseline = analyzeRequestWithRuleEngine(input);

    const enabled = options?.aiEnabled ?? config.ai.enabled;
    const ollamaUrl = (options?.ollamaUrl ?? config.ai.ollamaUrl).replace(/\/+$/, '');
    const ollamaModel = options?.ollamaModel ?? config.ai.ollamaModel;
    const timeoutMs = options?.timeoutMs ?? config.ai.timeoutMs;
    const fetchFn = options?.fetchImpl ?? fetch;

    if (!enabled || !ollamaUrl) {
      return {
        ...ruleBaseline,
        latency_ms: Math.max(1, Date.now() - start),
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: buildOllamaPrompt(input),
          format: 'json',
          stream: false,
          options: { temperature: 0.1, num_predict: 200 },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}`);
      }

      const envelope = (await response.json()) as { response?: string };
      if (!envelope.response) {
        throw new Error('Empty Ollama response');
      }

      const parsed = JSON.parse(envelope.response) as OllamaRawResult;
      const realDepartments = filterRealDepartments(input.departments);

      const matchedDept = parsed.department_path
        ? findMatchingDepartment(realDepartments, parsed.department_path)
        : null;
      const suggestedDeptPath =
        matchedDept?.path ?? ruleBaseline.suggested_department;
      const suggestedDeptLabel =
        matchedDept?.display_label ??
        (suggestedDeptPath ? suggestedDeptPath.split('/').join(' / ') : null);

      const normalizedCode = (parsed.category_code || '').trim().toUpperCase();
      const matchedCat = input.categories.find(
        (c) => c.code.toUpperCase() === normalizedCode && c.is_active !== false
      );
      const suggestedCategoryCode =
        matchedCat?.code ?? ruleBaseline.suggested_category_code;
      const suggestedCategoryName =
        matchedCat?.name ?? ruleBaseline.suggested_category_name;

      const rawPriority = (parsed.priority || '').trim().toUpperCase();
      const suggestedPriority: RequestPriority =
        rawPriority === 'URGENT' || rawPriority === 'HIGH' || rawPriority === 'NORMAL'
          ? rawPriority
          : ruleBaseline.suggested_priority;

      return {
        suggested_department: suggestedDeptPath,
        suggested_department_label: suggestedDeptLabel,
        suggested_category_code: suggestedCategoryCode,
        suggested_category_name: suggestedCategoryName,
        suggested_priority: suggestedPriority,
        confidence: 0.92,
        summary:
          parsed.summary?.trim() ||
          buildReadableSummary({
            title: input.title,
            departmentLabel: suggestedDeptLabel,
            categoryName: suggestedCategoryName,
            priority: suggestedPriority,
          }),
        reason: parsed.reason?.trim() || ruleBaseline.reason,
        keywords_matched: ruleBaseline.keywords_matched,
        provider: 'ollama',
        model: ollamaModel,
        latency_ms: Math.max(1, Date.now() - start),
      };
    } catch {
      return {
        ...ruleBaseline,
        latency_ms: Math.max(1, Date.now() - start),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Tạo tóm tắt nhanh (< 2ms) luôn bám sát đúng Phòng ban & Danh mục thực tế của đơn.
   */
  buildFastInsight(input: FastInsightInput): AiTriageSuggestion {
    const start = Date.now();
    const base = analyzeRequestWithRuleEngine(input);
    const activeCat = input.currentCategoryCode
      ? input.categories.find(
          (c) => c.code.toUpperCase() === input.currentCategoryCode?.toUpperCase()
        )
      : undefined;

    const deptPath = input.currentDepartment ?? base.suggested_department;
    const deptLabel = deptPath ? deptPath.split('/').join(' / ') : base.suggested_department_label;
    const categoryCode = activeCat?.code ?? input.currentCategoryCode ?? base.suggested_category_code;
    const categoryName = activeCat?.name ?? (categoryCode === 'OTHER' ? 'Yêu cầu khác' : base.suggested_category_name);
    const priority = input.currentPriority ?? base.suggested_priority;

    return {
      ...base,
      suggested_department: deptPath,
      suggested_department_label: deptLabel,
      suggested_category_code: categoryCode,
      suggested_category_name: categoryName,
      suggested_priority: priority,
      summary: buildReadableSummary({
        title: input.title,
        departmentLabel: deptLabel,
        categoryName,
        priority,
      }),
      reason: deptLabel
        ? `Yêu cầu đang được tiếp nhận tại tuyến "${deptLabel}" (${categoryName}).`
        : base.reason,
      latency_ms: Math.max(1, Date.now() - start),
    };
  }
}

export const aiTriageService = new AiTriageService();

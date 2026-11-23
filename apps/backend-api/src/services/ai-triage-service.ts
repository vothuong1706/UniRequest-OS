// SPDX-License-Identifier: Apache-2.0
import { config } from '../config/environment.js';
import {
  AiTriageSuggestion,
  DepartmentGroupItem,
  RequestCategoryEntity,
  RequestPriority,
} from '../types/request.js';

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

interface DomainProfile {
  id: string;
  label: string;
  departmentHints: string[];
  categoryHints: string[];
  keywords: string[];
}

const DOMAIN_PROFILES: readonly DomainProfile[] = [
  {
    id: 'FINANCE',
    label: 'Tài chính & Kế toán',
    departmentHints: ['ketoan', 'ke toan', 'tai chinh', 'hoc phi'],
    categoryHints: ['tuition', 'scholarship', 'hoc phi', 'hoc bong', 'ke toan', 'ketoan'],
    keywords: [
      'hoc phi',
      'mien giam',
      'hoc bong',
      'bien lai',
      'hoa don',
      'thanh toan',
      'chuyen khoan',
      'hoan tien',
      'no hoc phi',
      'gia han dong tien',
      'dong hoc phi',
      'le phi',
      'ke toan',
      'tai chinh',
      'rut tien',
    ],
  },
  {
    id: 'STUDENT_AFFAIRS',
    label: 'Công tác Sinh viên & KTX',
    departmentHints: ['ctsv', 'cong tac sinh vien', 'ktx', 'ky tuc xa', 'sinh vien'],
    categoryHints: ['certificate', 'enrollment', 'dorm', 'ctsv', 'xac nhan', 'ky tuc xa'],
    keywords: [
      'xac nhan sinh vien',
      'giay xac nhan',
      'vay von',
      'the sinh vien',
      'diem ren luyen',
      'bao hiem y te',
      'bhyt',
      'ky tuc xa',
      'ktx',
      'noi tru',
      'hoan nghia vu',
      'tro cap xa hoi',
      'cong tac sinh vien',
      'ctsv',
      'tam tru',
      'khen thuong',
    ],
  },
  {
    id: 'ACADEMIC',
    label: 'Đào tạo & Khảo thí',
    departmentHints: ['daotao', 'dao tao', 'khao thi', 'hoc vu', 'khoa'],
    categoryHints: ['academic', 'grade', 'phuc khao', 'tin chi', 'dao tao', 'bang diem'],
    keywords: [
      'tin chi',
      'dang ky mon',
      'hoc phan',
      'bang diem',
      'phuc khao',
      'lich thi',
      'hoan thi',
      'bao luu',
      'tot nghiep',
      'thuc tap',
      'khoa luan',
      'do an',
      'chuyen nganh',
      'hoc lai',
      'cai thien diem',
      'thoi khoa bieu',
      'dao tao',
      'khao thi',
      'diem thi',
    ],
  },
  {
    id: 'FACILITY',
    label: 'Cơ sở vật chất & Thiết bị',
    departmentHints: ['csvc', 'co so vat chat', 'thiet bi', 'quan tri', 'hanh chinh'],
    categoryHints: ['facility', 'room', 'thiet bi', 'co so vat chat', 'muon phong', 'sua chua'],
    keywords: [
      'may chieu',
      'dieu hoa',
      'may lanh',
      'quat',
      'bong den',
      'mat dien',
      'chap dien',
      'ro ri',
      'vo kinh',
      'ban ghe',
      'micro',
      'am thanh',
      'phong hoc',
      'hoi truong',
      'muon phong',
      've sinh',
      'thang may',
      'khoa cua',
      'hong hoc',
      'sua chua',
      'co so vat chat',
      'thiet bi',
      'ngap nuoc',
    ],
  },
  {
    id: 'IT_SUPPORT',
    label: 'Hỗ trợ CNTT & Hệ thống',
    departmentHints: ['cntt', 'cong nghe thong tin', 'it', 'trung tam'],
    categoryHints: ['it_account', 'cntt', 'tai khoan', 'he thong', 'mang'],
    keywords: [
      'wifi',
      'mang internet',
      'tai khoan',
      'mat khau',
      'email',
      'sso',
      'keycloak',
      'lms',
      'portal',
      'cong thong tin',
      'phan mem',
      'may tinh',
      'loi dang nhap',
      'cap lai mat khau',
      'cntt',
    ],
  },
];

const URGENT_KEYWORDS: readonly string[] = [
  'khan cap',
  'khan',
  'gap lam',
  'ngay lap tuc',
  'ngay trong ngay',
  'chay no',
  'chap dien',
  'nguy hiem',
  'ro ri nuoc',
  'ngap nuoc',
  'vo kinh',
  'mat dien',
  'khong the thi',
  'han chot hom nay',
  'sap het han',
  'su co nghiem trong',
];

const HIGH_KEYWORDS: readonly string[] = [
  'uu tien',
  'gap',
  'som nhat',
  'nhanh',
  'tuan nay',
  'quan trong',
  'vay von',
  'hoc bong',
  'phuc khao',
  'tot nghiep',
  'hoan thi',
  'mien giam',
  'khong dang nhap duoc',
  'hong may chieu',
  'loi thanh toan',
];

/**
 * Chuẩn hóa chuỗi tiếng Việt (bỏ dấu NFD, chuyển đ -> d, chữ thường) để so khớp ổn định.
 */
export function normalizeVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'xin',
  'cho',
  'cua',
  'gui',
  'lam',
  'can',
  'nho',
  'voi',
  'tai',
  'yeu',
  'cau',
  'bao',
  'cap',
  'nop',
  'don',
  'trong',
  'nay',
  'sau',
  'khi',
  've',
  'va',
  'hoac',
  'em',
  'toi',
  'sinh',
  'vien',
]);

function tokenizeNormalized(input: string): string[] {
  return normalizeVietnamese(input)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function findKeywordsInText(
  normalizedText: string,
  candidates: readonly string[]
): string[] {
  return candidates.filter((kw) => normalizedText.includes(kw));
}

function doesEntityMatchHints(entityText: string, hints: readonly string[]): boolean {
  const normalized = normalizeVietnamese(entityText);
  return hints.some((hint) => normalized.includes(hint));
}

function findMatchingDepartment(
  departments: DepartmentGroupItem[],
  departmentText?: string | null
): DepartmentGroupItem | null {
  if (!departmentText) return null;
  const normalizedTarget = normalizeVietnamese(departmentText.replace(/^\/+/, ''));
  return (
    departments.find(
      (d) =>
        normalizeVietnamese(d.path) === normalizedTarget ||
        normalizeVietnamese(d.name) === normalizedTarget
    ) ??
    departments.find(
      (d) =>
        normalizedTarget.includes(normalizeVietnamese(d.name)) ||
        normalizeVietnamese(d.path).includes(normalizedTarget)
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
 * Bộ suy luận Ngữ nghĩa Tiếng Việt nội bộ (Deterministic Rule-NLP Engine).
 * Luôn sẵn sàng < 5ms ngay cả khi không bật Ollama hoặc máy chấm thi không có GPU.
 */
export function analyzeRequestWithRuleEngine(
  input: AiTriageInput
): Omit<AiTriageSuggestion, 'latency_ms'> {
  const combinedRaw = `${input.title || ''} ${input.description || ''}`.trim();
  const normalizedText = normalizeVietnamese(combinedRaw);
  const inputTokens = new Set(tokenizeNormalized(combinedRaw));

  const matchedKeywords = new Set<string>();
  let bestDomain: DomainProfile | null = null;
  let bestDomainScore = 0;

  for (const profile of DOMAIN_PROFILES) {
    const hits = findKeywordsInText(normalizedText, profile.keywords);
    if (hits.length > bestDomainScore) {
      bestDomainScore = hits.length;
      bestDomain = profile;
    }
    for (const hit of hits) {
      matchedKeywords.add(hit);
    }
  }

  // 1. Chấm điểm từng danh mục đang bật trong PostgreSQL
  const activeCategories = input.categories.filter((c) => c.is_active !== false);
  let bestCategory: RequestCategoryEntity | null = null;
  let bestCategoryScore = 0;

  for (const category of activeCategories) {
    let score = 0;
    const catComposite = `${category.code} ${category.name} ${category.department}`;
    const catTokens = tokenizeNormalized(catComposite);

    for (const token of catTokens) {
      if (inputTokens.has(token)) {
        score += 2;
      }
    }

    if (
      bestDomain &&
      doesEntityMatchHints(catComposite, [
        ...bestDomain.categoryHints,
        ...bestDomain.departmentHints,
      ])
    ) {
      score += 4 + bestDomainScore;
    }

    if (score > bestCategoryScore) {
      bestCategoryScore = score;
      bestCategory = category;
    }
  }

  // 2. Chấm điểm các Group/Phòng ban thực tế từ Keycloak
  let bestDepartment: DepartmentGroupItem | null = null;
  let bestDeptScore = 0;

  for (const dept of input.departments) {
    let score = 0;
    const deptComposite = `${dept.name} ${dept.path} ${dept.display_label}`;
    const normDeptName = normalizeVietnamese(dept.name);
    const normDeptPath = normalizeVietnamese(dept.path);

    if (normDeptName && normalizedText.includes(normDeptName)) {
      score += 6;
      matchedKeywords.add(normDeptName);
    } else if (normDeptPath && normalizedText.includes(normDeptPath)) {
      score += 5;
    }

    for (const token of tokenizeNormalized(deptComposite)) {
      if (inputTokens.has(token)) {
        score += 2;
      }
    }

    if (bestDomain && doesEntityMatchHints(deptComposite, bestDomain.departmentHints)) {
      score += 5 + bestDomainScore;
    }

    if (
      bestCategory &&
      (normalizeVietnamese(bestCategory.department) === normDeptPath ||
        normDeptPath.startsWith(`${normalizeVietnamese(bestCategory.department)}/`))
    ) {
      score += 4;
    }

    if (score > bestDeptScore) {
      bestDeptScore = score;
      bestDepartment = dept;
    }
  }

  if (!bestDepartment && bestCategory) {
    bestDepartment = findMatchingDepartment(input.departments, bestCategory.department);
  }

  // Bảo đảm tính nhất quán Phòng ban <-> Danh mục (tránh gợi ý danh mục của phòng khác)
  if (bestDepartment && bestCategory) {
    const normDept = normalizeVietnamese(bestDepartment.path);
    const normCatDept = normalizeVietnamese(bestCategory.department);
    const sameDept =
      normCatDept === normDept ||
      normDept.startsWith(`${normCatDept}/`) ||
      normCatDept.startsWith(`${normDept}/`);
    if (!sameDept) {
      const deptCategories = activeCategories.filter(
        (c) =>
          normalizeVietnamese(c.department) === normDept ||
          normDept.startsWith(`${normalizeVietnamese(c.department)}/`)
      );
      bestCategory = deptCategories[0] ?? null;
    }
  }

  // Nếu tìm được phòng ban trước nhưng chưa tìm được danh mục cụ thể, chọn danh mục thuộc phòng ban đó
  if (bestDepartment && !bestCategory) {
    const deptCategories = activeCategories.filter(
      (c) =>
        normalizeVietnamese(c.department) === normalizeVietnamese(bestDepartment.path) ||
        normalizeVietnamese(bestDepartment.path).startsWith(
          `${normalizeVietnamese(c.department)}/`
        )
    );
    bestCategory = deptCategories[0] ?? null;
  }

  // 3. Phân tích mức độ ưu tiên
  const urgentHits = findKeywordsInText(normalizedText, URGENT_KEYWORDS);
  const highHits = findKeywordsInText(normalizedText, HIGH_KEYWORDS);
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
    bestDomainScore + (bestCategoryScore > 0 ? 2 : 0) + (bestDeptScore > 0 ? 2 : 0);
  const confidence = Math.min(0.96, Math.max(0.56, Number((0.56 + totalSignal * 0.05).toFixed(2))));

  const reasonParts: string[] = [];
  if (bestDomain) {
    reasonParts.push(`Nhận diện nhóm nghiệp vụ "${bestDomain.label}"`);
  }
  if (matchedKeywords.size > 0) {
    const preview = Array.from(matchedKeywords).slice(0, 4).join(', ');
    reasonParts.push(`khớp từ khóa [${preview}]`);
  }
  if (suggestedDeptLabel) {
    reasonParts.push(`đề xuất chuyển "${suggestedDeptLabel}"`);
  }
  if (bestCategory?.requires_evidence) {
    reasonParts.push('lưu ý danh mục này khuyến nghị đính kèm minh chứng');
  }
  if (reasonParts.length === 0) {
    reasonParts.push('Phân tích ngữ nghĩa tổng quát từ tiêu đề và mô tả yêu cầu');
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
  const deptLines = input.departments
    .slice(0, 25)
    .map((d) => `- "${d.path}" (${d.display_label})`)
    .join('\n');
  const catLines = input.categories
    .filter((c) => c.is_active !== false)
    .slice(0, 30)
    .map((c) => `- "${c.code}": ${c.name} [Phòng: ${c.department}]`)
    .join('\n');

  return [
    'Bạn là trợ lý phân tuyến yêu cầu hành chính đại học (UniRequest-OS).',
    'Hãy chọn ĐÚNG 1 department_path trong danh sách sau (hoặc null nếu không chắc):',
    deptLines || '- (Chưa có danh sách phòng ban)',
    '',
    'Hãy chọn ĐÚNG 1 category_code trong danh sách sau (hoặc "OTHER"):',
    catLines || '- "OTHER": Yêu cầu khác',
    '',
    'Yêu cầu của sinh viên/cán bộ:',
    `Tiêu đề: ${input.title}`,
    `Mô tả: ${input.description || '(Không có)'}`,
    '',
    'Trả về DUY NHẤT JSON hợp lệ theo schema:',
    '{"department_path":"...","category_code":"...","priority":"NORMAL|HIGH|URGENT","summary":"tóm tắt 1 câu tiếng Việt","reason":"lý do ngắn tiếng Việt"}',
  ].join('\n');
}

export class AiTriageService {
  /**
   * Phân tích đề xuất phân tuyến Hybrid: ưu tiên Ollama nội bộ (timeout ngắn 3.5s),
   * tự động fallback mượt sang Bộ suy luận Ngữ nghĩa Tiếng Việt nếu Ollama chưa bật.
   */
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
          options: { temperature: 0.1 },
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

      // Chống ảo giác LLM: luôn đối chiếu lại với Keycloak Groups & PostgreSQL Categories thực tế
      const matchedDept = parsed.department_path
        ? findMatchingDepartment(input.departments, parsed.department_path)
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
   * Tạo thẻ phân tích nhanh (< 2ms) dùng cho màn hình Chi tiết yêu cầu của Cán bộ.
   */
  buildFastInsight(input: FastInsightInput): AiTriageSuggestion {
    const start = Date.now();
    const base = analyzeRequestWithRuleEngine(input);
    const activeCat = input.currentCategoryCode
      ? input.categories.find(
          (c) => c.code.toUpperCase() === input.currentCategoryCode?.toUpperCase()
        )
      : undefined;

    const deptLabel = input.currentDepartment
      ? input.currentDepartment.split('/').join(' / ')
      : base.suggested_department_label;

    return {
      ...base,
      suggested_department: input.currentDepartment ?? base.suggested_department,
      suggested_department_label: deptLabel,
      suggested_category_code: activeCat?.code ?? base.suggested_category_code,
      suggested_category_name: activeCat?.name ?? base.suggested_category_name,
      suggested_priority: input.currentPriority ?? base.suggested_priority,
      latency_ms: Math.max(1, Date.now() - start),
    };
  }
}

export const aiTriageService = new AiTriageService();

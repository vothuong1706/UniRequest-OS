// SPDX-License-Identifier: Apache-2.0
import {
  AiAssistantHistoryTurn,
  AiAssistantIntent,
  DepartmentGroupItem,
  RequestStatus,
} from '../types/request.js';
import { loadAiConfig } from '../utils/ai-config-loader.js';
import {
  extractSearchKeywordFromQuestion,
  hasVietnameseDiacritics,
  matchesVietnamesePhrase,
  normalizeKeepDiacritics,
  stripVietnameseDiacritics,
  toPaddedAsciiTokens,
  toPaddedDiacriticTokens,
} from '../utils/text-vector.js';
import { isStudentClassGroup } from './ai-triage-service.js';

export type AssistantGoal =
  | 'GREETING_OR_HELP'
  | 'CLARIFY'
  | 'ROUTING_GUIDE'
  | 'OVERDUE_SLA'
  | 'COUNT_SENDERS'
  | 'TOP_SENDER'
  | 'TOP_CATEGORY'
  | 'FILTER_LIST'
  | 'TEXT_SEARCH'
  | 'GENERAL_STATS';

export interface AssistantQuestionIntent {
  goal: AssistantGoal;
  intent: AiAssistantIntent;
  statusFilter: RequestStatus | null;
  departmentFilter: string | null;
  senderGroupFilter: string | null;
  senderFilter: string | null;
  daysFilter: number | null;
  onlyOverdue: boolean;
  onlyUrgent: boolean;
  wantsStats: boolean;
  wantsSenders: boolean;
  wantsTopSender: boolean;
  wantsTopCategory: boolean;
  wantsRoutingHelp: boolean;
  isGreetingOrHelp: boolean;
  isPromptInjection: boolean;
  hasDomainKeywordHit: boolean;
  hasExistingRequestRef: boolean;
  hasExplicitSearchVerb: boolean;
  inheritedFromHistory: boolean;
  extractedKeyword: string;
}

const EXPLICIT_CONTACT_ROUTING_PHRASES = [
  'hỏi ai',
  'hỏi ở đâu',
  'báo ai',
  'báo cho ai',
  'báo ở đâu',
  'liên hệ ai',
  'liên hệ đâu',
  'gặp ai',
  'đi đâu',
  'gửi đâu',
  'gửi vào đâu',
  'gửi cho ai',
  'gửi tới ai',
  'gửi ban nào',
  'gửi phòng nào',
  'phòng ban nào',
  'phòng nào',
  'bộ phận nào',
  'thuộc ban nào',
  'thuộc phòng nào',
  'nộp ở đâu',
  'nộp cho ai',
  'phản ánh ở đâu',
  'phản ánh cho ai',
  'phản ánh với ai',
  'chọn mục nào',
  'chọn loại nào',
] as const;

const PROMPT_INJECTION_ASCII_PATTERNS: RegExp[] = [
  /bo qua (?:moi|tat ca|cac)?\s*(?:huong dan|chi dan|quy tac)/i,
  /ignore (?:all |any )?(?:previous|prior) instructions?/i,
  /(?:in|xuat|hien thi|show|dump)\s+(?:cau truc bang|schema|system prompt|prompt he thong|database|csdl)/i,
  /(?:drop\s+table|select\s+\*\s+from|union\s+select)/i,
  /(?:tat ca|toan bo)\s+(?:don|ho so|du lieu)\s+(?:cua\s+)?(?:cac\s+)?(?:phong|ban)\s+khac/i,
];

export function isPromptInjectionQuestion(question: string): boolean {
  const ascii = stripVietnameseDiacritics(question || '');
  if (!ascii) return false;
  return PROMPT_INJECTION_ASCII_PATTERNS.some((re) => re.test(ascii));
}

function parseDaysFromQuestion(question: string): number | null {
  const norm = normalizeKeepDiacritics(question);
  const target = hasVietnameseDiacritics(norm) ? norm : stripVietnameseDiacritics(norm);
  if (/(?:hôm nay|trong ngày|hom nay|trong ngay)/u.test(target)) return 1;
  if (/(?:tuần này|tuần qua|7 ngày|tuan nay|tuan qua|7 ngay)/u.test(target)) return 7;
  if (/(?:tháng này|tháng qua|30 ngày|thang nay|thang qua|30 ngay)/u.test(target)) return 30;
  const match = target.match(/(\d{1,3})\s*(?:ngày|ngay)/u);
  if (match) {
    const days = Number(match[1]);
    if (Number.isFinite(days) && days > 0 && days <= 365) {
      return days;
    }
  }
  return null;
}

function detectEntityFilters(
  question: string,
  departments: DepartmentGroupItem[],
  availableSenderGroups: string[],
  availableSenders: string[],
  scopeType?: 'ALL' | 'DEPARTMENT' | 'PERSONAL'
): {
  senderGroupFilter: string | null;
  departmentFilter: string | null;
  senderFilter: string | null;
} {
  const dia = toPaddedDiacriticTokens(question);
  const ascii = toPaddedAsciiTokens(question);

  let senderGroupFilter: string | null = null;
  for (const grp of availableSenderGroups) {
    if (matchesVietnamesePhrase(dia, ascii, grp)) {
      senderGroupFilter = grp;
      break;
    }
  }

  // Chỉ nhận diện departmentFilter trên Phòng ban tiếp nhận thật (LOẠI BỎ nhóm cha "Lớp" và "Lớp/*")
  // Nếu user là Cán bộ thuộc 1 Ban (DEPARTMENT), không lọc sang Ban khác khi truy vấn dữ liệu trong Ban mình.
  let departmentFilter: string | null = null;
  if (!senderGroupFilter && scopeType !== 'DEPARTMENT') {
    for (const dept of departments) {
      if (isStudentClassGroup(dept)) continue;
      if (
        matchesVietnamesePhrase(dia, ascii, dept.name) ||
        matchesVietnamesePhrase(dia, ascii, dept.path)
      ) {
        departmentFilter = dept.path;
        break;
      }
    }
  }

  let senderFilter: string | null = null;
  const sortedSenders = [...availableSenders].sort((a, b) => b.length - a.length);
  for (const username of sortedSenders) {
    const cleanUser = username.trim();
    if (!cleanUser || cleanUser.length < 3) continue;
    if (cleanUser.toLowerCase() === 'sinhvien') {
      const explicitUserRe = new RegExp(
        `(?:tài khoản|user|của|bạn)\\s+${cleanUser}(?:\\s|$|[?!.,])`,
        'iu'
      );
      if (!explicitUserRe.test(question)) continue;
    }
    if (matchesVietnamesePhrase(dia, ascii, cleanUser)) {
      senderFilter = cleanUser;
      break;
    }
  }

  return { senderGroupFilter, departmentFilter, senderFilter };
}

export function isShortFollowUpQuestion(question: string): boolean {
  const norm = normalizeKeepDiacritics(question);
  const ascii = stripVietnameseDiacritics(question);
  const wordCount = ascii.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0 || wordCount > 8) return false;

  // Câu độc lập tự đủ phạm vi / chủ thể -> KHÔNG kế thừa ngữ cảnh lượt trước (chống History Bleed)
  if (
    /(?:co bao nhieu sinh vien|bao nhieu sinh vien|bao nhieu nguoi|may sinh vien|ai gui nhieu|loai yeu cau nao|ban minh|phong minh|toan truong|cua toi|cua em|he thong|hoi ai|gui phong nao|gui ban nao|phong ban nao|di dau|o dau)/i.test(
      ascii
    )
  ) {
    return false;
  }

  // 1. Có tín hiệu hồi chỉ / nối tiếp rõ ràng (cả tiếng Việt có dấu lẫn không dấu)
  const hasExplicitAnaphora =
    /(?:^|\s)(?:cái nào|cai nao|thì sao|thi sao|trong đó|trong do|trong số đó|trong so do|nhóm đó|nhom do|lớp đó|lop do|ban đó|ban do|phòng đó|phong do|người đó|nguoi do|bạn đó|mấy cái|may cai|cụ thể hơn|cu the hon|chi tiết hơn|chi tiet hon)(?:\s|$|[?!.,])/iu.test(
      norm
    ) ||
    /(?:^|\s)(?:còn|con)\s+/iu.test(norm);
  if (hasExplicitAnaphora) return true;

  // 2. Câu tỉnh lược siêu ngắn (<= 4 từ) chỉ chứa bộ lọc trạng thái / ưu tiên
  if (wordCount <= 4) {
    return /(?:chua duyet|cho duyet|da duyet|tu choi|qua han|khan cap|bao nhieu don|may don)/i.test(
      ascii
    );
  }

  return false;
}

export function detectAssistantQuestionIntent(input: {
  question: string;
  history?: AiAssistantHistoryTurn[];
  scopeType?: 'ALL' | 'DEPARTMENT' | 'PERSONAL';
  departments: DepartmentGroupItem[];
  availableSenderGroups: string[];
  availableSenders?: string[];
}): AssistantQuestionIntent {
  const aiCfg = loadAiConfig();
  const question = input.question || '';
  const dia = toPaddedDiacriticTokens(question);
  const ascii = toPaddedAsciiTokens(question);
  const normQuestion = normalizeKeepDiacritics(question);

  const hasAny = (list?: readonly string[]) =>
    Boolean(list && list.some((kw) => matchesVietnamesePhrase(dia, ascii, kw)));

  const isPromptInjection = isPromptInjectionQuestion(question);
  const wantsStats = hasAny(aiCfg.intent_keywords.stats);
  const wantsTopCategory = hasAny(aiCfg.intent_keywords.top_category);
  const wantsTopSender =
    !wantsTopCategory && hasAny(aiCfg.intent_keywords.top_sender);
  const wantsSenders =
    !wantsTopCategory && (hasAny(aiCfg.intent_keywords.senders) || wantsTopSender);
  const wantsApproved = hasAny(aiCfg.intent_keywords.approved);
  const wantsPending = hasAny(aiCfg.intent_keywords.pending);
  const wantsRejected = hasAny(aiCfg.intent_keywords.rejected);
  const onlyOverdue = hasAny(aiCfg.intent_keywords.overdue);
  const onlyUrgent = hasAny(aiCfg.intent_keywords.urgent);
  const rawRoutingHelp = hasAny(aiCfg.intent_keywords.routing_help);
  const explicitContactRouting = hasAny(EXPLICIT_CONTACT_ROUTING_PHRASES);
  const hasExistingRequestRef = hasAny(aiCfg.intent_keywords.existing_request_refs);
  const rawGreeting = hasAny(aiCfg.intent_keywords.greeting);
  const daysFilter = parseDaysFromQuestion(question);

  const isAccentlessQuestion = !hasVietnameseDiacritics(normQuestion);
  const asciiQuestion = stripVietnameseDiacritics(question);
  const hasExplicitSearchVerb =
    /(?:^|\s)(?:tìm|tra cứu|liệt kê|xem đơn|xem hồ sơ|kiểm tra đơn|kiểm tra các yêu cầu|có chữ)(?:\s|$)/u.test(
      normQuestion
    ) ||
    (isAccentlessQuestion &&
      /(?:^|\s)(?:tim|tra cuu|liet ke|xem don|xem ho so|kiem tra don|kiem tra cac yeu cau|co chu)(?:\s|$)/i.test(
        asciiQuestion
      ));

  let statusFilter: RequestStatus | null = null;
  const statusMentionCount =
    Number(wantsApproved) + Number(wantsPending) + Number(wantsRejected);
  if (statusMentionCount === 1) {
    if (wantsApproved) statusFilter = 'APPROVED';
    else if (wantsPending) statusFilter = 'PENDING';
    else if (wantsRejected) statusFilter = 'REJECTED';
  }

  // Câu hỏi liên hệ / hỏi ai / gửi phòng nào rõ ràng được ưu tiên hướng dẫn thủ tục,
  // tránh bị cướp nhánh bởi wantsSenders (VD: "Muốn hỏi sinh viên lớp nào đó thì hỏi ai").
  const blockedFromRouting =
    isPromptInjection ||
    hasExplicitSearchVerb ||
    hasExistingRequestRef ||
    Boolean(statusFilter) ||
    statusMentionCount > 0 ||
    onlyOverdue ||
    wantsStats ||
    wantsTopSender ||
    wantsTopCategory;

  const wantsRoutingHelp =
    !blockedFromRouting &&
    (explicitContactRouting || (rawRoutingHelp && !wantsSenders));

  const availableSenders = input.availableSenders ?? [];
  let { senderGroupFilter, departmentFilter, senderFilter } = wantsRoutingHelp
    ? { senderGroupFilter: null, departmentFilter: null, senderFilter: null }
    : detectEntityFilters(
        question,
        input.departments,
        input.availableSenderGroups,
        availableSenders,
        input.scopeType
      );

  // Multi-turn: chỉ kế thừa bộ lọc lớp / phòng ban / người gửi từ lượt user gần nhất khi hỏi nối tiếp ngắn
  let inheritedFromHistory = false;
  if (
    !senderGroupFilter &&
    !departmentFilter &&
    !senderFilter &&
    !wantsRoutingHelp &&
    !rawGreeting &&
    !isPromptInjection &&
    Array.isArray(input.history) &&
    input.history.length > 0 &&
    isShortFollowUpQuestion(question)
  ) {
    const recentUserTurns = input.history
      .filter((t) => t.role === 'user' && t.content.trim().length > 0)
      .slice(-2)
      .reverse();
    for (const prev of recentUserTurns) {
      const prevEntities = detectEntityFilters(
        prev.content,
        input.departments,
        input.availableSenderGroups,
        availableSenders,
        input.scopeType
      );
      if (
        prevEntities.senderGroupFilter ||
        prevEntities.departmentFilter ||
        prevEntities.senderFilter
      ) {
        senderGroupFilter = prevEntities.senderGroupFilter;
        departmentFilter = prevEntities.departmentFilter;
        senderFilter = prevEntities.senderFilter;
        inheritedFromHistory = true;
        break;
      }
    }
  }

  const hasDomainKeywordHit =
    aiCfg.domain_profiles.some(
      (profile) =>
        hasAny(profile.keywords) ||
        hasAny(profile.departmentHints) ||
        hasAny(profile.categoryHints)
    ) ||
    aiCfg.department_directory.some((entry) => hasAny(entry.aliases));

  const mentionsRequestNoun =
    /(?:^|\s)(?:đơn|hồ sơ|yêu cầu|biên lai|hóa đơn)(?:\s|$)/u.test(normQuestion) ||
    (isAccentlessQuestion &&
      /(?:^|\s)(?:don|ho so|yeu cau|bien lai|hoa don)(?:\s|$)/i.test(asciiQuestion));
  const effectiveDaysFilter =
    daysFilter !== null &&
    (mentionsRequestNoun ||
      hasExplicitSearchVerb ||
      hasExistingRequestRef ||
      hasDomainKeywordHit ||
      wantsStats ||
      wantsSenders ||
      Boolean(statusFilter) ||
      onlyOverdue ||
      onlyUrgent ||
      Boolean(senderGroupFilter) ||
      Boolean(departmentFilter) ||
      Boolean(senderFilter))
      ? daysFilter
      : null;

  const hasConcreteDomainSignal = Boolean(
    statusMentionCount > 0 ||
      onlyOverdue ||
      onlyUrgent ||
      wantsStats ||
      wantsSenders ||
      wantsTopCategory ||
      wantsRoutingHelp ||
      senderGroupFilter ||
      departmentFilter ||
      senderFilter ||
      effectiveDaysFilter !== null ||
      hasExistingRequestRef
  );

  const wordCount = normQuestion.split(/\s+/).filter(Boolean).length;
  const isGreetingOrHelp =
    !isPromptInjection && rawGreeting && !hasConcreteDomainSignal && wordCount <= 12;

  const excludeTerms = [
    senderGroupFilter,
    departmentFilter,
    senderFilter,
    senderGroupFilter ? `lớp ${senderGroupFilter}` : null,
    departmentFilter ? `phòng ban ${departmentFilter}` : null,
    departmentFilter ? `ban ${departmentFilter}` : null,
  ].filter((t): t is string => Boolean(t));

  const extractedKeyword = extractSearchKeywordFromQuestion(question, excludeTerms);

  let goal: AssistantGoal = 'CLARIFY';
  let intent: AiAssistantIntent = 'ROUTING_HELP';

  if (isPromptInjection) {
    goal = 'CLARIFY';
    intent = 'ROUTING_HELP';
  } else if (isGreetingOrHelp) {
    goal = 'GREETING_OR_HELP';
    intent = 'ROUTING_HELP';
  } else if (wantsRoutingHelp) {
    goal = 'ROUTING_GUIDE';
    intent = 'ROUTING_HELP';
  } else if (onlyOverdue) {
    goal = 'OVERDUE_SLA';
    intent = 'OVERDUE_AUDIT';
  } else if (wantsTopCategory) {
    goal = 'TOP_CATEGORY';
    intent = 'STATS';
  } else if (wantsTopSender) {
    goal = 'TOP_SENDER';
    intent = 'STATS';
  } else if (wantsSenders) {
    goal = 'COUNT_SENDERS';
    intent = 'STATS';
  } else if (wantsStats) {
    goal =
      senderGroupFilter ||
      departmentFilter ||
      senderFilter ||
      statusFilter ||
      effectiveDaysFilter
        ? 'FILTER_LIST'
        : 'GENERAL_STATS';
    intent = 'STATS';
  } else if (
    statusFilter ||
    onlyUrgent ||
    departmentFilter ||
    senderGroupFilter ||
    senderFilter ||
    effectiveDaysFilter !== null
  ) {
    goal = 'FILTER_LIST';
    intent = 'STATUS_FILTER';
  } else if (
    hasExplicitSearchVerb ||
    hasExistingRequestRef ||
    (hasDomainKeywordHit && extractedKeyword.length >= 2) ||
    (mentionsRequestNoun && extractedKeyword.length >= 2)
  ) {
    goal = 'TEXT_SEARCH';
    intent = 'SEMANTIC_SEARCH';
  }

  return {
    goal,
    intent,
    statusFilter,
    departmentFilter,
    senderGroupFilter,
    senderFilter,
    daysFilter: effectiveDaysFilter,
    onlyOverdue,
    onlyUrgent,
    wantsStats,
    wantsSenders,
    wantsTopSender,
    wantsTopCategory,
    wantsRoutingHelp,
    isGreetingOrHelp,
    isPromptInjection,
    hasDomainKeywordHit,
    hasExistingRequestRef,
    hasExplicitSearchVerb,
    inheritedFromHistory,
    extractedKeyword,
  };
}

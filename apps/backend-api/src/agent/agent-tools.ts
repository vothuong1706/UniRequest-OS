// SPDX-License-Identifier: Apache-2.0
import {
  AiAssistantDepartmentGroup,
  AiAssistantDepartmentStat,
  AiAssistantHistoryTurn,
  AiAssistantIntent,
  AiAssistantMatchedRequest,
  AiAssistantRecommendedCategory,
  AiAssistantResponse,
  AiAssistantSenderSummary,
  DepartmentGroupItem,
  RequestCategoryEntity,
  RequestPriority,
  RequestStatus,
} from '../types/request.js';
import {
  AiDepartmentDirectoryEntry,
  loadAiConfig,
} from '../utils/ai-config-loader.js';
import {
  hasVietnameseDiacritics,
  matchesVietnamesePhrase,
  normalizeKeepDiacritics,
  scoreRequestByFields,
  scoreVietnameseRelevance,
  stripVietnameseDiacritics,
  toPaddedAsciiTokens,
  toPaddedDiacriticTokens,
} from '../utils/text-vector.js';
import {
  AssistantGoal,
  AssistantQuestionIntent,
  detectAssistantQuestionIntent,
} from '../services/assistant-query-intent.js';
import {
  analyzeRequestWithRuleEngine,
  filterRealDepartments,
  isStudentClassGroup,
} from '../services/ai-triage-service.js';

export interface EnrichedScopedRequest extends AiAssistantMatchedRequest {
  description: string | null;
  reviewed_at: string | null;
  docText: string;
}

export interface AgentToolContext {
  scopeType: 'ALL' | 'DEPARTMENT' | 'PERSONAL';
  defaultGroupMode: 'sender_group' | 'department';
  username: string;
  userDepartments: string[];
  question: string;
  history?: AiAssistantHistoryTurn[];
  enrichedRequests: EnrichedScopedRequest[];
  departments: DepartmentGroupItem[];
  categories: RequestCategoryEntity[];
  nowMs: number;
}

export interface AgentToolExecutionResult {
  toolName: string;
  summaryForLlm: Record<string, unknown>;
  groupedRequests?: AiAssistantDepartmentGroup[];
  departmentStats?: AiAssistantDepartmentStat[];
  sendersSummary?: AiAssistantSenderSummary[];
  recommendedCategories?: AiAssistantRecommendedCategory[];
  showMetrics?: boolean;
  metrics?: AiAssistantResponse['metrics'];
  intent?: AiAssistantIntent;
  canonicalAnswer?: string;
}

export interface ParsedQueryFilters {
  goal: AssistantGoal;
  department?: string;
  senderGroup?: string;
  sender?: string;
  status?: RequestStatus;
  priority?: RequestPriority;
  days?: number;
  hasAttachment?: boolean;
  onlyOverdue: boolean;
  onlyUrgent: boolean;
  keyword: string;
  wantsStatsFromQuestion: boolean;
  inheritedFromHistory: boolean;
}

function normalizeLabelKey(value?: string | null, fallback = 'Chưa gắn nhóm'): string {
  const clean = (value || '').trim().replace(/^\/+/, '');
  return clean || fallback;
}

function matchesFuzzyFilter(actual?: string | null, filter?: string): boolean {
  if (!filter || !filter.trim()) return true;
  const normFilter = stripVietnameseDiacritics(filter.replace(/^\/+/, ''));
  const normActual = stripVietnameseDiacritics((actual || '').replace(/^\/+/, ''));
  if (!normActual) return false;
  return (
    normActual === normFilter ||
    normActual.includes(normFilter) ||
    normFilter.includes(normActual)
  );
}

function statusLabel(status: RequestStatus): string {
  if (status === 'APPROVED') return 'Đã duyệt';
  if (status === 'REJECTED') return 'Từ chối';
  return 'Chờ duyệt';
}

function priorityLabel(priority: RequestPriority): string {
  if (priority === 'URGENT') return 'Khẩn cấp';
  if (priority === 'HIGH') return 'Ưu tiên cao';
  return 'Bình thường';
}

function normalizeStatus(value: unknown): RequestStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const upper = value.trim().toUpperCase();
  return upper === 'PENDING' || upper === 'APPROVED' || upper === 'REJECTED'
    ? (upper as RequestStatus)
    : undefined;
}

function normalizePriority(value: unknown): RequestPriority | undefined {
  if (typeof value !== 'string') return undefined;
  const upper = value.trim().toUpperCase();
  return ['NORMAL', 'HIGH', 'URGENT'].includes(upper)
    ? (upper as RequestPriority)
    : undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean || undefined;
}

function normalizeDays(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

export function availableSenderGroupsOf(items: EnrichedScopedRequest[]): string[] {
  return Array.from(
    new Set(
      items
        .map((r) => r.sender_group)
        .filter((g): g is string => Boolean(g && g.trim()))
    )
  );
}

export function availableSendersOf(items: EnrichedScopedRequest[]): string[] {
  return Array.from(
    new Set(
      items
        .map((r) => r.created_by)
        .filter((u): u is string => Boolean(u && u.trim()))
    )
  );
}

export function detectContextIntent(ctx: AgentToolContext): AssistantQuestionIntent {
  return detectAssistantQuestionIntent({
    question: ctx.question,
    history: ctx.history,
    scopeType: ctx.scopeType,
    departments: ctx.departments,
    availableSenderGroups: availableSenderGroupsOf(ctx.enrichedRequests),
    availableSenders: availableSendersOf(ctx.enrichedRequests),
  });
}

/**
 * Gom nhóm danh sách hồ sơ thực tế theo:
 * - 'sender_group' (Lớp / Nhóm người gửi: K11A1, k11A2...) khi Cán bộ/Giảng viên xem đơn trong Ban mình.
 * - 'department' (Phòng ban tiếp nhận: KETOAN, CTSV...) khi Sinh viên xem đơn gửi đi nhiều Ban.
 * Chỉ tạo nhóm cho các lớp/ban thực sự có >= 1 hồ sơ.
 */
export function groupRequestsByMode(
  items: AiAssistantMatchedRequest[],
  mode: 'sender_group' | 'department'
): AiAssistantDepartmentGroup[] {
  const map = new Map<
    string,
    AiAssistantDepartmentGroup & { _senders: Set<string> }
  >();

  for (const item of items) {
    const key =
      mode === 'sender_group'
        ? normalizeLabelKey(item.sender_group, 'Chưa gắn lớp')
        : normalizeLabelKey(item.target_department, 'Chưa phân phòng ban');

    let group = map.get(key);
    if (!group) {
      group = {
        department: key,
        group_kind: mode,
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        urgent: 0,
        overdue_sla: 0,
        unique_senders: 0,
        requests: [],
        _senders: new Set<string>(),
      };
      map.set(key, group);
    }

    group.total += 1;
    if (item.created_by) group._senders.add(item.created_by);
    if (item.status === 'APPROVED') group.approved += 1;
    else if (item.status === 'REJECTED') group.rejected += 1;
    else group.pending += 1;

    if (item.priority === 'URGENT' && item.status === 'PENDING') group.urgent += 1;
    if (item.sla_overdue) group.overdue_sla += 1;
    group.requests.push(item);
  }

  return Array.from(map.values())
    .map(({ _senders, ...rest }) => ({
      ...rest,
      unique_senders: _senders.size,
    }))
    .sort((a, b) => {
      if (b.overdue_sla !== a.overdue_sla) return b.overdue_sla - a.overdue_sla;
      if (b.pending !== a.pending) return b.pending - a.pending;
      if (b.total !== a.total) return b.total - a.total;
      return a.department.localeCompare(b.department, 'vi');
    });
}

export function computeGroupStats(
  items: AiAssistantMatchedRequest[],
  mode: 'sender_group' | 'department'
): AiAssistantDepartmentStat[] {
  return groupRequestsByMode(items, mode).map((g) => ({
    department: g.department,
    group_kind: g.group_kind,
    total: g.total,
    approved: g.approved,
    pending: g.pending,
    rejected: g.rejected,
    urgent: g.urgent,
    overdue_sla: g.overdue_sla,
    unique_senders: g.unique_senders,
  }));
}

export function computeSendersSummary(
  items: AiAssistantMatchedRequest[]
): AiAssistantSenderSummary[] {
  const map = new Map<string, AiAssistantSenderSummary>();
  for (const item of items) {
    const username = item.created_by || 'unknown';
    let entry = map.get(username);
    if (!entry) {
      entry = {
        username,
        sender_group: item.sender_group ?? null,
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        overdue_sla: 0,
      };
      map.set(username, entry);
    }
    if (!entry.sender_group && item.sender_group) {
      entry.sender_group = item.sender_group;
    }
    entry.total += 1;
    if (item.status === 'APPROVED') entry.approved += 1;
    else if (item.status === 'REJECTED') entry.rejected += 1;
    else entry.pending += 1;
    if (item.sla_overdue) entry.overdue_sla += 1;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.username.localeCompare(b.username, 'vi');
  });
}

export function computeAvgResolutionHours(
  items: EnrichedScopedRequest[]
): number | null {
  const durations: number[] = [];
  for (const item of items) {
    if (!item.reviewed_at) continue;
    const diffMs =
      new Date(item.reviewed_at).getTime() - new Date(item.created_at).getTime();
    if (diffMs >= 0) {
      durations.push(diffMs / 3600000);
    }
  }
  if (durations.length === 0) return null;
  const avg = durations.reduce((s, v) => s + v, 0) / durations.length;
  return Number(avg.toFixed(1));
}

function toPublicMatchedRequest(
  item: EnrichedScopedRequest,
  similarityScore: number
): AiAssistantMatchedRequest {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    category: item.category,
    category_name: item.category_name,
    target_department: item.target_department,
    sender_group: item.sender_group,
    created_by: item.created_by,
    created_at: item.created_at,
    review_note: item.review_note,
    has_attachment: item.has_attachment,
    sla_hours: item.sla_hours,
    elapsed_hours: item.elapsed_hours,
    sla_overdue: item.sla_overdue,
    similarity_score: similarityScore,
  };
}

function emptyMetrics(): AiAssistantResponse['metrics'] {
  return {
    total: 0,
    unique_senders: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    urgent: 0,
    overdue_sla: 0,
    avg_resolution_hours: null,
  };
}

/**
 * Xây câu trả lời ngắn gọn, lịch sự cho câu chào hỏi / hỏi khả năng trợ lý (không tìm hồ sơ rác).
 */
export function buildGreetingHelpResponse(
  ctx: AgentToolContext
): Omit<AiAssistantResponse, 'latency_ms'> {
  const aiCfg = loadAiConfig();
  const isPersonal = ctx.scopeType === 'PERSONAL';
  const answer = isPersonal
    ? [
        `Xin chào ${ctx.username}! Tôi là Trợ lý AI của UniRequest.`,
        'Bạn có thể hỏi tôi 3 nhóm việc chính:',
        '- Tra cứu hướng dẫn thủ tục: "Tôi muốn xin giấy xác nhận sinh viên thì đi đâu?"',
        '- Thống kê & theo dõi đơn của bạn: "Tôi có bao nhiêu hồ sơ đã duyệt và chờ duyệt?"',
        '- Tìm nhanh hồ sơ theo nội dung: "Tìm đơn hóa đơn học phí của tôi"',
      ].join('\n')
    : [
        `Xin chào ${ctx.username}! Tôi là Trợ lý AI của UniRequest (${scopeDescription(ctx)}).`,
        'Bạn có thể hỏi tôi 3 nhóm việc chính:',
        '- Thống kê sinh viên & lớp gửi: "Có bao nhiêu sinh viên gửi yêu cầu?" hoặc "Ai gửi nhiều đơn nhất?"',
        '- Rà soát tiến độ & SLA: "Có đơn nào quá hạn SLA không?" hoặc "Lớp K11A1 có đơn nào chưa duyệt?"',
        '- Hướng dẫn phòng ban tiếp nhận: "Muốn báo lỗi cơ sở vật chất hỏi ai?"',
      ].join('\n');

  return {
    answer,
    scope: ctx.scopeType,
    intent: 'ROUTING_HELP',
    group_by_mode: ctx.defaultGroupMode,
    show_metrics: false,
    metrics: emptyMetrics(),
    senders_summary: [],
    department_stats: [],
    grouped_requests: [],
    matched_requests: [],
    recommended_categories: [],
    follow_up_suggestions: isPersonal
      ? aiCfg.quick_prompts.student.slice(0, 3)
      : aiCfg.quick_prompts.staff.slice(0, 3),
    scoped_count: ctx.enrichedRequests.length,
  };
}

/**
 * Phản hồi lịch sự cho câu hỏi mơ hồ, ngoài phạm vi hệ thống đại học hoặc yêu cầu truy cập trái phép.
 * KHÔNG chạy TEXT_SEARCH rác và KHÔNG hiển thị bảng KPI 0 hồ sơ.
 */
export function buildClarifyResponse(
  ctx: AgentToolContext,
  options?: { isPromptInjection?: boolean }
): Omit<AiAssistantResponse, 'latency_ms'> {
  const aiCfg = loadAiConfig();
  const isPersonal = ctx.scopeType === 'PERSONAL';

  const answer = options?.isPromptInjection
    ? [
        `Tôi chỉ hỗ trợ tra cứu hồ sơ hợp lệ trong phạm vi ${scopeDescription(ctx)} và hướng dẫn thủ tục phòng ban của UniRequest.`,
        'Tôi không thể cung cấp cấu trúc nội bộ hoặc dữ liệu ngoài quyền truy cập của bạn.',
        isPersonal
          ? 'Bạn có thể hỏi: "Tôi có bao nhiêu hồ sơ đang chờ duyệt?" hoặc "Muốn báo lỗi cơ sở vật chất hỏi ai?"'
          : 'Bạn có thể hỏi: "Có bao nhiêu sinh viên gửi yêu cầu?" hoặc "Có đơn nào quá hạn SLA không?"',
      ].join('\n')
    : isPersonal
      ? [
          'Câu hỏi này hơi chung chung hoặc nằm ngoài phạm vi nghiệp vụ của UniRequest nên tôi chưa thể tra cứu chính xác.',
          'Bạn có thể hỏi rõ hơn theo một trong các hướng sau:',
          '- Hỏi thủ tục & phòng ban: "Muốn báo lỗi cơ sở vật chất hỏi ai?" hoặc "Xin giấy xác nhận sinh viên thì gửi đâu?"',
          '- Kiểm tra hồ sơ của bạn: "Tôi có bao nhiêu hồ sơ đã duyệt và chờ duyệt?"',
          '- Tìm đơn cụ thể: "Tìm đơn hóa đơn học phí của tôi"',
        ].join('\n')
      : [
          'Câu hỏi này hơi chung chung hoặc nằm ngoài phạm vi nghiệp vụ của UniRequest nên tôi chưa thể tra cứu chính xác.',
          'Bạn có thể hỏi rõ hơn theo một trong các hướng sau:',
          '- Thống kê & rà soát đơn: "Có bao nhiêu sinh viên gửi yêu cầu?" hoặc "Lớp K11A1 có đơn nào chưa duyệt?"',
          '- Kiểm tra quá hạn SLA: "Ban mình có đơn nào quá hạn SLA không?"',
          '- Hỏi đầu mối phòng ban: "Muốn báo lỗi cơ sở vật chất hỏi ai?" hoặc "Muốn hỏi sinh viên lớp nào đó thì hỏi ai?"',
        ].join('\n');

  return {
    answer,
    scope: ctx.scopeType,
    intent: 'ROUTING_HELP',
    group_by_mode: ctx.defaultGroupMode,
    show_metrics: false,
    metrics: emptyMetrics(),
    senders_summary: [],
    department_stats: [],
    grouped_requests: [],
    matched_requests: [],
    recommended_categories: [],
    follow_up_suggestions: isPersonal
      ? aiCfg.quick_prompts.student.slice(0, 3)
      : aiCfg.quick_prompts.staff.slice(0, 3),
    scoped_count: ctx.enrichedRequests.length,
  };
}

/**
 * Kết hợp tham số truy vấn (status, priority, only_overdue, department, sender_group, sender, days, keyword)
 * với bộ phân tích mục tiêu tiếng Việt, đảm bảo mọi tham số hợp lệ đều được áp dụng (không bỏ sót).
 */
export function parseQueryFilters(
  args: Record<string, unknown>,
  ctx: AgentToolContext
): ParsedQueryFilters {
  const inferred = detectContextIntent(ctx);

  const senderGroup =
    inferred.senderGroupFilter ?? normalizeString(args.sender_group);

  // Chống lọc nhầm department="Lớp" / "Lớp/*" hoặc sang Ban khác khi Cán bộ đang xem trong đúng Ban của mình
  const rawArgDept = normalizeString(args.department);
  const safeArgDept =
    rawArgDept &&
    stripVietnameseDiacritics(rawArgDept) !== 'lop' &&
    !stripVietnameseDiacritics(rawArgDept).startsWith('lop/') &&
    ctx.scopeType !== 'DEPARTMENT'
      ? rawArgDept
      : undefined;
  const department = senderGroup
    ? safeArgDept
    : (inferred.departmentFilter ?? safeArgDept);
  const sender = inferred.senderFilter ?? normalizeString(args.sender);

  const isPureStatsGoal =
    inferred.goal === 'COUNT_SENDERS' ||
    inferred.goal === 'TOP_SENDER' ||
    inferred.goal === 'TOP_CATEGORY' ||
    inferred.goal === 'GENERAL_STATS';

  const argStatus = !isPureStatsGoal ? normalizeStatus(args.status) : undefined;
  const status = inferred.statusFilter ?? argStatus;

  const argPriority = !isPureStatsGoal ? normalizePriority(args.priority) : undefined;
  const priority = inferred.onlyUrgent ? (argPriority ?? 'URGENT') : argPriority;

  const days = inferred.daysFilter ?? normalizeDays(args.days);
  const argOnlyOverdue =
    !isPureStatsGoal && typeof args.only_overdue === 'boolean'
      ? args.only_overdue
      : false;
  const onlyOverdue = inferred.onlyOverdue || argOnlyOverdue;
  const onlyUrgent = inferred.onlyUrgent || priority === 'URGENT';

  const llmKeyword = normalizeString(args.keyword) ?? '';

  // Bảo toàn cụm chữ người dùng đã gửi mà không làm nhiễu câu thống kê chung
  let keyword = '';
  if (!isPureStatsGoal && !onlyOverdue) {
    if (inferred.goal === 'TEXT_SEARCH') {
      keyword = llmKeyword || inferred.extractedKeyword;
    } else if (llmKeyword) {
      keyword = llmKeyword;
    } else if (
      inferred.hasExistingRequestRef &&
      inferred.extractedKeyword.length >= 4
    ) {
      keyword = inferred.extractedKeyword;
    }
  }

  let resolvedGoal: AssistantGoal = inferred.goal;
  if (onlyOverdue) {
    resolvedGoal = 'OVERDUE_SLA';
  } else if (
    (resolvedGoal === 'TEXT_SEARCH' || resolvedGoal === 'CLARIFY') &&
    !keyword &&
    (status || priority || department || senderGroup || sender || days !== undefined)
  ) {
    resolvedGoal = 'FILTER_LIST';
  } else if (resolvedGoal === 'CLARIFY' && keyword) {
    resolvedGoal = 'TEXT_SEARCH';
  } else if (resolvedGoal === 'CLARIFY') {
    resolvedGoal = 'GENERAL_STATS';
  }

  return {
    goal: resolvedGoal,
    department,
    senderGroup,
    sender,
    status,
    priority,
    days,
    hasAttachment:
      typeof args.has_attachment === 'boolean' ? args.has_attachment : undefined,
    onlyOverdue,
    onlyUrgent,
    keyword,
    wantsStatsFromQuestion: inferred.wantsStats || inferred.wantsSenders,
    inheritedFromHistory: inferred.inheritedFromHistory,
  };
}

function applyCommonFilters(
  items: EnrichedScopedRequest[],
  filters: ParsedQueryFilters,
  nowMs: number
): EnrichedScopedRequest[] {
  return items.filter((r) => {
    if (!matchesFuzzyFilter(r.target_department, filters.department)) return false;
    if (!matchesFuzzyFilter(r.sender_group, filters.senderGroup)) return false;
    if (
      filters.sender &&
      r.created_by.toLowerCase() !== filters.sender.toLowerCase() &&
      !r.created_by.toLowerCase().includes(filters.sender.toLowerCase())
    ) {
      return false;
    }
    if (filters.status && r.status !== filters.status) return false;
    if (filters.priority) {
      if (filters.onlyUrgent && filters.priority === 'URGENT') {
        if (r.priority !== 'URGENT' && r.priority !== 'HIGH') return false;
      } else if (r.priority !== filters.priority) {
        return false;
      }
    }
    if (
      filters.hasAttachment !== undefined &&
      r.has_attachment !== filters.hasAttachment
    ) {
      return false;
    }
    if (filters.onlyOverdue && !r.sla_overdue) return false;
    if (filters.days !== undefined) {
      const cutoff = nowMs - filters.days * 24 * 3600 * 1000;
      if (new Date(r.created_at).getTime() < cutoff) return false;
    }
    return true;
  });
}

function scopeDescription(ctx: AgentToolContext): string {
  if (ctx.scopeType === 'PERSONAL') return `tài khoản của bạn (${ctx.username})`;
  if (ctx.scopeType === 'DEPARTMENT') {
    return ctx.userDepartments.length > 0
      ? `phòng ban ${ctx.userDepartments.join(', ')}`
      : 'phòng ban của bạn';
  }
  return 'toàn trường';
}

function groupLabel(mode: 'sender_group' | 'department'): string {
  return mode === 'sender_group' ? 'lớp / nhóm người gửi' : 'phòng ban tiếp nhận';
}

function formatGroupBreakdown(
  stats: AiAssistantDepartmentStat[],
  limit = 8
): string {
  return stats
    .slice(0, limit)
    .map(
      (g) =>
        `- ${g.department}: ${g.total} hồ sơ (${g.unique_senders} người gửi · ${g.approved} duyệt, ${g.pending} chờ${g.rejected > 0 ? `, ${g.rejected} từ chối` : ''}${g.overdue_sla > 0 ? `, ${g.overdue_sla} quá SLA` : ''})`
    )
    .join('\n');
}

function formatSenderBreakdown(
  senders: AiAssistantSenderSummary[],
  limit = 8
): string {
  return senders
    .slice(0, limit)
    .map(
      (s) =>
        `- ${s.username}${s.sender_group ? ` (${s.sender_group})` : ''}: ${s.total} đơn (${s.approved} duyệt, ${s.pending} chờ${s.rejected > 0 ? `, ${s.rejected} từ chối` : ''})`
    )
    .join('\n');
}

function formatRequestLine(r: AiAssistantMatchedRequest): string {
  const parts = [r.title, statusLabel(r.status)];
  if (r.sender_group) parts.push(`lớp ${r.sender_group}`);
  if (r.target_department) parts.push(r.target_department);
  if (r.sla_overdue) parts.push(`quá hạn SLA (${r.elapsed_hours}h/${r.sla_hours}h)`);
  return `- ${parts.join(' - ')}`;
}

function describeActiveFilters(filters: ParsedQueryFilters): string {
  const parts: string[] = [];
  if (filters.senderGroup) parts.push(`lớp ${filters.senderGroup}`);
  if (filters.department) parts.push(`phòng ban ${filters.department}`);
  if (filters.sender) parts.push(`người gửi ${filters.sender}`);
  if (filters.status) parts.push(`trạng thái "${statusLabel(filters.status)}"`);
  if (filters.priority) {
    parts.push(
      filters.onlyUrgent
        ? 'mức ưu tiên cao / khẩn cấp'
        : `mức "${priorityLabel(filters.priority)}"`
    );
  }
  if (filters.days) parts.push(`trong ${filters.days} ngày gần đây`);
  if (filters.hasAttachment === true) parts.push('có tệp đính kèm');
  if (filters.hasAttachment === false) parts.push('không có tệp đính kèm');
  if (filters.keyword) parts.push(`khớp nội dung "${filters.keyword}"`);
  return parts.join(', ');
}

function buildQueryCanonicalAnswer(params: {
  ctx: AgentToolContext;
  filters: ParsedQueryFilters;
  stats: AiAssistantDepartmentStat[];
  senders: AiAssistantSenderSummary[];
  metrics: AiAssistantResponse['metrics'];
  topRequests: AiAssistantMatchedRequest[];
  scopedPendingTotal: number;
}): string {
  const { ctx, filters, stats, senders, metrics, topRequests, scopedPendingTotal } = params;
  const scope = scopeDescription(ctx);
  const lines: string[] = [];

  // 1. Mục tiêu: Đếm số sinh viên / người gửi
  if (filters.goal === 'COUNT_SENDERS') {
    const filterDesc = describeActiveFilters(filters);
    const contextPrefix = filterDesc ? `${filterDesc} (${scope})` : scope;
    if (metrics.total === 0) {
      lines.push(`Trong phạm vi ${contextPrefix}, hiện chưa có sinh viên / người gửi nào tạo yêu cầu.`);
      return lines.join('\n');
    }
    lines.push(
      `Trong phạm vi ${contextPrefix}, hiện có ${metrics.unique_senders} sinh viên / người gửi đã tạo tổng cộng ${metrics.total} yêu cầu (${metrics.approved} đã duyệt, ${metrics.pending} chờ duyệt${metrics.rejected > 0 ? `, ${metrics.rejected} từ chối` : ''}).`
    );
    if (stats.length > 0) {
      lines.push(`Phân bổ theo ${groupLabel(ctx.defaultGroupMode)}:\n${formatGroupBreakdown(stats)}`);
    }
    if (senders.length > 0) {
      lines.push(`Chi tiết theo người gửi:\n${formatSenderBreakdown(senders)}`);
    }
    return lines.join('\n');
  }

  // 2. Mục tiêu: Ai / lớp nào gửi nhiều đơn nhất
  if (filters.goal === 'TOP_SENDER') {
    const topSender = senders[0];
    if (!topSender) {
      lines.push(`Trong phạm vi ${scope}, hiện chưa có hồ sơ nào để xếp hạng người gửi.`);
      return lines.join('\n');
    }
    const groupText = topSender.sender_group ? ` (lớp ${topSender.sender_group})` : '';
    lines.push(
      `Người gửi nhiều yêu cầu nhất trong phạm vi ${scope} là ${topSender.username}${groupText} với ${topSender.total} hồ sơ (${topSender.approved} duyệt, ${topSender.pending} chờ${topSender.rejected > 0 ? `, ${topSender.rejected} từ chối` : ''}).`
    );
    if (stats.length > 0) {
      const topClass = [...stats].sort((a, b) => b.total - a.total)[0];
      lines.push(
        `Nhóm dẫn đầu theo ${groupLabel(ctx.defaultGroupMode)}: ${topClass.department} (${topClass.total} hồ sơ, ${topClass.unique_senders} người gửi).`
      );
      if (stats.length > 1) {
        lines.push(`Phân bổ chi tiết:\n${formatGroupBreakdown(stats)}`);
      }
    }
    return lines.join('\n');
  }

  // 2b. Mục tiêu: Loại yêu cầu được gửi nhiều nhất & thời gian xử lý trung bình
  if (filters.goal === 'TOP_CATEGORY') {
    if (metrics.total === 0) {
      lines.push(`Trong phạm vi ${scope}, hiện chưa có hồ sơ nào để thống kê loại yêu cầu.`);
      return lines.join('\n');
    }
    const catCount = new Map<string, number>();
    for (const r of topRequests) {
      const label = r.category_name || r.category || 'Yêu cầu khác';
      catCount.set(label, (catCount.get(label) || 0) + 1);
    }
    const rankedCats = Array.from(catCount.entries()).sort((a, b) => b[1] - a[1]);
    const topCat = rankedCats[0];
    const avgText =
      metrics.avg_resolution_hours !== null
        ? `Thời gian xử lý trung bình hiện tại là ${metrics.avg_resolution_hours} giờ.`
        : 'Chưa có hồ sơ đã xử lý xong để tính thời gian xử lý trung bình.';
    lines.push(
      `Trong phạm vi ${scope} (${metrics.total} hồ sơ), loại yêu cầu được gửi nhiều nhất là "${topCat[0]}" (${topCat[1]} hồ sơ). ${avgText}`
    );
    if (rankedCats.length > 1) {
      const breakdown = rankedCats
        .slice(0, 5)
        .map(([name, count]) => `- ${name}: ${count} hồ sơ`)
        .join('\n');
      lines.push(`Phân bổ theo loại yêu cầu:\n${breakdown}`);
    }
    return lines.join('\n');
  }

  // 3. Mục tiêu: Rà soát quá hạn SLA
  if (filters.onlyOverdue || filters.goal === 'OVERDUE_SLA') {
    if (metrics.total === 0) {
      lines.push(`Trong phạm vi ${scope}, hiện không có hồ sơ nào bị quá hạn SLA.`);
      return lines.join('\n');
    }
    lines.push(
      `Trong phạm vi ${scope}, hiện có ${metrics.total} hồ sơ quá hạn SLA trên tổng số ${scopedPendingTotal} hồ sơ đang chờ duyệt.`
    );
    if (stats.length > 0) {
      lines.push(`Phân bổ theo ${groupLabel(ctx.defaultGroupMode)}:\n${formatGroupBreakdown(stats)}`);
    }
    if (topRequests.length > 0) {
      lines.push(`Danh sách hồ sơ quá hạn cần xử lý:\n${topRequests.slice(0, 6).map(formatRequestLine).join('\n')}`);
    }
    return lines.join('\n');
  }

  // 4. Mục tiêu: Tìm theo chữ đã gửi hoặc lọc có điều kiện
  const filterDesc = describeActiveFilters(filters);
  if (filterDesc) {
    const inheritedNote = filters.inheritedFromHistory ? ' (tiếp nối ngữ cảnh câu trước)' : '';
    if (metrics.total === 0) {
      lines.push(`Không tìm thấy hồ sơ nào (${filterDesc}) trong phạm vi ${scope}${inheritedNote}.`);
      return lines.join('\n');
    }
    lines.push(
      `Tìm thấy ${metrics.total} hồ sơ (${filterDesc}) trong phạm vi ${scope}${inheritedNote}: ${metrics.approved} đã duyệt, ${metrics.pending} chờ duyệt${metrics.rejected > 0 ? `, ${metrics.rejected} từ chối` : ''}${ctx.scopeType !== 'PERSONAL' ? `, từ ${metrics.unique_senders} người gửi` : ''}.`
    );
    if (stats.length > 0) {
      lines.push(`Phân bổ theo ${groupLabel(ctx.defaultGroupMode)}:\n${formatGroupBreakdown(stats)}`);
    }
    if (topRequests.length > 0) {
      lines.push(`Hồ sơ phù hợp nhất:\n${topRequests.slice(0, 6).map(formatRequestLine).join('\n')}`);
    }
    return lines.join('\n');
  }

  // 5. Mục tiêu: Thống kê tổng quan
  const rate =
    metrics.total > 0
      ? Math.round(((metrics.approved + metrics.rejected) / metrics.total) * 100)
      : 0;
  const senderClause =
    ctx.scopeType === 'PERSONAL' ? '' : ` từ ${metrics.unique_senders} người gửi`;
  lines.push(
    `Thống kê thực tế trong phạm vi ${scope}: ${metrics.total} hồ sơ${senderClause} (${metrics.approved} đã duyệt, ${metrics.pending} chờ duyệt, ${metrics.rejected} từ chối · tỷ lệ xử lý ${rate}%${metrics.avg_resolution_hours !== null ? ` · thời gian xử lý TB ${metrics.avg_resolution_hours}h` : ''}${metrics.overdue_sla > 0 ? ` · ${metrics.overdue_sla} quá hạn SLA` : ''}).`
  );
  if (stats.length > 0) {
    lines.push(`Chi tiết theo ${groupLabel(ctx.defaultGroupMode)}:\n${formatGroupBreakdown(stats)}`);
  }
  return lines.join('\n');
}

function executeQueryRequests(
  args: Record<string, unknown>,
  ctx: AgentToolContext
): AgentToolExecutionResult {
  const aiCfg = loadAiConfig();
  const diacriticStopwords = new Set(aiCfg.diacritic_stopwords);
  const accentlessStopwords = new Set(aiCfg.accentless_ambiguous_stopwords);
  const filters = parseQueryFilters(args, ctx);

  const candidates = applyCommonFilters(ctx.enrichedRequests, filters, ctx.nowMs);
  const scopedPendingTotal = ctx.enrichedRequests.filter(
    (r) => r.status === 'PENDING'
  ).length;

  let keyword = filters.keyword;
  let matchedRows: EnrichedScopedRequest[] = candidates;
  const scoreById = new Map<string, number>();

  if (keyword) {
    const scored = candidates
      .map((row) => ({
        row,
        match: scoreRequestByFields(
          keyword,
          {
            title: row.title,
            category_name: row.category_name,
            description: row.description,
            review_note: row.review_note,
            created_by: row.created_by,
            sender_group: row.sender_group,
            target_department: row.target_department,
          },
          { diacriticStopwords, accentlessStopwords }
        ),
      }))
      .filter((item) => item.match.score >= aiCfg.retrieval.min_keyword_score);

    matchedRows = scored.map((item) => item.row);
    for (const item of scored) scoreById.set(item.row.id, item.match.score);

    if (matchedRows.length === 0 && filters.wantsStatsFromQuestion) {
      keyword = '';
      matchedRows = candidates;
      scoreById.clear();
    }
  }

  const sorted = [...matchedRows].sort((a, b) => {
    if (keyword) {
      const scoreDiff = (scoreById.get(b.id) || 0) - (scoreById.get(a.id) || 0);
      if (scoreDiff !== 0) return scoreDiff;
    }
    if (a.sla_overdue !== b.sla_overdue) return a.sla_overdue ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const topRequests = sorted
    .slice(0, aiCfg.retrieval.top_k)
    .map((row) => toPublicMatchedRequest(row, scoreById.get(row.id) ?? 1));

  const stats = computeGroupStats(
    matchedRows.map((row) => toPublicMatchedRequest(row, 1)),
    ctx.defaultGroupMode
  );
  const allSenders = computeSendersSummary(
    matchedRows.map((row) => toPublicMatchedRequest(row, 1))
  );

  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let urgent = 0;
  let overdueSla = 0;
  for (const row of matchedRows) {
    if (row.status === 'APPROVED') approved += 1;
    else if (row.status === 'REJECTED') rejected += 1;
    else pending += 1;
    if (row.priority === 'URGENT' && row.status === 'PENDING') urgent += 1;
    if (row.sla_overdue) overdueSla += 1;
  }

  const metrics: AiAssistantResponse['metrics'] = {
    total: matchedRows.length,
    unique_senders: allSenders.length,
    approved,
    pending,
    rejected,
    urgent,
    overdue_sla: overdueSla,
    avg_resolution_hours: computeAvgResolutionHours(matchedRows),
  };

  const canonicalAnswer = buildQueryCanonicalAnswer({
    ctx,
    filters: { ...filters, keyword },
    stats,
    senders: allSenders,
    metrics,
    topRequests,
    scopedPendingTotal,
  });

  const hasListIntent = Boolean(
    keyword ||
      filters.status ||
      filters.department ||
      filters.senderGroup ||
      filters.sender ||
      filters.priority ||
      filters.days ||
      filters.hasAttachment !== undefined
  );
  const intent: AiAssistantIntent = filters.onlyOverdue
    ? 'OVERDUE_AUDIT'
    : filters.goal === 'COUNT_SENDERS' ||
        filters.goal === 'TOP_SENDER' ||
        filters.goal === 'TOP_CATEGORY' ||
        filters.goal === 'GENERAL_STATS'
      ? 'STATS'
      : filters.goal === 'TEXT_SEARCH' || keyword
        ? 'SEMANTIC_SEARCH'
        : hasListIntent
          ? 'STATUS_FILTER'
          : 'STATS';

  const showMetrics = filters.goal !== 'TEXT_SEARCH';

  return {
    toolName: 'query_requests',
    groupedRequests: groupRequestsByMode(topRequests, ctx.defaultGroupMode),
    departmentStats: stats,
    sendersSummary: allSenders.slice(0, 10),
    showMetrics,
    metrics,
    intent,
    canonicalAnswer,
    summaryForLlm: {
      goal: filters.goal,
      scope: ctx.scopeType,
      grouped_by: groupLabel(ctx.defaultGroupMode),
      filters_applied: {
        department: filters.department ?? null,
        sender_group: filters.senderGroup ?? null,
        sender: filters.sender ?? null,
        status: filters.status ?? null,
        priority: filters.priority ?? null,
        keyword: keyword || null,
        days: filters.days ?? null,
        only_overdue: filters.onlyOverdue,
        has_attachment: filters.hasAttachment ?? null,
      },
      metrics,
      top_requests: topRequests.slice(0, 8).map((r) => ({
        title: r.title,
        status: statusLabel(r.status),
        priority: priorityLabel(r.priority),
        sender_group: r.sender_group,
        target_department: r.target_department,
        created_by: r.created_by,
        sla_overdue: r.sla_overdue,
      })),
    },
  };
}

function findDirectoryEntry(
  deptPath: string,
  directory: readonly AiDepartmentDirectoryEntry[]
): AiDepartmentDirectoryEntry | undefined {
  const norm = stripVietnameseDiacritics(deptPath.replace(/^\/+/, ''));
  return directory.find(
    (entry) => stripVietnameseDiacritics(entry.department) === norm
  );
}

function findCanonicalDepartment(
  rawDept: string,
  realDepartments: readonly DepartmentGroupItem[]
): DepartmentGroupItem | undefined {
  const norm = stripVietnameseDiacritics(rawDept.replace(/^\/+/, ''));
  if (!norm) return undefined;
  return (
    realDepartments.find(
      (d) =>
        stripVietnameseDiacritics(d.path) === norm ||
        stripVietnameseDiacritics(d.name) === norm
    ) ??
    realDepartments.find(
      (d) =>
        stripVietnameseDiacritics(d.path).includes(norm) ||
        norm.includes(stripVietnameseDiacritics(d.name))
    )
  );
}

const GENERIC_STUDENT_CLASS_KEYWORDS = new Set([
  'quản lý sinh viên',
  'quản lý lớp',
  'danh sách lớp',
  'thông tin lớp',
  'qlsv',
  'ban qlsv',
  'phòng qlsv',
  'phòng khoa học',
]);

function mentionsStudentAndClass(queryText: string): boolean {
  const norm = normalizeKeepDiacritics(queryText);
  const ascii = stripVietnameseDiacritics(queryText);
  const mentionsStudent =
    norm.includes('sinh viên') ||
    /(?:^|\s)sv(?:\s|$|[?!.,])/u.test(norm) ||
    (!hasVietnameseDiacritics(norm) && ascii.includes('sinh vien'));
  const mentionsClass =
    /(?:^|\s)lớp(?:\s|$|[?!.,])/u.test(norm) ||
    (!hasVietnameseDiacritics(norm) && /(?:^|\s)lop(?:\s|$|[?!.,])/i.test(ascii));
  return mentionsStudent && mentionsClass;
}

function formatProcedureBullet(cat: AiAssistantRecommendedCategory): string {
  const evidenceNote = cat.requires_evidence
    ? ', khuyến nghị đính kèm minh chứng'
    : '';
  return `- ${cat.name} (thời hạn xử lý ${cat.sla_hours} giờ${evidenceNote})`;
}

/**
 * Tầng 2A (Hybrid Catalog) + Tầng 3 (Grounded Structured Renderer):
 * Kết hợp danh sách phòng ban thật từ Enum Router (candidate_departments),
 * danh bạ department_directory trong config và danh mục request_categories live.
 */
function executeLookupProcedures(
  args: Record<string, unknown>,
  ctx: AgentToolContext
): AgentToolExecutionResult {
  const aiCfg = loadAiConfig();
  const diacriticStopwords = new Set(aiCfg.diacritic_stopwords);
  const accentlessStopwords = new Set(aiCfg.accentless_ambiguous_stopwords);
  const queryText = normalizeString(args.query) ?? ctx.question;
  const realDepartments = filterRealDepartments(ctx.departments);
  const activeCategories = ctx.categories.filter((c) => c.is_active !== false);

  // 1. Validate candidate_departments từ Enum Router (chỉ chấp nhận phòng ban thật, không nhận Lớp/*)
  const rawCandidates = Array.isArray(args.candidate_departments)
    ? args.candidate_departments.filter((v): v is string => typeof v === 'string')
    : [];
  const routerDepts: DepartmentGroupItem[] = [];
  for (const rawDept of rawCandidates) {
    const matched = findCanonicalDepartment(rawDept, realDepartments);
    if (
      matched &&
      !isStudentClassGroup(matched) &&
      !routerDepts.some((d) => d.path === matched.path)
    ) {
      routerDepts.push(matched);
    }
  }

  // 2. Chấm điểm bổ sung bằng Rule Engine + department_directory aliases (đảm bảo đồng nhất khi offline fallback)
  const triage = analyzeRequestWithRuleEngine({
    title: queryText,
    departments: realDepartments,
    categories: activeCategories,
  });

  const dia = toPaddedDiacriticTokens(queryText);
  const ascii = toPaddedAsciiTokens(queryText);
  const aliasMatchedDepts: DepartmentGroupItem[] = [];
  for (const entry of aiCfg.department_directory) {
    if (entry.aliases.some((alias) => matchesVietnamesePhrase(dia, ascii, alias))) {
      const canonical = findCanonicalDepartment(entry.department, realDepartments);
      if (canonical && !aliasMatchedDepts.some((d) => d.path === canonical.path)) {
        aliasMatchedDepts.push(canonical);
      }
    }
  }

  // 3. Hợp nhất Hybrid Catalog (tối đa 2 phòng ban thật):
  //    - Ưu tiên tuyệt đối dữ liệu thật từ request_categories (live DB) & domain/alias khớp mạnh
  //      để model 3B không bao giờ ghi đè sai thủ tục thật (VD: "học bổng" / "thẻ sinh viên" -> CTSV).
  //    - Khi câu paraphrase tự nhiên chưa có tín hiệu danh mục rõ, tin cậy candidate_departments từ Enum Router.
  const resolvedDepts: DepartmentGroupItem[] = [];
  const pushDept = (dept?: DepartmentGroupItem | null): void => {
    if (!dept || isStudentClassGroup(dept)) return;
    if (resolvedDepts.some((d) => d.path === dept.path)) return;
    if (resolvedDepts.length < 2) resolvedDepts.push(dept);
  };

  // Kiểm tra danh mục live trong PostgreSQL có khớp trực tiếp câu hỏi hay không
  const queryHasDiacritics = hasVietnameseDiacritics(queryText);
  const directCategoryHits = activeCategories
    .map((cat) => {
      const match = scoreVietnameseRelevance(queryText, cat.name, {
        diacriticStopwords,
        accentlessStopwords,
      });
      return {
        cat,
        baseScore: match.score,
        overlap: match.overlap,
        phraseHit: match.phrase_hit,
      };
    })
    .filter(
      (item) =>
        item.baseScore >= 0.42 &&
        (queryHasDiacritics || item.overlap >= 2 || item.phraseHit)
    )
    .sort((a, b) => b.baseScore - a.baseScore);

  const strongCategoryDept = directCategoryHits[0]
    ? findCanonicalDepartment(directCategoryHits[0].cat.department, realDepartments)
    : undefined;

  const strongRuleDept =
    triage.suggested_department &&
    (triage.confidence >= 0.88 || triage.keywords_matched.length >= 2)
      ? findCanonicalDepartment(triage.suggested_department, realDepartments)
      : undefined;

  // Trường hợp đặc thù: Hỏi chung về sinh viên theo lớp ("Muốn hỏi sinh viên lớp nào đó thì hỏi ai"
  // hoặc bản không dấu "muon hoi sinh vien lop nao do thi hoi ai") khi KHÔNG nêu thủ tục/sự cố cụ thể
  // -> tách bạch rõ 2 đầu mối thật: Phòng khoa học và QLSV + CTSV
  const hasSpecificDomainKeyword = triage.keywords_matched.some(
    (kw) => !GENERIC_STUDENT_CLASS_KEYWORDS.has(normalizeKeepDiacritics(kw))
  );
  const generalStudentClass =
    mentionsStudentAndClass(queryText) &&
    !strongCategoryDept &&
    aliasMatchedDepts.length === 0 &&
    !hasSpecificDomainKeyword;

  if (generalStudentClass) {
    pushDept(findCanonicalDepartment('Phòng khoa học và QLSV', realDepartments));
    pushDept(findCanonicalDepartment('CTSV', realDepartments));
  } else if (strongCategoryDept) {
    pushDept(strongCategoryDept);
    // Nếu có danh mục khớp mạnh thứ 2 ở phòng ban khác, bổ sung tối đa 1 phòng ban liên quan thật
    const secondStrongCat = directCategoryHits.find(
      (item) =>
        stripVietnameseDiacritics(item.cat.department) !==
          stripVietnameseDiacritics(strongCategoryDept.path) &&
        item.baseScore >= 0.55
    );
    if (secondStrongCat) {
      pushDept(findCanonicalDepartment(secondStrongCat.cat.department, realDepartments));
    }
  } else if (aliasMatchedDepts.length > 0) {
    for (const d of aliasMatchedDepts) {
      pushDept(d);
    }
  } else if (strongRuleDept) {
    pushDept(strongRuleDept);
    // Chỉ nhận thêm phòng ban thứ 2 từ Router nếu khác phòng chính và có ít nhất 1 danh mục/alias liên quan
    for (const d of routerDepts) {
      if (d.path === strongRuleDept.path) continue;
      const dirEntry = findDirectoryEntry(d.path, aiCfg.department_directory);
      const hasRouterEvidence =
        Boolean(
          dirEntry?.aliases.some((alias) => matchesVietnamesePhrase(dia, ascii, alias))
        ) ||
        activeCategories.some(
          (c) =>
            stripVietnameseDiacritics(c.department) ===
              stripVietnameseDiacritics(d.path) &&
            scoreVietnameseRelevance(queryText, c.name, {
              diacriticStopwords,
              accentlessStopwords,
            }).score >= 0.35
        );
      if (hasRouterEvidence) {
        pushDept(d);
      }
    }
  } else {
    // Câu paraphrase mở ngoài bộ từ khóa: sử dụng trực tiếp candidate_departments từ Enum Router
    for (const d of routerDepts) {
      pushDept(d);
    }
    if (resolvedDepts.length === 0 && triage.suggested_department) {
      pushDept(findCanonicalDepartment(triage.suggested_department, realDepartments));
    }
  }

  // 4. Chọn thủ tục thực tế từ request_categories theo phòng ban đã xác định
  const scoreCategoryForQuery = (
    cat: RequestCategoryEntity
  ): AiAssistantRecommendedCategory & { base_score: number } => {
    const baseScore = scoreVietnameseRelevance(
      queryText,
      `${cat.name} ${cat.department}`,
      { diacriticStopwords, accentlessStopwords }
    ).score;
    let score = baseScore;
    if (
      triage.suggested_category_code !== 'OTHER' &&
      cat.code.toUpperCase() === triage.suggested_category_code.toUpperCase()
    ) {
      score = Math.min(1, score + 0.35);
    }
    if (
      resolvedDepts.some(
        (d) =>
          stripVietnameseDiacritics(d.path) ===
          stripVietnameseDiacritics(cat.department)
      )
    ) {
      score = Math.min(1, score + 0.2);
    }
    return {
      code: cat.code,
      name: cat.name,
      department: cat.department,
      sla_hours: cat.sla_hours,
      requires_evidence: cat.requires_evidence,
      score: Number(score.toFixed(4)),
      base_score: baseScore,
    };
  };

  const categoriesForDept = (
    deptPath: string,
    limit: number
  ): Array<AiAssistantRecommendedCategory & { base_score: number }> => {
    const normDept = stripVietnameseDiacritics(deptPath);
    return activeCategories
      .filter((c) => stripVietnameseDiacritics(c.department) === normDept)
      .map(scoreCategoryForQuery)
      .sort((a, b) => b.score - a.score || a.sla_hours - b.sla_hours)
      .slice(0, limit);
  };

  let recommended: AiAssistantRecommendedCategory[] = [];
  let hasStrongDirectCategoryMatch = false;

  if (resolvedDepts.length >= 2) {
    const combined: AiAssistantRecommendedCategory[] = [];
    for (const dept of resolvedDepts) {
      const deptCats = categoriesForDept(dept.path, 2);
      for (const { base_score: _b, ...cat } of deptCats) {
        if (!combined.some((item) => item.code === cat.code)) {
          combined.push(cat);
        }
      }
    }
    recommended = combined.slice(0, 4);
  } else if (resolvedDepts.length === 1) {
    const primaryDept = resolvedDepts[0];
    const deptCats = categoriesForDept(primaryDept.path, 3);
    if (deptCats.length > 0) {
      hasStrongDirectCategoryMatch = deptCats[0].base_score >= 0.45;
      recommended = deptCats.map(({ base_score: _b, ...rest }) => rest);
    } else {
      recommended = [
        {
          code: 'OTHER',
          name: 'Yêu cầu khác',
          department: primaryDept.path,
          sla_hours: 24,
          requires_evidence: false,
          score: triage.confidence,
        },
      ];
    }
  } else {
    const globalScored = activeCategories
      .map(scoreCategoryForQuery)
      .filter((cat) => cat.base_score >= 0.28)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (globalScored.length > 0) {
      hasStrongDirectCategoryMatch = globalScored[0].base_score >= 0.45;
      recommended = globalScored.map(({ base_score: _b, ...rest }) => rest);
      const inferredDept = findCanonicalDepartment(
        globalScored[0].department,
        realDepartments
      );
      if (inferredDept) pushDept(inferredDept);
    }
  }

  // 5. Tầng 3: Grounded Structured Renderer (tự nhiên, 0% bịa phòng ban, 0% em-dash/en-dash)
  let canonicalAnswer: string;
  const primaryDept = resolvedDepts[0] ?? null;

  if (resolvedDepts.length >= 2) {
    const lines: string[] = [
      'Tùy nội dung bạn cần trao đổi, bạn có thể liên hệ một trong 2 phòng ban phụ trách sau:',
    ];
    resolvedDepts.forEach((dept, idx) => {
      const dirEntry = findDirectoryEntry(dept.path, aiCfg.department_directory);
      const title = dirEntry?.display_name ?? dept.display_label;
      const summary =
        dirEntry?.summary ??
        `Tiếp nhận và xử lý các thủ tục thuộc tuyến ${dept.display_label}.`;
      lines.push(`${idx + 1}. ${title}: ${summary}`);
    });
    if (
      generalStudentClass ||
      /(?:^|\s)(?:lớp|lop)(?:\s|$|[?!.,])/iu.test(normalizeKeepDiacritics(queryText))
    ) {
      lines.push(
        'Nếu bạn muốn tra cứu hồ sơ đã gửi của một lớp cụ thể trong hệ thống, hãy nêu rõ tên lớp (ví dụ: "Lớp K11A1 gửi những đơn nào?").'
      );
    }
    lines.push(
      'Để gửi yêu cầu mới, bạn vào mục "Tạo yêu cầu" và chọn đúng thủ tục hoặc phòng ban tương ứng bên dưới.'
    );
    canonicalAnswer = lines.join('\n');
  } else if (primaryDept) {
    const dirEntry = findDirectoryEntry(primaryDept.path, aiCfg.department_directory);
    const deptDisplay = dirEntry?.display_name ?? primaryDept.display_label;
    const primaryCat = recommended[0];

    if (hasStrongDirectCategoryMatch && primaryCat && primaryCat.code !== 'OTHER') {
      const evidenceText = primaryCat.requires_evidence
        ? 'khuyến nghị đính kèm minh chứng'
        : 'không bắt buộc đính kèm minh chứng';
      const lines = [
        `Với yêu cầu này, bạn hãy gửi tới ${deptDisplay}.`,
        `- Thủ tục phù hợp: "${primaryCat.name}" (thời hạn xử lý ${primaryCat.sla_hours} giờ, ${evidenceText}).`,
        `- Cách gửi: Vào mục "Tạo yêu cầu" và chọn loại "${primaryCat.name}" để đơn tự động chuyển đến ${primaryDept.path}.`,
      ];
      if (recommended.length > 1) {
        lines.push('Các thủ tục liên quan khác của phòng ban này:');
        for (const extra of recommended.slice(1, 3)) {
          lines.push(formatProcedureBullet(extra));
        }
      }
      canonicalAnswer = lines.join('\n');
    } else {
      const lines = [`Yêu cầu này thuộc phạm vi tiếp nhận của ${deptDisplay}.`];
      if (dirEntry?.summary) {
        lines.push(`Phạm vi phụ trách: ${dirEntry.summary}`);
      }
      const realProcs = recommended.filter((c) => c.code !== 'OTHER');
      if (realProcs.length > 0) {
        lines.push(`Các thủ tục hiện có tại ${primaryDept.path}:`);
        for (const proc of realProcs) {
          lines.push(formatProcedureBullet(proc));
        }
        lines.push(
          `Bạn vào mục "Tạo yêu cầu", chọn thủ tục phù hợp ở trên hoặc chọn "Yêu cầu khác" rồi chọn phòng ban tiếp nhận "${primaryDept.path}".`
        );
      } else {
        lines.push(
          `Bạn vào mục "Tạo yêu cầu", chọn "Yêu cầu khác" và chọn phòng ban tiếp nhận "${primaryDept.path}".`
        );
      }
      canonicalAnswer = lines.join('\n');
    }
  } else {
    const deptDirectoryLines = realDepartments.slice(0, 6).map((dept) => {
      const dirEntry = findDirectoryEntry(dept.path, aiCfg.department_directory);
      const label = dirEntry?.display_name ?? dept.display_label;
      return dirEntry?.summary ? `- ${label}: ${dirEntry.summary}` : `- ${label}`;
    });
    canonicalAnswer = [
      'Tôi chưa xác định rõ phòng ban tiếp nhận từ câu hỏi này. Bạn có thể tham khảo các phòng ban hiện có trong hệ thống:',
      ...deptDirectoryLines,
      'Hãy nêu rõ hơn nội dung cần xử lý để tôi gợi ý đúng thủ tục và thời hạn SLA.',
    ].join('\n');
  }

  return {
    toolName: 'lookup_procedures',
    recommendedCategories: recommended,
    showMetrics: false,
    intent: 'ROUTING_HELP',
    canonicalAnswer,
    summaryForLlm: {
      matched_departments: resolvedDepts.map((d) => d.path),
      matched_category_code: recommended[0]?.code ?? triage.suggested_category_code,
      matched_category_name: recommended[0]?.name ?? triage.suggested_category_name,
      recommended_procedures: recommended.map((c) => ({
        category_name: c.name,
        department: c.department,
        sla_hours: c.sla_hours,
        requires_evidence: c.requires_evidence,
      })),
    },
  };
}

export function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: AgentToolContext
): AgentToolExecutionResult {
  if (toolName === 'lookup_procedures') {
    return executeLookupProcedures(args, ctx);
  }
  if (toolName === 'query_requests') {
    return executeQueryRequests(args, ctx);
  }
  return {
    toolName,
    summaryForLlm: {
      error: `Công cụ "${toolName}" không được hỗ trợ.`,
    },
  };
}

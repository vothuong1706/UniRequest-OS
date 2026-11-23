// SPDX-License-Identifier: Apache-2.0
import { query } from '../config/database.js';
import {
  AiAssistantHistoryTurn,
  AiAssistantResponse,
  DepartmentGroupItem,
  KeycloakUser,
  RequestCategoryEntity,
  RequestEntity,
} from '../types/request.js';
import { loadAiConfig } from '../utils/ai-config-loader.js';
import {
  AgentToolContext,
  buildClarifyResponse,
  buildGreetingHelpResponse,
  detectContextIntent,
  EnrichedScopedRequest,
  executeAgentTool,
} from '../agent/agent-tools.js';
import { runUniRequestAgent } from '../agent/agent-runtime.js';
import { sanitizeAgentAnswer } from '../agent/tool-call-recovery.js';
import {
  buildDepartmentMatchSql,
  resolveRequestAccessScope,
} from './request-service.js';

export interface IndexedRequestRow extends RequestEntity {
  category_name: string | null;
  sla_hours: number | null;
}

export interface AssistantEvaluateInput {
  question: string;
  history?: AiAssistantHistoryTurn[];
  user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>;
  scopedRequests: IndexedRequestRow[];
  departments: DepartmentGroupItem[];
  categories: RequestCategoryEntity[];
  now?: Date;
}

/**
 * Ghép văn bản gốc của hồ sơ (CHỈ chứa dữ liệu thực, KHÔNG nhồi từ khóa trạng thái nhân tạo).
 */
export function buildRequestIndexText(
  req: Pick<
    RequestEntity,
    | 'title'
    | 'description'
    | 'category'
    | 'custom_category_label'
    | 'target_department'
    | 'sender_group'
    | 'review_note'
    | 'created_by'
  >,
  categoryName?: string | null
): string {
  return [
    req.title,
    req.description || '',
    categoryName || req.custom_category_label || req.category,
    req.target_department || '',
    req.sender_group || '',
    req.review_note || '',
    req.created_by,
  ]
    .filter((part) => Boolean(part && part.trim()))
    .join(' | ');
}

function enrichScopedRequests(
  scopedRequests: IndexedRequestRow[],
  nowMs: number
): EnrichedScopedRequest[] {
  return scopedRequests.map((req) => {
    const slaHours = Number(req.sla_hours || 24);
    const createdMs = new Date(req.created_at).getTime();
    const elapsedHours = Math.max(
      0,
      Number(((nowMs - createdMs) / 3600000).toFixed(1))
    );
    const isOverdue = req.status === 'PENDING' && elapsedHours > slaHours;
    const categoryName =
      req.category_name ||
      req.custom_category_label ||
      (req.category === 'OTHER' ? 'Yêu cầu khác' : req.category);

    const docText = buildRequestIndexText(req, categoryName);

    return {
      id: req.id,
      title: req.title,
      description: req.description,
      status: req.status,
      priority: req.priority,
      category: req.category,
      category_name: categoryName,
      target_department: req.target_department,
      sender_group: req.sender_group ?? null,
      created_by: req.created_by,
      created_at: new Date(req.created_at).toISOString(),
      reviewed_at: req.reviewed_at ? new Date(req.reviewed_at).toISOString() : null,
      review_note: req.review_note,
      has_attachment: Boolean(req.attachment_url),
      sla_hours: slaHours,
      elapsed_hours: elapsedHours,
      sla_overdue: isOverdue,
      similarity_score: 0,
      docText,
    };
  });
}

/**
 * Lõi suy luận dự phòng đồng nhất 100% với Agent Tools (dùng CHUNG executeAgentTool).
 * Đảm bảo kết quả khi tắt Ollama (máy chấm thi / unit test) đồng nhất tuyệt đối với khi bật Ollama.
 */
export function evaluateAssistantQuery(
  input: AssistantEvaluateInput
): Omit<AiAssistantResponse, 'latency_ms'> {
  const aiCfg = loadAiConfig();
  const scope = resolveRequestAccessScope(input.user);
  const groupMode: 'sender_group' | 'department' =
    scope.type === 'DEPARTMENT' ? 'sender_group' : 'department';
  const nowMs = (input.now ?? new Date()).getTime();
  const enrichedRequests = enrichScopedRequests(input.scopedRequests, nowMs);

  const ctx: AgentToolContext = {
    scopeType: scope.type,
    defaultGroupMode: groupMode,
    username: input.user.preferred_username,
    userDepartments: scope.type === 'DEPARTMENT' ? scope.departments : [],
    question: input.question,
    history: input.history,
    enrichedRequests,
    departments: input.departments,
    categories: input.categories,
    nowMs,
  };

  const detected = detectContextIntent(ctx);
  if (detected.goal === 'GREETING_OR_HELP') {
    const greeting = buildGreetingHelpResponse(ctx);
    return {
      ...greeting,
      answer: sanitizeAgentAnswer(greeting.answer),
    };
  }

  if (detected.goal === 'CLARIFY') {
    const clarify = buildClarifyResponse(ctx, {
      isPromptInjection: detected.isPromptInjection,
    });
    return {
      ...clarify,
      answer: sanitizeAgentAnswer(clarify.answer),
    };
  }

  const toolName =
    detected.goal === 'ROUTING_GUIDE' ? 'lookup_procedures' : 'query_requests';
  const toolResult = executeAgentTool(
    toolName,
    toolName === 'lookup_procedures' ? { query: input.question } : {},
    ctx
  );

  const groupedRequests = toolResult.groupedRequests ?? [];
  const matchedFlat = groupedRequests.flatMap((g) => g.requests);
  const followUps =
    scope.type === 'PERSONAL'
      ? aiCfg.quick_prompts.student.slice(0, 3)
      : aiCfg.quick_prompts.staff.slice(0, 3);

  return {
    answer: sanitizeAgentAnswer(toolResult.canonicalAnswer || ''),
    scope: scope.type,
    intent: toolResult.intent ?? detected.intent,
    group_by_mode: groupMode,
    show_metrics: Boolean(toolResult.showMetrics),
    metrics: toolResult.metrics ?? {
      total: 0,
      unique_senders: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      urgent: 0,
      overdue_sla: 0,
      avg_resolution_hours: null,
    },
    senders_summary: toolResult.sendersSummary ?? [],
    department_stats: toolResult.departmentStats ?? [],
    grouped_requests: groupedRequests,
    matched_requests: matchedFlat,
    recommended_categories: toolResult.recommendedCategories ?? [],
    follow_up_suggestions: followUps,
    scoped_count: input.scopedRequests.length,
  };
}

export class AiAssistantService {
  async getScopedRequestCount(
    user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>
  ): Promise<number> {
    const scope = resolveRequestAccessScope(user);
    let condition = '';
    let params: unknown[] = [];

    if (scope.type === 'ALL') {
      condition = 'hidden_by_receiver = FALSE';
    } else if (scope.type === 'DEPARTMENT') {
      const deptMatch = buildDepartmentMatchSql(
        scope.departments,
        'target_department',
        1
      );
      condition = `(${deptMatch.condition} AND hidden_by_receiver = FALSE)`;
      params = deptMatch.params;
    } else {
      condition = 'created_by = $1 AND hidden_by_sender = FALSE';
      params = [scope.username];
    }

    const res = await query(
      `SELECT COUNT(*)::int AS total FROM requests WHERE ${condition};`,
      params
    );
    return Number(res.rows[0]?.total || 0);
  }

  async fetchScopedIndexedRequests(
    user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>
  ): Promise<IndexedRequestRow[]> {
    const scope = resolveRequestAccessScope(user);
    let condition = '';
    let params: unknown[] = [];

    if (scope.type === 'ALL') {
      condition = 'r.hidden_by_receiver = FALSE';
    } else if (scope.type === 'DEPARTMENT') {
      const deptMatch = buildDepartmentMatchSql(
        scope.departments,
        'r.target_department',
        1
      );
      condition = `(${deptMatch.condition} AND r.hidden_by_receiver = FALSE)`;
      params = deptMatch.params;
    } else {
      condition = 'r.created_by = $1 AND r.hidden_by_sender = FALSE';
      params = [scope.username];
    }

    const res = await query(
      `SELECT
         r.*,
         c.name AS category_name,
         c.sla_hours AS sla_hours
       FROM requests r
       LEFT JOIN request_categories c ON UPPER(c.code) = UPPER(r.category)
       WHERE ${condition}
       ORDER BY r.created_at DESC;`,
      params
    );
    return res.rows as IndexedRequestRow[];
  }

  async askAssistant(params: {
    question: string;
    history?: AiAssistantHistoryTurn[];
    user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>;
    departments: DepartmentGroupItem[];
    categories: RequestCategoryEntity[];
    fetchImpl?: typeof fetch;
  }): Promise<AiAssistantResponse> {
    const scopedRequests = await this.fetchScopedIndexedRequests(params.user);

    const now = new Date();
    const scope = resolveRequestAccessScope(params.user);
    const defaultGroupMode: 'sender_group' | 'department' =
      scope.type === 'DEPARTMENT' ? 'sender_group' : 'department';
    const enrichedRequests = enrichScopedRequests(scopedRequests, now.getTime());

    const fallbackResponse = evaluateAssistantQuery({
      question: params.question,
      history: params.history,
      user: params.user,
      scopedRequests,
      departments: params.departments,
      categories: params.categories,
      now,
    });

    return runUniRequestAgent({
      question: params.question,
      history: params.history,
      toolContext: {
        scopeType: scope.type,
        defaultGroupMode,
        username: params.user.preferred_username,
        userDepartments: scope.type === 'DEPARTMENT' ? scope.departments : [],
        question: params.question,
        history: params.history,
        enrichedRequests,
        departments: params.departments,
        categories: params.categories,
        nowMs: now.getTime(),
      },
      fallbackResponse,
      fetchImpl: params.fetchImpl,
    });
  }
}

export const aiAssistantService = new AiAssistantService();

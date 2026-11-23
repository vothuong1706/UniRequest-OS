// SPDX-License-Identifier: Apache-2.0
import { config } from '../config/environment.js';
import {
  AiAssistantHistoryTurn,
  AiAssistantResponse,
  DepartmentGroupItem,
} from '../types/request.js';
import {
  AiDepartmentDirectoryEntry,
  loadAiConfig,
} from '../utils/ai-config-loader.js';
import {
  renderPromptTemplate,
  stripVietnameseDiacritics,
} from '../utils/text-vector.js';
import { filterRealDepartments } from '../services/ai-triage-service.js';
import {
  AssistantQuestionIntent,
  isShortFollowUpQuestion,
} from '../services/assistant-query-intent.js';
import {
  AgentToolContext,
  buildClarifyResponse,
  buildGreetingHelpResponse,
  detectContextIntent,
  executeAgentTool,
} from './agent-tools.js';
import { OllamaChatMessage, sanitizeAgentAnswer } from './tool-call-recovery.js';

export type RouterAction =
  | 'lookup_procedures'
  | 'query_requests'
  | 'clarify'
  | 'general_help';

export interface RouterDecision {
  action: RouterAction;
  candidate_departments: string[];
  uses_previous_context: boolean;
}

export interface RunAgentInput {
  question: string;
  history?: AiAssistantHistoryTurn[];
  toolContext: AgentToolContext;
  fallbackResponse: Omit<AiAssistantResponse, 'latency_ms'>;
  fetchImpl?: typeof fetch;
  aiEnabled?: boolean;
  ollamaUrl?: string;
  ollamaModel?: string;
  timeoutMs?: number;
}

const VALID_ROUTER_ACTIONS = new Set<RouterAction>([
  'lookup_procedures',
  'query_requests',
  'clarify',
  'general_help',
]);

function trace(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') return;
  try {
    console.info('[AI Trace]', JSON.stringify(payload));
  } catch {
    console.info('[AI Trace]', '[unserializable]');
  }
}

export function buildRouterJsonSchema(realDeptPaths: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'candidate_departments', 'uses_previous_context'],
    properties: {
      action: {
        type: 'string',
        enum: ['lookup_procedures', 'query_requests', 'clarify', 'general_help'],
      },
      candidate_departments: {
        type: 'array',
        maxItems: 2,
        items:
          realDeptPaths.length > 0
            ? { type: 'string', enum: [...realDeptPaths] }
            : { type: 'string' },
      },
      uses_previous_context: {
        type: 'boolean',
      },
    },
  };
}

function buildDepartmentDirectoryContext(
  realDepartments: readonly DepartmentGroupItem[],
  directory: readonly AiDepartmentDirectoryEntry[]
): string {
  if (realDepartments.length === 0) {
    return '- (Chưa có danh sách phòng ban)';
  }
  return realDepartments
    .map((dept) => {
      const norm = stripVietnameseDiacritics(dept.path);
      const entry = directory.find(
        (item) => stripVietnameseDiacritics(item.department) === norm
      );
      return entry
        ? `- "${dept.path}": ${entry.summary}`
        : `- "${dept.path}" (${dept.display_label})`;
    })
    .join('\n');
}

/**
 * Xây dựng 2 message duy nhất (system + user) để chống tuyệt đối History Poisoning và History Bleed:
 * KHÔNG đẩy lịch sử chat làm role user/assistant vào LLM; chỉ kẹp block [Lượt trước] khi câu hiện tại là câu nối tiếp ngắn.
 */
export function buildRouterMessages(params: {
  question: string;
  history?: AiAssistantHistoryTurn[];
  scopeType: AgentToolContext['scopeType'];
  username: string;
  userDepartments: string[];
  realDepartments: readonly DepartmentGroupItem[];
}): OllamaChatMessage[] {
  const aiCfg = loadAiConfig();
  const directoryContext = buildDepartmentDirectoryContext(
    params.realDepartments,
    aiCfg.department_directory
  );
  const systemPrompt = renderPromptTemplate(aiCfg.router.system_prompt, {
    department_directory_context: directoryContext,
  });

  const scopeNote =
    params.scopeType === 'PERSONAL'
      ? `Người dùng: Sinh viên (${params.username}).`
      : params.scopeType === 'DEPARTMENT'
        ? `Người dùng: Cán bộ/Giảng viên thuộc ${params.userDepartments.join(', ') || 'phòng ban của mình'}.`
        : 'Người dùng: Quản trị viên toàn trường.';

  let userContent = params.question.trim();
  if (
    isShortFollowUpQuestion(userContent) &&
    Array.isArray(params.history) &&
    params.history.length > 0
  ) {
    const prevUserTurn = [...params.history]
      .reverse()
      .find((t) => t.role === 'user' && typeof t.content === 'string' && t.content.trim().length > 0);
    if (prevUserTurn) {
      userContent = `[Lượt trước] Người dùng hỏi: "${prevUserTurn.content.trim().slice(0, 140)}"\n[Câu hiện tại] ${userContent}`;
    }
  }

  return [
    {
      role: 'system',
      content: `${systemPrompt}\n\nNgữ cảnh phiên: ${scopeNote}`,
    },
    {
      role: 'user',
      content: userContent,
    },
  ];
}

export function parseRouterDecision(
  rawContent: string,
  realDeptPaths: readonly string[]
): RouterDecision | null {
  const trimmed = (rawContent || '').trim();
  if (!trimmed) return null;

  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  const rawAction = typeof obj.action === 'string' ? obj.action.trim() : '';
  if (!VALID_ROUTER_ACTIONS.has(rawAction as RouterAction)) {
    return null;
  }

  const canonicalByNorm = new Map<string, string>();
  for (const deptPath of realDeptPaths) {
    canonicalByNorm.set(stripVietnameseDiacritics(deptPath), deptPath);
  }

  const candidateDepts: string[] = [];
  if (Array.isArray(obj.candidate_departments)) {
    for (const item of obj.candidate_departments) {
      if (typeof item !== 'string') continue;
      const canonical = canonicalByNorm.get(
        stripVietnameseDiacritics(item.replace(/^\/+/, ''))
      );
      if (canonical && !candidateDepts.includes(canonical) && candidateDepts.length < 2) {
        candidateDepts.push(canonical);
      }
    }
  }

  return {
    action: rawAction as RouterAction,
    candidate_departments: candidateDepts,
    uses_previous_context: obj.uses_previous_context === true,
  };
}

/**
 * Handoff Guard v3.0: bảo vệ các tín hiệu nghiệp vụ rõ ràng (prompt injection,
 * hỏi thủ tục tường minh, truy vấn dữ liệu tường minh) đồng thời tôn trọng quyết định
 * của Enum Router với câu paraphrase tự nhiên và câu mơ hồ/ngoài phạm vi.
 */
function guardRouterDecision(
  decision: RouterDecision,
  preIntent: AssistantQuestionIntent
): { guarded: RouterDecision; corrected: boolean } {
  if (preIntent.isPromptInjection) {
    return {
      guarded: {
        action: 'clarify',
        candidate_departments: [],
        uses_previous_context: false,
      },
      corrected: decision.action !== 'clarify',
    };
  }

  if (preIntent.goal === 'ROUTING_GUIDE' && decision.action !== 'lookup_procedures') {
    return {
      guarded: {
        ...decision,
        action: 'lookup_procedures',
      },
      corrected: true,
    };
  }

  const clearlyDataGoal =
    preIntent.goal === 'COUNT_SENDERS' ||
    preIntent.goal === 'TOP_SENDER' ||
    preIntent.goal === 'TOP_CATEGORY' ||
    preIntent.goal === 'OVERDUE_SLA' ||
    preIntent.goal === 'FILTER_LIST' ||
    preIntent.goal === 'GENERAL_STATS' ||
    preIntent.hasExistingRequestRef ||
    preIntent.hasExplicitSearchVerb;

  if (clearlyDataGoal && decision.action !== 'query_requests') {
    return {
      guarded: {
        action: 'query_requests',
        candidate_departments: [],
        uses_previous_context: decision.uses_previous_context,
      },
      corrected: true,
    };
  }

  if (
    decision.action === 'general_help' &&
    preIntent.goal === 'CLARIFY' &&
    !preIntent.isGreetingOrHelp
  ) {
    return {
      guarded: {
        action: 'clarify',
        candidate_departments: [],
        uses_previous_context: false,
      },
      corrected: true,
    };
  }

  return { guarded: decision, corrected: false };
}

/**
 * AI Assistant v3.0: Ultra-Lean Enum Router (1 lời gọi Ollama JSON-Schema ~320ms)
 * + Hybrid Catalog thật (5 phòng ban + request_categories + department_directory)
 * + Grounded Structured Renderer (0% bịa phòng ban, 0% rò chữ Trung, 0% lộ công nghệ nội bộ).
 */
export async function runUniRequestAgent(
  input: RunAgentInput
): Promise<AiAssistantResponse> {
  const start = Date.now();
  const aiCfg = loadAiConfig();

  // Nhánh nhanh 1: Chào hỏi / hỏi khả năng trợ lý -> trả lời tức thì (< 2ms), không gọi LLM
  const preIntent = detectContextIntent(input.toolContext);
  if (preIntent.goal === 'GREETING_OR_HELP') {
    const greeting = buildGreetingHelpResponse(input.toolContext);
    trace({
      event: 'agent_done',
      source: 'greeting_guard',
      goal: preIntent.goal,
      latency_ms: Math.max(1, Date.now() - start),
    });
    return {
      ...greeting,
      answer: sanitizeAgentAnswer(greeting.answer),
      latency_ms: Math.max(1, Date.now() - start),
    };
  }

  // Nhánh nhanh 2: Prompt injection / truy cập trái phép -> chặn ngay trước khi chạm LLM
  if (preIntent.isPromptInjection) {
    const blocked = buildClarifyResponse(input.toolContext, {
      isPromptInjection: true,
    });
    trace({
      event: 'agent_done',
      source: 'security_guard',
      goal: preIntent.goal,
      latency_ms: Math.max(1, Date.now() - start),
    });
    return {
      ...blocked,
      answer: sanitizeAgentAnswer(blocked.answer),
      latency_ms: Math.max(1, Date.now() - start),
    };
  }

  const enabled = input.aiEnabled ?? config.ai.enabled;
  const ollamaUrl = (input.ollamaUrl ?? config.ai.ollamaUrl).replace(/\/+$/, '');
  const ollamaModel = input.ollamaModel ?? config.ai.ollamaModel;
  const routerTimeoutMs = Math.min(
    input.timeoutMs ?? config.ai.timeoutMs,
    aiCfg.router.timeout_ms || 8000
  );
  const fetchFn = input.fetchImpl ?? fetch;

  if (!enabled || !ollamaUrl) {
    trace({
      event: 'agent_done',
      source: 'fallback',
      reason: 'ai_disabled',
      goal: preIntent.goal,
      latency_ms: Math.max(1, Date.now() - start),
    });
    return {
      ...input.fallbackResponse,
      answer: sanitizeAgentAnswer(input.fallbackResponse.answer),
      latency_ms: Math.max(1, Date.now() - start),
    };
  }

  const realDepartments = filterRealDepartments(input.toolContext.departments);
  const realDeptPaths = realDepartments.map((d) => d.path);
  const routerSchema = buildRouterJsonSchema(realDeptPaths);
  const routerMessages = buildRouterMessages({
    question: input.question,
    history: input.history,
    scopeType: input.toolContext.scopeType,
    username: input.toolContext.username,
    userDepartments: input.toolContext.userDepartments,
    realDepartments,
  });

  trace({
    event: 'agent_start',
    version: '3.0',
    scope: input.toolContext.scopeType,
    goal: preIntent.goal,
    model: ollamaModel,
    question: input.question.slice(0, 160),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), routerTimeoutMs);

  try {
    const stepStart = Date.now();
    const response = await fetchFn(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        format: routerSchema,
        options: {
          temperature: aiCfg.router.temperature ?? 0,
          num_predict: aiCfg.router.num_predict ?? 120,
          num_ctx: 2048,
        },
        messages: routerMessages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      message?: OllamaChatMessage;
    };
    const rawContent = payload.message?.content ?? '';
    const parsedDecision = parseRouterDecision(rawContent, realDeptPaths);

    if (!parsedDecision) {
      throw new Error('Invalid router JSON payload');
    }

    const { guarded: decision, corrected } = guardRouterDecision(
      parsedDecision,
      preIntent
    );

    trace({
      event: 'router_step',
      latency_ms: Math.max(1, Date.now() - stepStart),
      raw_action: parsedDecision.action,
      action: decision.action,
      candidate_departments: decision.candidate_departments,
      uses_previous_context: decision.uses_previous_context,
      handoff_corrected: corrected,
    });

    // Tầng 2C: Chào hỏi / Hướng dẫn tổng quát
    if (decision.action === 'general_help') {
      const help = buildGreetingHelpResponse(input.toolContext);
      trace({
        event: 'agent_done',
        source: 'ollama_router',
        action: decision.action,
        latency_ms: Math.max(1, Date.now() - start),
      });
      return {
        ...help,
        answer: sanitizeAgentAnswer(help.answer),
        latency_ms: Math.max(1, Date.now() - start),
      };
    }

    // Tầng 2C: Hỏi làm rõ (câu mơ hồ / ngoài phạm vi - KHÔNG chạy TEXT_SEARCH rác, KHÔNG hiện KPI 0)
    if (decision.action === 'clarify') {
      const clarify = buildClarifyResponse(input.toolContext, {
        isPromptInjection: preIntent.isPromptInjection,
      });
      trace({
        event: 'agent_done',
        source: 'ollama_router',
        action: decision.action,
        latency_ms: Math.max(1, Date.now() - start),
      });
      return {
        ...clarify,
        answer: sanitizeAgentAnswer(clarify.answer),
        latency_ms: Math.max(1, Date.now() - start),
      };
    }

    // Tầng 2A: Hybrid Catalog tra cứu thủ tục & phòng ban tiếp nhận
    if (decision.action === 'lookup_procedures') {
      const toolResult = executeAgentTool(
        'lookup_procedures',
        {
          query: input.question,
          candidate_departments: decision.candidate_departments,
        },
        input.toolContext
      );
      const answer = sanitizeAgentAnswer(toolResult.canonicalAnswer || '');
      trace({
        event: 'agent_done',
        source: 'ollama_router',
        action: decision.action,
        candidate_departments: decision.candidate_departments,
        handoff_corrected: corrected,
        latency_ms: Math.max(1, Date.now() - start),
      });
      return {
        answer,
        scope: input.fallbackResponse.scope,
        intent: toolResult.intent ?? 'ROUTING_HELP',
        group_by_mode: input.toolContext.defaultGroupMode,
        show_metrics: false,
        metrics: {
          total: 0,
          unique_senders: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          urgent: 0,
          overdue_sla: 0,
          avg_resolution_hours: null,
        },
        senders_summary: [],
        department_stats: [],
        grouped_requests: [],
        matched_requests: [],
        recommended_categories: toolResult.recommendedCategories ?? [],
        follow_up_suggestions: input.fallbackResponse.follow_up_suggestions,
        scoped_count: input.fallbackResponse.scoped_count,
        latency_ms: Math.max(1, Date.now() - start),
      };
    }

    // Tầng 2B: Truy vấn dữ liệu thật theo RBAC Scope (chống History Bleed: chỉ kế thừa lịch sử khi câu hiện tại thực sự là câu nối tiếp ngắn đã được kẹp [Lượt trước])
    const hasPreviousUserTurn =
      Array.isArray(input.history) &&
      input.history.some(
        (t) => t.role === 'user' && typeof t.content === 'string' && t.content.trim().length > 0
      );
    const allowHistory =
      hasPreviousUserTurn && isShortFollowUpQuestion(input.question);
    const effectiveToolContext: AgentToolContext = allowHistory
      ? input.toolContext
      : { ...input.toolContext, history: undefined };

    const toolResult = executeAgentTool('query_requests', {}, effectiveToolContext);
    const groupedRequests = toolResult.groupedRequests ?? [];
    const matchedFlat = groupedRequests.flatMap((g) => g.requests);
    const answer = sanitizeAgentAnswer(toolResult.canonicalAnswer || '');

    trace({
      event: 'agent_done',
      source: 'ollama_router',
      action: decision.action,
      allow_history: allowHistory,
      handoff_corrected: corrected,
      show_metrics: Boolean(toolResult.showMetrics),
      matched_total: toolResult.metrics?.total ?? null,
      latency_ms: Math.max(1, Date.now() - start),
    });

    return {
      answer,
      scope: input.fallbackResponse.scope,
      intent: toolResult.intent ?? input.fallbackResponse.intent,
      group_by_mode: input.toolContext.defaultGroupMode,
      show_metrics: Boolean(toolResult.showMetrics),
      metrics: toolResult.metrics ?? input.fallbackResponse.metrics,
      senders_summary: toolResult.sendersSummary ?? [],
      department_stats: toolResult.departmentStats ?? [],
      grouped_requests: groupedRequests,
      matched_requests: matchedFlat,
      recommended_categories: [],
      follow_up_suggestions: input.fallbackResponse.follow_up_suggestions,
      scoped_count: input.fallbackResponse.scoped_count,
      latency_ms: Math.max(1, Date.now() - start),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `[AI Router] Không kết nối được model cục bộ (${ollamaUrl}) - chuyển bộ phân tích dự phòng: ${reason}`
      );
    }
    trace({
      event: 'agent_done',
      source: 'fallback',
      reason,
      goal: preIntent.goal,
      latency_ms: Math.max(1, Date.now() - start),
    });
    return {
      ...input.fallbackResponse,
      answer: sanitizeAgentAnswer(input.fallbackResponse.answer),
      latency_ms: Math.max(1, Date.now() - start),
    };
  } finally {
    clearTimeout(timer);
  }
}

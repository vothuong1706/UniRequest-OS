// SPDX-License-Identifier: Apache-2.0
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type RequestPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export type TargetDepartment = string;

export interface DepartmentGroupItem {
  id: string;
  name: string;
  path: string;
  display_label: string;
  parent_path: string | null;
  depth: number;
  sub_group_count: number;
}

export type RequestDeleteMode = 'history' | 'manage';

export type RequestAccessScope =
  | { type: 'ALL' }
  | { type: 'DEPARTMENT'; departments: string[] }
  | { type: 'PERSONAL'; username: string };

export type AuditAction =
  | 'CREATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PENDING'
  | 'WORKFLOW_DISPATCHED'
  | 'SLA_WARNING';

export interface RequestCategoryEntity {
  id: string;
  code: string;
  name: string;
  department: string;
  sla_hours: number;
  requires_evidence: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCategoryDto {
  code?: string;
  name: string;
  department: string;
  sla_hours?: number;
  requires_evidence?: boolean;
  sort_order?: number;
}

export interface UpdateCategoryDto {
  name?: string;
  department?: string;
  sla_hours?: number;
  requires_evidence?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface RequestEntity {
  id: string;
  title: string;
  description: string | null;
  category: string;
  custom_category_label: string | null;
  target_department: string | null;
  sender_group?: string | null;
  priority: RequestPriority;
  status: RequestStatus;
  created_by: string;
  attachment_url: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: Date | null;
  workflow_execution_id: string | null;
  hidden_by_sender?: boolean;
  hidden_by_receiver?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RequestAuditLogEntity {
  id: string;
  request_id: string;
  actor: string;
  actor_roles: string[];
  action: AuditAction;
  from_status: RequestStatus | null;
  to_status: RequestStatus | null;
  note: string | null;
  metadata: Record<string, unknown>;
  prev_hash?: string | null;
  entry_hash?: string | null;
  created_at: Date;
}

export interface AuditIntegrityResult {
  valid: boolean;
  checked_entries: number;
  latest_hash: string | null;
  reason?: string;
}

export interface CreateRequestDto {
  title: string;
  description?: string;
  category?: string;
  custom_category_label?: string;
  target_department?: string;
  sender_group?: string | null;
  priority?: RequestPriority;
  attachment_url?: string;
}

export interface UpdateRequestStatusDto {
  status: RequestStatus;
  review_note?: string;
}

export interface RequestAnalyticsSummary {
  scope: 'ALL' | 'DEPARTMENT' | 'PERSONAL';
  total: number;
  by_status: Record<RequestStatus, number>;
  categories: Array<{
    code: string;
    name: string;
    department: string;
    count: number;
  }>;
  by_priority: Record<RequestPriority, number>;
  completion_rate: number;
  avg_resolution_hours: number | null;
  daily_trend: Array<{
    date: string;
    total: number;
    approved: number;
    rejected: number;
    pending: number;
  }>;
}

export interface KeycloakUser {
  preferred_username: string;
  email?: string;
  roles: string[];
  groups: string[];
  sub?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: Record<string, { roles: string[] }>;
  [key: string]: unknown;
}

export type AiTriageProvider = 'ollama' | 'rule-nlp-engine';

export interface AiTriageSuggestion {
  suggested_department: string | null;
  suggested_department_label: string | null;
  suggested_category_code: string;
  suggested_category_name: string;
  suggested_priority: RequestPriority;
  confidence: number;
  summary: string;
  reason: string;
  keywords_matched: string[];
  provider: AiTriageProvider;
  model?: string;
  latency_ms: number;
}

export type AiAssistantIntent =
  | 'STATS'
  | 'OVERDUE_AUDIT'
  | 'STATUS_FILTER'
  | 'ROUTING_HELP'
  | 'SEMANTIC_SEARCH';

export interface AiAssistantMatchedRequest {
  id: string;
  title: string;
  status: RequestStatus;
  priority: RequestPriority;
  category: string;
  category_name: string;
  target_department: string | null;
  sender_group: string | null;
  created_by: string;
  created_at: string;
  review_note: string | null;
  has_attachment: boolean;
  sla_hours: number;
  elapsed_hours: number;
  sla_overdue: boolean;
  similarity_score: number;
}

export interface AiAssistantSenderSummary {
  username: string;
  sender_group: string | null;
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  overdue_sla: number;
}

export interface AiAssistantRecommendedCategory {
  code: string;
  name: string;
  department: string;
  sla_hours: number;
  requires_evidence: boolean;
  score: number;
}

export interface AiAssistantDepartmentGroup {
  department: string;
  group_kind: 'sender_group' | 'department';
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  urgent: number;
  overdue_sla: number;
  unique_senders: number;
  requests: AiAssistantMatchedRequest[];
}

export interface AiAssistantDepartmentStat {
  department: string;
  group_kind: 'sender_group' | 'department';
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  urgent: number;
  overdue_sla: number;
  unique_senders: number;
}

export interface AiAssistantHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiAssistantResponse {
  answer: string;
  scope: 'ALL' | 'DEPARTMENT' | 'PERSONAL';
  intent: AiAssistantIntent;
  group_by_mode: 'sender_group' | 'department';
  show_metrics: boolean;
  metrics: {
    total: number;
    unique_senders: number;
    approved: number;
    pending: number;
    rejected: number;
    urgent: number;
    overdue_sla: number;
    avg_resolution_hours: number | null;
  };
  senders_summary: AiAssistantSenderSummary[];
  department_stats: AiAssistantDepartmentStat[];
  grouped_requests: AiAssistantDepartmentGroup[];
  matched_requests: AiAssistantMatchedRequest[];
  recommended_categories: AiAssistantRecommendedCategory[];
  follow_up_suggestions: string[];
  scoped_count: number;
  latency_ms: number;
}

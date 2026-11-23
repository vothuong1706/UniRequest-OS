// SPDX-License-Identifier: Apache-2.0
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type RequestPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export type RequestDeleteMode = 'history' | 'manage';

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

export type StatusFilter = 'ALL' | RequestStatus;

export type AuditAction =
  'CREATED' | 'APPROVED' | 'REJECTED' | 'PENDING' | 'WORKFLOW_DISPATCHED' | 'SLA_WARNING';

export interface RequestCategoryItem {
  id: string;
  code: string;
  name: string;
  department: string;
  sla_hours: number;
  requires_evidence: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCategoryPayload {
  code?: string;
  name: string;
  department: string;
  sla_hours?: number;
  requires_evidence?: boolean;
  sort_order?: number;
}

export interface UpdateCategoryPayload {
  name?: string;
  department?: string;
  sla_hours?: number;
  requires_evidence?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface RequestItem {
  id: string;
  title: string;
  description: string | null;
  category?: string;
  custom_category_label?: string | null;
  target_department?: string | null;
  sender_group?: string | null;
  priority?: RequestPriority;
  status: RequestStatus;
  created_by: string;
  attachment_url: string | null;
  reviewed_by?: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
  workflow_execution_id?: string | null;
  hidden_by_sender?: boolean;
  hidden_by_receiver?: boolean;
  created_at: string;
  updated_at: string;
}

export interface RequestAuditLog {
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
  created_at: string;
}

export interface AuditIntegrityResult {
  valid: boolean;
  checked_entries: number;
  latest_hash: string | null;
  reason?: string;
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
  'STATS' | 'OVERDUE_AUDIT' | 'STATUS_FILTER' | 'ROUTING_HELP' | 'SEMANTIC_SEARCH';

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

export interface AiAssistantConfig {
  scope: 'ALL' | 'DEPARTMENT' | 'PERSONAL';
  departments: string[];
  scoped_count: number;
  quick_prompts: string[];
}

export interface RequestDetailItem extends RequestItem {
  audit_logs: RequestAuditLog[];
  audit_integrity?: AuditIntegrityResult;
  ai_insight?: AiTriageSuggestion;
}

export interface CreateRequestPayload {
  title: string;
  description?: string;
  category: string;
  custom_category_label?: string;
  target_department: TargetDepartment;
  priority: RequestPriority;
  attachment_url?: string;
}

export interface UploadedFileResponse {
  url: string;
  filename: string;
  original_name: string;
  size: number;
  mimetype: string;
}

export interface CategoryAnalyticsItem {
  code: string;
  name: string;
  department: string;
  count: number;
}

export interface RequestAnalytics {
  scope: 'ALL' | 'DEPARTMENT' | 'PERSONAL';
  total: number;
  by_status: Record<RequestStatus, number>;
  categories: CategoryAnalyticsItem[];
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

export interface RequestCommentItem {
  id: string;
  request_id: string;
  author_username: string;
  author_role: string;
  content: string;
  created_at: string;
}

export type NotificationType =
  | 'REQUEST_CREATED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'COMMENT_ADDED'
  | 'SLA_WARNING';

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'URGENT';

export interface NotificationItem {
  id: string;
  recipient_username: string | null;
  recipient_role: string | null;
  request_id: string | null;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  actor: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unread_count: number;
}

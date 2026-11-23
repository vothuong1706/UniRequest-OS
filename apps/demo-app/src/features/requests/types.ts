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

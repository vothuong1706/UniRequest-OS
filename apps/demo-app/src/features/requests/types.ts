export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type RequestPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export type StatusFilter = 'ALL' | RequestStatus;

export type AuditAction =
  'CREATED' | 'APPROVED' | 'REJECTED' | 'PENDING' | 'WORKFLOW_DISPATCHED';

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
  priority?: RequestPriority;
  status: RequestStatus;
  created_by: string;
  attachment_url: string | null;
  reviewed_by?: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
  workflow_execution_id?: string | null;
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
  created_at: string;
}

export interface RequestDetailItem extends RequestItem {
  audit_logs: RequestAuditLog[];
}

export interface CreateRequestPayload {
  title: string;
  description?: string;
  category: string;
  custom_category_label?: string;
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
  scope: 'ALL' | 'PERSONAL';
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
  'REQUEST_CREATED' | 'REQUEST_APPROVED' | 'REQUEST_REJECTED' | 'COMMENT_ADDED';

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

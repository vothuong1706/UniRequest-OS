export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type RequestPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export type AuditAction =
  | 'CREATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PENDING'
  | 'WORKFLOW_DISPATCHED';

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
  priority: RequestPriority;
  status: RequestStatus;
  created_by: string;
  attachment_url: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: Date | null;
  workflow_execution_id: string | null;
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
  created_at: Date;
}

export interface CreateRequestDto {
  title: string;
  description?: string;
  category?: string;
  custom_category_label?: string;
  priority?: RequestPriority;
  attachment_url?: string;
}

export interface UpdateRequestStatusDto {
  status: RequestStatus;
  review_note?: string;
}

export interface RequestAnalyticsSummary {
  scope: 'ALL' | 'PERSONAL';
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
  sub?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: Record<string, { roles: string[] }>;
  [key: string]: unknown;
}

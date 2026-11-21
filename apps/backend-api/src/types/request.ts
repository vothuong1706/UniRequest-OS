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
  created_at: Date;
}

export interface CreateRequestDto {
  title: string;
  description?: string;
  category?: string;
  custom_category_label?: string;
  target_department?: string;
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

// SPDX-License-Identifier: Apache-2.0
import { ensureFreshToken } from '@/auth/keycloak';
import { resolveServiceUrl } from '@/lib/runtime-urls';
import type {
  AiAssistantConfig,
  AiAssistantHistoryTurn,
  AiAssistantResponse,
  AiTriageSuggestion,
  CreateCategoryPayload,
  CreateRequestPayload,
  DepartmentGroupItem,
  NotificationListResponse,
  RequestAnalytics,
  RequestCategoryItem,
  RequestCommentItem,
  RequestDeleteMode,
  RequestDetailItem,
  RequestItem,
  RequestStatus,
  UpdateCategoryPayload,
  UploadedFileResponse,
} from '@/features/requests/types';

export const API_BASE_URL = resolveServiceUrl(
  import.meta.env.VITE_API_BASE_URL,
  '/api',
  'http://localhost:8000/api'
);

interface ApiEnvelope<T> {
  success: boolean;
  code?: string;
  message?: string;
  count?: number;
  data?: T;
}

function resolveUrl(endpointOrUrl: string): string {
  if (/^https?:\/\//i.test(endpointOrUrl)) {
    return endpointOrUrl;
  }
  const base = API_BASE_URL.replace(/\/+$/, '');
  const path = endpointOrUrl.startsWith('/') ? endpointOrUrl : `/${endpointOrUrl}`;
  return `${base}${path}`;
}

export async function fetchWithAuth<T>(
  endpointOrUrl: string,
  options: RequestInit = {}
): Promise<ApiEnvelope<T>> {
  const token = await ensureFreshToken(30);

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(resolveUrl(endpointOrUrl), {
    ...options,
    headers,
  });

  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok) {
    throw new Error(payload.message || `Lỗi máy chủ (${response.status})`);
  }

  return payload;
}

export const requestsApi = {
  list: () => fetchWithAuth<RequestItem[]>('/requests'),

  detail: (requestId: string) =>
    fetchWithAuth<RequestDetailItem>(`/requests/${requestId}`),

  analytics: () => fetchWithAuth<RequestAnalytics>('/requests/analytics'),

  suggestAi: (payload: { title: string; description?: string }) =>
    fetchWithAuth<AiTriageSuggestion>('/requests/ai-suggest', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  create: (body: CreateRequestPayload) =>
    fetchWithAuth<RequestItem>('/requests', {
      method: 'POST',
      body: JSON.stringify({
        title: body.title,
        description: body.description || undefined,
        category: body.category,
        custom_category_label: body.custom_category_label?.trim() || undefined,
        target_department: body.target_department,
        priority: body.priority,
        attachment_url: body.attachment_url || undefined,
      }),
    }),

  updateStatus: (requestId: string, status: RequestStatus, reviewNote?: string) =>
    fetchWithAuth<RequestItem>(`/requests/${requestId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status,
        review_note: reviewNote?.trim() || undefined,
      }),
    }),

  deleteMany: (ids: string[], mode?: RequestDeleteMode) =>
    fetchWithAuth<string[]>('/requests', {
      method: 'DELETE',
      body: JSON.stringify({ ids, mode }),
    }),
};

export const categoriesApi = {
  list: (includeInactive = false) =>
    fetchWithAuth<RequestCategoryItem[]>(
      includeInactive ? '/categories?all=true' : '/categories'
    ),

  create: (body: CreateCategoryPayload) =>
    fetchWithAuth<RequestCategoryItem>('/categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id: string, body: UpdateCategoryPayload) =>
    fetchWithAuth<RequestCategoryItem>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  toggle: (id: string) =>
    fetchWithAuth<RequestCategoryItem>(`/categories/${id}/toggle`, {
      method: 'PATCH',
    }),

  deleteMany: (ids: string[]) =>
    fetchWithAuth<string[]>('/categories', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    }),
};

export const departmentsApi = {
  list: (refresh = false) =>
    fetchWithAuth<DepartmentGroupItem[]>(
      refresh ? '/departments?refresh=true' : '/departments'
    ),
};

export const uploadApi = {
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchWithAuth<UploadedFileResponse>('/upload', {
      method: 'POST',
      body: formData,
    });
  },
};

export const commentsApi = {
  list: (requestId: string) =>
    fetchWithAuth<RequestCommentItem[]>(`/requests/${requestId}/comments`),

  create: (requestId: string, content: string) =>
    fetchWithAuth<RequestCommentItem>(`/requests/${requestId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};

export const notificationsApi = {
  list: (limit = 40) =>
    fetchWithAuth<NotificationListResponse>(`/notifications?limit=${limit}`),

  markRead: (notificationId: string) =>
    fetchWithAuth<void>(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
    }),

  markUnread: (notificationId: string) =>
    fetchWithAuth<void>(`/notifications/${notificationId}/unread`, {
      method: 'PATCH',
    }),

  hide: (notificationId: string) =>
    fetchWithAuth<void>(`/notifications/${notificationId}/hide`, {
      method: 'PATCH',
    }),

  markReadByRequest: (requestId: string) =>
    fetchWithAuth<void>(`/notifications/by-request/${requestId}/read`, {
      method: 'PATCH',
    }),

  markAllRead: () =>
    fetchWithAuth<void>('/notifications/read-all', {
      method: 'PATCH',
    }),
};

export const aiApi = {
  getConfig: () => fetchWithAuth<AiAssistantConfig>('/ai/config'),

  ask: (question: string, history?: AiAssistantHistoryTurn[]) =>
    fetchWithAuth<AiAssistantResponse>('/ai/assistant', {
      method: 'POST',
      body: JSON.stringify({ question, history }),
    }),
};

export const pushApi = {
  getVapidPublicKey: () => fetchWithAuth<{ publicKey: string }>('/push/vapid-public-key'),

  subscribe: (subscription: PushSubscriptionJSON) =>
    fetchWithAuth<void>('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    }),

  unsubscribe: (endpoint: string) =>
    fetchWithAuth<void>('/push/unsubscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),
};

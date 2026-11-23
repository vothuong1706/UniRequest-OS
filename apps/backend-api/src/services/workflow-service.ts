// SPDX-License-Identifier: Apache-2.0
import { config } from '../config/environment.js';

export type WorkflowEventType = 'request.created' | 'request.status_changed';

export interface RequestWorkflowEventPayload {
  event: WorkflowEventType;
  request_id: string;
  title: string;
  category?: string;
  target_department?: string | null;
  status: string;
  priority?: string;
  created_by: string;
  actor?: string;
  review_note?: string;
  attachment_url?: string | null;
}

export interface WorkflowDispatchResult {
  dispatched: boolean;
  executionId?: string;
  reason?: string;
}

const PRIORITY_TAG_REGEX = /^\[Ưu tiên:\s*([^\]]+)\]/i;

export function extractPriorityFromDescription(description?: string | null): string {
  if (!description) return 'NORMAL';
  const match = description.match(PRIORITY_TAG_REGEX);
  if (!match) return 'NORMAL';

  const raw = match[1].trim().toLowerCase();
  if (raw === 'khẩn cấp') return 'URGENT';
  if (raw === 'ưu tiên cao') return 'HIGH';
  return 'NORMAL';
}

export class WorkflowService {
  private get webhookUrl(): string {
    const base = config.kestra.url.replace(/\/+$/, '');
    const { namespace, flowId, webhookKey } = config.kestra;
    return `${base}/api/v1/main/executions/webhook/${namespace}/${flowId}/${webhookKey}`;
  }

  /**
   * Phát sự kiện vòng đời yêu cầu tới Kestra Workflow Engine (Apache-2.0).
   * Cơ chế fail-safe: có timeout 3s để không bao giờ chặn giao dịch OLTP cốt lõi.
   */
  async emitLifecycleEvent(
    payload: RequestWorkflowEventPayload
  ): Promise<WorkflowDispatchResult> {
    if (!config.kestra.enabled) {
      return { dispatched: false, reason: 'WORKFLOW_DISABLED' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const basicToken = Buffer.from(
      `${config.kestra.username}:${config.kestra.password}`
    ).toString('base64');

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicToken}`,
        },
        body: JSON.stringify({
          ...payload,
          emitted_at: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(
          `[Kestra Workflow] Webhook trả về HTTP ${response.status} cho request ${payload.request_id}`
        );
        return { dispatched: false, reason: `HTTP_${response.status}` };
      }

      const data = (await response.json().catch(() => ({}))) as { id?: string };
      console.log(
        `[Kestra Workflow] Đã kích hoạt execution [${data.id ?? 'ok'}] cho sự kiện ${payload.event} (#${payload.request_id})`
      );
      return { dispatched: true, executionId: data.id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[Kestra Workflow] Không thể kết nối Kestra Engine: ${msg}`);
      return { dispatched: false, reason: msg };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Kiểm tra sức khỏe kết nối tới Kestra Workflow Engine
   */
  async checkHealth(): Promise<'CONNECTED' | 'DEGRADED' | 'DISABLED'> {
    if (!config.kestra.enabled) return 'DISABLED';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const base = config.kestra.url.replace(/\/+$/, '');

    try {
      const res = await fetch(`${base}/ping`, {
        signal: controller.signal,
      });
      return res.ok ? 'CONNECTED' : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const workflowService = new WorkflowService();

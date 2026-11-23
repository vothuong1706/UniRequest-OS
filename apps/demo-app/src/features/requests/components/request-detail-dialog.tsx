// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  History,
  Loader2,
  Paperclip,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { formatDateTime, isImageUrl, resolveAttachmentUrl } from '@/lib/format';
import { API_BASE_URL, requestsApi } from '@/services/api-client';
import type {
  AuditAction,
  DepartmentGroupItem,
  RequestAuditLog,
  RequestCategoryItem,
  RequestCommentItem,
  RequestDetailItem,
  RequestItem,
  RequestStatus,
} from '../types';
import { getPriorityLabel, resolveRequestDisplay } from '../utils/priority';
import { RequestCommentsPanel } from './request-comments-panel';
import {
  CategoryBadge,
  DepartmentBadge,
  PriorityBadge,
  StatusBadge,
} from './status-badge';

interface RequestDetailDialogProps {
  request: RequestItem | null;
  categories: RequestCategoryItem[];
  departments: DepartmentGroupItem[];
  currentUsername: string;
  incomingComment: RequestCommentItem | null;
  canReview: boolean;
  onClose: () => void;
  onRequestStatusChange: (request: RequestItem, status: RequestStatus) => void;
}

const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATED: 'Đã gửi yêu cầu',
  WORKFLOW_DISPATCHED: 'Đã chuyển phòng ban phụ trách',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
  PENDING: 'Chuyển về chờ duyệt',
  SLA_WARNING: 'Cảnh báo quá hạn xử lý (Kestra SLA)',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printRequestReceipt(
  item: RequestItem,
  categories: RequestCategoryItem[],
  departments: DepartmentGroupItem[],
  auditLogs: RequestAuditLog[]
): void {
  const { categoryLabel, department, priority, cleanDescription } = resolveRequestDisplay(
    item,
    categories,
    departments
  );
  const statusText =
    item.status === 'APPROVED'
      ? 'ĐÃ PHÊ DUYỆT'
      : item.status === 'REJECTED'
        ? 'ĐÃ TỪ CHỐI'
        : 'ĐANG CHỜ XỬ LÝ';

  const auditRows = auditLogs
    .map(
      (log) => `
      <tr>
        <td>${escapeHtml(formatDateTime(log.created_at))}</td>
        <td>${escapeHtml(AUDIT_ACTION_LABELS[log.action] ?? log.action)}</td>
        <td>${escapeHtml(log.actor)}</td>
        <td>${escapeHtml(log.note || ' - ')}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
  <html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>Phiếu xác nhận yêu cầu - ${escapeHtml(item.title)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111; max-width: 780px; margin: 32px auto; line-height: 1.5; }
      header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; }
      h1 { font-size: 19px; margin: 0; }
      .meta { font-size: 12px; color: #444; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
      th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
      th { background: #f4f4f5; }
      .box { border: 1px solid #ddd; padding: 12px; border-radius: 6px; margin: 12px 0; white-space: pre-line; }
      .status { font-weight: bold; padding: 3px 8px; border: 1px solid #111; display: inline-block; font-size: 12px; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>PHIẾU XÁC NHẬN YÊU CẦU</h1>
        <div class="meta">Cổng dịch vụ trực tuyến UniRequest</div>
      </div>
      <div class="meta" style="text-align:right">
        <div>Mã yêu cầu: <strong>${escapeHtml(item.id.slice(0, 8).toUpperCase())}</strong></div>
        <div>Ngày in: ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
      </div>
    </header>
    <table>
      <tr><th style="width:28%">Tiêu đề</th><td><strong>${escapeHtml(item.title)}</strong></td></tr>
      <tr><th>Loại yêu cầu / Phòng ban</th><td>${escapeHtml(categoryLabel)} - ${escapeHtml(department)}</td></tr>
      <tr><th>Mức độ ưu tiên</th><td>${escapeHtml(getPriorityLabel(priority))}</td></tr>
      <tr><th>Người gửi</th><td>${escapeHtml(item.created_by)} · ${escapeHtml(formatDateTime(item.created_at))}</td></tr>
      <tr><th>Trạng thái</th><td><span class="status">${statusText}</span></td></tr>
      ${item.reviewed_by ? `<tr><th>Người xử lý</th><td>${escapeHtml(item.reviewed_by)} · ${escapeHtml(formatDateTime(item.reviewed_at))}</td></tr>` : ''}
      ${item.review_note ? `<tr><th>Ghi chú phản hồi</th><td>${escapeHtml(item.review_note)}</td></tr>` : ''}
    </table>
    <h3 style="margin-top:20px">Nội dung chi tiết</h3>
    <div class="box">${escapeHtml(cleanDescription || 'Không có mô tả bổ sung.')}</div>
    ${
      auditRows
        ? `<h3 style="margin-top:20px">Lịch sử xử lý</h3>
           <table><thead><tr><th>Thời gian</th><th>Trạng thái</th><th>Người thực hiện</th><th>Ghi chú</th></tr></thead><tbody>${auditRows}</tbody></table>`
        : ''
    }
    <script>window.onload = function(){ window.print(); };</script>
  </body>
  </html>`;

  const win = window.open('', '_blank', 'width=900,height=720');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export function RequestDetailDialog({
  request,
  categories,
  departments,
  currentUsername,
  incomingComment,
  canReview,
  onClose,
  onRequestStatusChange,
}: RequestDetailDialogProps) {
  const [detail, setDetail] = useState<RequestDetailItem | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const requestId = request?.id ?? null;

  useEffect(() => {
    if (!requestId) return;

    let active = true;

    requestsApi
      .detail(requestId)
      .then((res) => {
        if (active && res.success && res.data) {
          setDetail(res.data);
        }
      })
      .catch(() => {
        // Keep summary data if detail fails
      })
      .finally(() => {
        if (active) setLoadedId(requestId);
      });

    return () => {
      active = false;
    };
  }, [requestId]);

  if (!request) return null;

  const matchedDetail = detail?.id === request.id ? detail : null;
  const loadingDetail = loadedId !== request.id;
  const activeItem: RequestItem = matchedDetail ?? request;
  const auditLogs = matchedDetail?.audit_logs ?? [];
  const { categoryLabel, department, targetDepartmentLabel, priority, cleanDescription } =
    resolveRequestDisplay(activeItem, categories, departments);
  const resolvedAttachmentUrl = resolveAttachmentUrl(
    activeItem.attachment_url,
    API_BASE_URL
  );
  const hasImagePreview = isImageUrl(resolvedAttachmentUrl);

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <StatusBadge status={activeItem.status} />
            <CategoryBadge label={categoryLabel} />
            {targetDepartmentLabel && <DepartmentBadge label={targetDepartmentLabel} />}
            {priority !== 'NORMAL' && <PriorityBadge priority={priority} />}
          </div>
          <DialogTitle className="pt-1 leading-snug">{activeItem.title}</DialogTitle>
          <DialogDescription>
            {activeItem.created_by} ·{' '}
            <span className="tabular-nums">{formatDateTime(activeItem.created_at)}</span>{' '}
            · {department}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="space-y-5 text-sm">
          {/* Nội dung chi tiết */}
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">Nội dung</p>
            <p className="whitespace-pre-line leading-relaxed">
              {cleanDescription || 'Không có mô tả bổ sung.'}
            </p>
          </div>

          {/* Phân tích thông minh [I] */}
          {matchedDetail?.ai_insight && (
            <div className="bg-muted/50 space-y-1.5 rounded-lg border p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles className="size-3.5" />
                  <span>Phân tích thông minh [I]</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[11px]">
                    {matchedDetail.ai_insight.provider === 'ollama'
                      ? `Ollama (${matchedDetail.ai_insight.model ?? 'LLM'})`
                      : 'Local NLP Engine'}
                  </Badge>
                  <Badge variant="outline" className="text-[11px] tabular-nums">
                    {Math.round(matchedDetail.ai_insight.confidence * 100)}%
                  </Badge>
                </div>
              </div>
              <p className="text-xs font-medium leading-snug">
                {matchedDetail.ai_insight.summary}
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {matchedDetail.ai_insight.reason}
              </p>
            </div>
          )}

          {/* Kết quả xử lý */}
          {(activeItem.reviewed_by || activeItem.review_note) && (
            <div className="bg-muted space-y-1 rounded-lg border p-3.5">
              <p className="text-xs font-semibold">
                Phản hồi từ {activeItem.reviewed_by ?? 'cán bộ phụ trách'}
                {activeItem.reviewed_at && (
                  <span className="text-muted-foreground font-normal tabular-nums">
                    {' '}
                    · {formatDateTime(activeItem.reviewed_at)}
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {activeItem.review_note || 'Không có ghi chú bổ sung.'}
              </p>
            </div>
          )}

          {/* Tệp đính kèm */}
          {resolvedAttachmentUrl && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">Tệp đính kèm</p>
              {hasImagePreview && (
                <img
                  src={resolvedAttachmentUrl}
                  alt={activeItem.title}
                  className="bg-muted max-h-56 w-full rounded-lg border object-contain"
                />
              )}
              <Button variant="outline" size="sm" asChild>
                <a href={resolvedAttachmentUrl} target="_blank" rel="noreferrer">
                  <Paperclip className="size-3.5" />
                  <span>Mở tệp đính kèm</span>
                  <ExternalLink className="size-3" />
                </a>
              </Button>
            </div>
          )}

          {/* Trao đổi trực tiếp (Realtime Comments) */}
          <RequestCommentsPanel
            requestId={activeItem.id}
            currentUsername={currentUsername}
            incomingComment={incomingComment}
          />

          {/* Lịch sử xử lý */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <History className="text-muted-foreground size-3.5" />
                <span>Lịch sử xử lý</span>
                {loadingDetail && <Loader2 className="size-3 animate-spin" />}
              </div>
              {matchedDetail?.audit_integrity &&
                matchedDetail.audit_integrity.checked_entries > 0 && (
                  <Badge
                    variant={
                      matchedDetail.audit_integrity.valid ? 'outline' : 'destructive'
                    }
                    title={
                      matchedDetail.audit_integrity.reason ||
                      `Latest SHA-256: ${matchedDetail.audit_integrity.latest_hash ?? ''}`
                    }
                    className={
                      matchedDetail.audit_integrity.valid
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px]'
                        : 'text-[11px]'
                    }
                  >
                    {matchedDetail.audit_integrity.valid ? (
                      <ShieldCheck className="mr-1 size-3" />
                    ) : (
                      <ShieldAlert className="mr-1 size-3" />
                    )}
                    <span>
                      {matchedDetail.audit_integrity.valid
                        ? `Chuỗi SHA-256 hợp lệ (${matchedDetail.audit_integrity.checked_entries})`
                        : 'Cảnh báo sai lệch sổ cái'}
                    </span>
                  </Badge>
                )}
            </div>

            {auditLogs.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {loadingDetail ? 'Đang tải lịch sử...' : 'Chưa có cập nhật nào.'}
              </p>
            ) : (
              <ol className="border-border relative ml-2 space-y-3 border-l pl-4">
                {auditLogs.map((log) => (
                  <li key={log.id} className="relative text-xs">
                    <span
                      aria-hidden="true"
                      className="bg-foreground absolute top-1 -left-[21px] size-2 rounded-full"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">
                      {log.actor}
                      {log.note ? ` · ${log.note}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <Separator />

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              printRequestReceipt(activeItem, categories, departments, auditLogs)
            }
          >
            <Printer className="size-3.5" />
            <span>In phiếu xác nhận</span>
          </Button>

          <div className="flex items-center justify-end gap-2">
            {canReview && activeItem.status === 'PENDING' ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    onRequestStatusChange(activeItem, 'REJECTED');
                  }}
                >
                  <X className="size-4" />
                  <span>Từ chối</span>
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequestStatusChange(activeItem, 'APPROVED');
                  }}
                >
                  <Check className="size-4" />
                  <span>Phê duyệt</span>
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={onClose}>
                Đóng
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

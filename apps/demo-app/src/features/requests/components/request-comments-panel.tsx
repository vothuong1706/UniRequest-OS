// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { getRoleLabel } from '@/auth/keycloak';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { commentsApi } from '@/services/api-client';
import type { RequestCommentItem } from '../types';

interface RequestCommentsPanelProps {
  requestId: string;
  currentUsername: string;
  incomingComment: RequestCommentItem | null;
}

export function RequestCommentsPanel({
  requestId,
  currentUsername,
  incomingComment,
}: RequestCommentsPanelProps) {
  const [comments, setComments] = useState<RequestCommentItem[]>([]);
  const [loadedRequestId, setLoadedRequestId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    commentsApi
      .list(requestId)
      .then((res) => {
        if (active && res.success && Array.isArray(res.data)) {
          setComments(res.data);
        }
      })
      .catch(() => {
        // Ignore non-fatal load failure
      })
      .finally(() => {
        if (active) setLoadedRequestId(requestId);
      });

    return () => {
      active = false;
    };
  }, [requestId]);

  const mergedComments = (() => {
    const base = loadedRequestId === requestId ? comments : [];
    if (
      incomingComment &&
      incomingComment.request_id === requestId &&
      !base.some((c) => c.id === incomingComment.id)
    ) {
      return [...base, incomingComment];
    }
    return base;
  })();

  useEffect(() => {
    if (mergedComments.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [mergedComments.length]);

  const loading = loadedRequestId !== requestId;

  const submitComment = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      const res = await commentsApi.create(requestId, content);
      if (res.success && res.data) {
        const created = res.data;
        setComments((prev) =>
          prev.some((c) => c.id === created.id) ? prev : [...prev, created]
        );
        setDraft('');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể gửi trao đổi.');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitComment();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitComment();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <MessageSquare className="text-muted-foreground size-3.5" />
        <span>Trao đổi ({mergedComments.length})</span>
        {loading && <Loader2 className="size-3 animate-spin" />}
      </div>

      <div className="bg-muted/30 max-h-56 space-y-2.5 overflow-y-auto rounded-lg border p-3">
        {mergedComments.length === 0 ? (
          <p className="text-muted-foreground py-3 text-center text-xs">
            {loading
              ? 'Đang tải nội dung trao đổi...'
              : 'Chưa có trao đổi nào. Nhắn tin bên dưới nếu cần làm rõ thông tin.'}
          </p>
        ) : (
          mergedComments.map((item) => {
            const isMine = Boolean(
              currentUsername && item.author_username === currentUsername
            );
            const isStaffRole = item.author_role !== 'sinhvien';
            return (
              <div
                key={item.id}
                className={cn(
                  'flex flex-col gap-1',
                  isMine ? 'items-end' : 'items-start'
                )}
              >
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="font-medium">{item.author_username}</span>
                  {isStaffRole && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 text-[10px] font-normal"
                    >
                      {getRoleLabel(item.author_role)}
                    </Badge>
                  )}
                  <span className="text-muted-foreground tabular-nums">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap',
                    isMine
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-foreground border'
                  )}
                >
                  {item.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <Textarea
          rows={2}
          maxLength={1000}
          value={draft}
          disabled={sending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập trao đổi hoặc yêu cầu bổ sung... (Enter để gửi)"
          className="min-h-10 resize-none text-xs"
        />
        <Button
          type="submit"
          size="icon"
          disabled={sending || !draft.trim()}
          aria-label="Gửi trao đổi"
          className="size-9 shrink-0"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

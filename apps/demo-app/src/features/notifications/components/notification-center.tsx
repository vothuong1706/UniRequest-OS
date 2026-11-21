import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  CircleDot,
  FilePlus2,
  Loader2,
  MessageSquare,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NotificationItem } from '@/features/requests/types';
import { formatDateTime, isSameDayInAppTimezone } from '@/lib/format';
import { cn } from '@/lib/utils';

interface NotificationCenterProps {
  items: NotificationItem[];
  unreadCount: number;
  connected: boolean;
  pushSupported: boolean;
  pushSubscribed: boolean;
  pushBusy: boolean;
  onTogglePush: () => void;
  onSelectNotification: (item: NotificationItem) => void;
  onToggleRead: (item: NotificationItem) => void;
  onHideNotification: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
}

function isSameDay(isoDate: string): boolean {
  return isSameDayInAppTimezone(isoDate);
}

function NotificationIcon({ item }: { item: NotificationItem }) {
  if (item.severity === 'URGENT') {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-500/12 text-rose-600 dark:text-rose-400">
        <AlertTriangle className="size-4" />
      </div>
    );
  }
  switch (item.type) {
    case 'REQUEST_APPROVED':
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
        </div>
      );
    case 'REQUEST_REJECTED':
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-600 dark:text-amber-400">
          <XCircle className="size-4" />
        </div>
      );
    case 'COMMENT_ADDED':
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-500/12 text-sky-600 dark:text-sky-400">
          <MessageSquare className="size-4" />
        </div>
      );
    default:
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/12 text-blue-600 dark:text-blue-400">
          <FilePlus2 className="size-4" />
        </div>
      );
  }
}

interface NotificationRowProps {
  item: NotificationItem;
  onOpen: () => void;
  onToggleRead: () => void;
  onHide: () => void;
}

function NotificationRow({ item, onOpen, onToggleRead, onHide }: NotificationRowProps) {
  return (
    <div
      className={cn(
        'group hover:bg-accent/60 flex items-start gap-2 px-4 py-3 transition-colors',
        !item.is_read && 'bg-blue-500/[0.04]'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
      >
        <NotificationIcon item={item} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            {!item.is_read && (
              <span
                aria-label="Chưa đọc"
                className="size-1.5 shrink-0 rounded-full bg-blue-600"
              />
            )}
            <p
              className={cn(
                'line-clamp-1 text-xs',
                !item.is_read
                  ? 'text-foreground font-semibold'
                  : 'text-foreground/85 font-medium'
              )}
            >
              {item.title}
            </p>
          </div>
          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
            {item.message}
          </p>
          <p className="text-muted-foreground pt-0.5 text-[11px] tabular-nums">
            {formatDateTime(item.created_at)}
          </p>
        </div>
      </button>

      {/* Per-item Read/Unread Toggle & Hide Actions */}
      <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-80 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onToggleRead}
          title={item.is_read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'}
          aria-label={item.is_read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'}
          className="text-muted-foreground hover:bg-background hover:text-foreground inline-flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
        >
          {item.is_read ? (
            <CircleDot className="size-3.5" />
          ) : (
            <Check className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onHide}
          title="Ẩn thông báo này"
          aria-label="Ẩn thông báo này"
          className="text-muted-foreground hover:bg-background hover:text-destructive inline-flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function NotificationCenter({
  items,
  unreadCount,
  connected,
  pushSupported,
  pushSubscribed,
  pushBusy,
  onTogglePush,
  onSelectNotification,
  onToggleRead,
  onHideNotification,
  onMarkAllRead,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const visibleItems = useMemo(
    () => (filter === 'unread' ? items.filter((i) => !i.is_read) : items),
    [items, filter]
  );

  const grouped = useMemo(() => {
    const today: NotificationItem[] = [];
    const earlier: NotificationItem[] = [];
    for (const item of visibleItems) {
      if (isSameDay(item.created_at)) {
        today.push(item);
      } else {
        earlier.push(item);
      }
    }
    return { today, earlier };
  }, [visibleItems]);

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount > 0 ? `Thông báo (${unreadCount} chưa đọc)` : 'Thông báo'}
        className="relative size-9"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="bg-rose-600 text-white absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums shadow-xs"
          >
            {badgeText}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Trung tâm thông báo"
          className="bg-popover text-popover-foreground fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Thông báo</h2>
              <span
                title={connected ? 'Đang nhận thông báo tức thì' : 'Đang đồng bộ định kỳ'}
                className={cn(
                  'size-2 rounded-full',
                  connected ? 'bg-emerald-500' : 'bg-zinc-400'
                )}
              />
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              >
                <CheckCheck className="size-3.5" />
                <span>Đọc tất cả</span>
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1.5 border-b px-4 py-2">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={cn(
                'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filter === 'all'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Tất cả <span className="ml-0.5 tabular-nums">({items.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={cn(
                'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filter === 'unread'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Chưa đọc{' '}
              {unreadCount > 0 && (
                <span className="ml-0.5 tabular-nums">({unreadCount})</span>
              )}
            </button>
          </div>

          {/* Notification List */}
          <div
            role="status"
            aria-live="polite"
            className="max-h-96 overflow-y-auto divide-y"
          >
            {visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <Bell className="text-muted-foreground/60 mb-2.5 size-7" />
                <p className="text-sm font-medium">
                  {filter === 'unread'
                    ? 'Không có thông báo chưa đọc'
                    : 'Chưa có thông báo nào'}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Mọi cập nhật mới về yêu cầu và trao đổi sẽ hiển thị tại đây.
                </p>
              </div>
            ) : (
              <>
                {grouped.today.length > 0 && (
                  <div>
                    <p className="text-muted-foreground bg-muted/40 px-4 py-1.5 text-[11px] font-medium">
                      Hôm nay
                    </p>
                    <div className="divide-y">
                      {grouped.today.map((item) => (
                        <NotificationRow
                          key={item.id}
                          item={item}
                          onOpen={() => {
                            onSelectNotification(item);
                            setOpen(false);
                          }}
                          onToggleRead={() => onToggleRead(item)}
                          onHide={() => onHideNotification(item)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {grouped.earlier.length > 0 && (
                  <div>
                    <p className="text-muted-foreground bg-muted/40 px-4 py-1.5 text-[11px] font-medium">
                      Trước đó
                    </p>
                    <div className="divide-y">
                      {grouped.earlier.map((item) => (
                        <NotificationRow
                          key={item.id}
                          item={item}
                          onOpen={() => {
                            onSelectNotification(item);
                            setOpen(false);
                          }}
                          onToggleRead={() => onToggleRead(item)}
                          onHide={() => onHideNotification(item)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer: Device Web Push Toggle */}
          <div className="bg-muted/30 flex items-center justify-between border-t px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              {pushSubscribed ? (
                <BellRing className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <BellOff className="text-muted-foreground size-3.5" />
              )}
              <span className="text-muted-foreground">Thông báo ngoài trình duyệt</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={!pushSupported || pushBusy}
              onClick={onTogglePush}
            >
              {pushBusy && <Loader2 className="size-3 animate-spin" />}
              <span>
                {!pushSupported
                  ? 'Không hỗ trợ'
                  : pushSubscribed
                    ? 'Đang bật'
                    : 'Bật ngay'}
              </span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

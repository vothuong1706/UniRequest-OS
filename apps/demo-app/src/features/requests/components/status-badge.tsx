// SPDX-License-Identifier: Apache-2.0
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RequestPriority, RequestStatus } from '../types';
import { getPriorityLabel } from '../utils/priority';

const STATUS_META: Record<RequestStatus, { label: string; dotClass: string }> = {
  PENDING: {
    label: 'Chờ duyệt',
    dotClass: 'bg-amber-500',
  },
  APPROVED: {
    label: 'Đã duyệt',
    dotClass: 'bg-emerald-500',
  },
  REJECTED: {
    label: 'Từ chối',
    dotClass: 'bg-rose-500',
  },
};

const PRIORITY_META: Record<RequestPriority, { dotClass: string }> = {
  NORMAL: { dotClass: 'bg-zinc-400' },
  HIGH: { dotClass: 'bg-orange-500' },
  URGENT: { dotClass: 'bg-rose-500' },
};

export function StatusBadge({
  status,
  className,
}: {
  status: RequestStatus;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING;
  return (
    <Badge variant="outline" className={cn('font-normal', className)}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${meta.dotClass}`} />
      <span>{meta.label}</span>
    </Badge>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: RequestPriority;
  className?: string;
}) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.NORMAL;
  return (
    <Badge variant="secondary" className={cn('text-[11px] font-normal', className)}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${meta.dotClass}`} />
      <span>{getPriorityLabel(priority)}</span>
    </Badge>
  );
}

export function CategoryBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={label}
      className={cn(
        'max-w-44 justify-start overflow-hidden text-[11px] font-normal',
        className
      )}
    >
      <span className="block min-w-0 truncate">{label}</span>
    </Badge>
  );
}

export function DepartmentBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      title={label}
      className={cn(
        'max-w-40 justify-start overflow-hidden text-[11px] font-normal',
        className
      )}
    >
      <span className="block min-w-0 truncate">{label}</span>
    </Badge>
  );
}

// SPDX-License-Identifier: Apache-2.0
import { Badge } from '@/components/ui/badge';
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

export function StatusBadge({ status }: { status: RequestStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING;
  return (
    <Badge variant="outline" className="font-normal">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${meta.dotClass}`} />
      <span>{meta.label}</span>
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: RequestPriority }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.NORMAL;
  return (
    <Badge variant="secondary" className="text-[11px] font-normal">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${meta.dotClass}`} />
      <span>{getPriorityLabel(priority)}</span>
    </Badge>
  );
}

export function CategoryBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="max-w-44 truncate text-[11px] font-normal">
      {label}
    </Badge>
  );
}

export function DepartmentBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="max-w-40 truncate text-[11px] font-normal">
      {label}
    </Badge>
  );
}

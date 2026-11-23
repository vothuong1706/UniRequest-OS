// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  Eye,
  Inbox,
  Layers,
  List,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { PageId } from '@/components/layout/nav-config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime, resolveAttachmentUrl } from '@/lib/format';
import { API_BASE_URL } from '@/services/api-client';
import type {
  DepartmentGroupItem,
  RequestCategoryItem,
  RequestItem,
  RequestStatus,
  StatusFilter,
} from '../types';
import { resolveRequestDisplay } from '../utils/priority';
import {
  CategoryBadge,
  DepartmentBadge,
  PriorityBadge,
  StatusBadge,
} from './status-badge';

interface RequestListViewProps {
  mode: 'history' | 'manage';
  requests: RequestItem[];
  categories: RequestCategoryItem[];
  departments: DepartmentGroupItem[];
  loading: boolean;
  isStaff: boolean;
  currentUsername: string;
  statusFilter: StatusFilter;
  onStatusFilterChange: (next: StatusFilter) => void;
  onRefresh: () => void;
  onInspectRequest: (request: RequestItem) => void;
  onRequestStatusChange: (request: RequestItem, nextStatus: RequestStatus) => void;
  onDeleteRequests: (ids: string[]) => Promise<void>;
  onNavigate: (page: PageId) => void;
}

interface RequestTableHeaderProps {
  isManageMode: boolean;
  isGroupedView: boolean;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelectAll: () => void;
  selectAllLabel: string;
}

function RequestTableHeader({
  isManageMode,
  isGroupedView,
  allSelected,
  someSelected,
  onToggleSelectAll,
  selectAllLabel,
}: RequestTableHeaderProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="h-9 w-8 pr-0 pl-2.5">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={onToggleSelectAll}
            aria-label={selectAllLabel}
            className="accent-primary size-4 cursor-pointer rounded align-middle"
          />
        </TableHead>
        {isManageMode && (
          <TableHead
            className={isGroupedView ? 'h-9 w-[96px] px-2' : 'h-9 w-[118px] px-2'}
          >
            Người gửi
          </TableHead>
        )}
        <TableHead className="h-9 w-[196px] min-w-[185px] max-w-[205px] px-2">
          Tiêu đề
        </TableHead>
        <TableHead className="h-9 px-2">Danh mục</TableHead>
        <TableHead className="h-9 w-9 px-1.5 text-center" title="Tệp đính kèm">
          Tệp
        </TableHead>
        <TableHead className="h-9 w-[118px] px-2">Thời gian</TableHead>
        <TableHead className="h-9 w-[92px] px-2">Trạng thái</TableHead>
        <TableHead
          className={
            isManageMode ? 'h-9 w-[178px] px-2 text-right' : 'h-9 w-11 px-2 text-right'
          }
        >
          Thao tác
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

interface RequestTableRowProps {
  req: RequestItem;
  isManageMode: boolean;
  isGroupedView: boolean;
  categories: RequestCategoryItem[];
  departments: DepartmentGroupItem[];
  selected: boolean;
  deleting: boolean;
  onToggleSelect: (id: string) => void;
  onInspectRequest: (request: RequestItem) => void;
  onRequestStatusChange: (request: RequestItem, nextStatus: RequestStatus) => void;
  onDeleteOne: (id: string) => void;
}

function RequestTableRow({
  req,
  isManageMode,
  isGroupedView,
  categories,
  departments,
  selected,
  deleting,
  onToggleSelect,
  onInspectRequest,
  onRequestStatusChange,
  onDeleteOne,
}: RequestTableRowProps) {
  const { categoryLabel, targetDepartmentLabel, priority } = resolveRequestDisplay(
    req,
    categories,
    departments
  );
  const attachmentHref = resolveAttachmentUrl(req.attachment_url, API_BASE_URL);

  return (
    <TableRow>
      <TableCell className="w-8 py-2.5 pr-0 pl-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(req.id)}
          aria-label={`Chọn yêu cầu: ${req.title}`}
          className="accent-primary size-4 cursor-pointer rounded align-middle"
        />
      </TableCell>

      {isManageMode && (
        <TableCell className="px-2 py-2.5 text-xs font-medium whitespace-nowrap">
          <div className="flex items-center gap-1">
            <span>{req.created_by}</span>
            {!isGroupedView && req.sender_group && (
              <Badge
                variant="outline"
                className="px-1 py-0 text-[10px] font-normal"
                title={`Lớp ${req.sender_group}`}
              >
                {req.sender_group}
              </Badge>
            )}
          </div>
        </TableCell>
      )}

      <TableCell className="w-[196px] min-w-[185px] max-w-[205px] px-2 py-2.5">
        <button
          type="button"
          onClick={() => onInspectRequest(req)}
          title={req.title}
          aria-label={`Xem chi tiết yêu cầu: ${req.title}`}
          className="focus-visible:ring-ring block w-[180px] min-w-0 cursor-pointer rounded-xs text-left hover:underline focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
        >
          <span className="block truncate font-medium">{req.title}</span>
        </button>
      </TableCell>

      <TableCell className="px-2 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <CategoryBadge
            label={categoryLabel}
            className={priority !== 'NORMAL' ? 'max-w-[104px]' : 'max-w-[136px]'}
          />
          {!isManageMode && !isGroupedView && targetDepartmentLabel && (
            <DepartmentBadge label={targetDepartmentLabel} className="max-w-28" />
          )}
          {priority !== 'NORMAL' && (
            <PriorityBadge priority={priority} className="px-1.5 py-0 text-[10px]" />
          )}
        </div>
      </TableCell>

      <TableCell className="w-9 px-1.5 py-2.5 text-center whitespace-nowrap">
        {attachmentHref ? (
          <a
            href={attachmentHref}
            target="_blank"
            rel="noreferrer"
            title="Xem tệp đính kèm"
            aria-label={`Xem tệp đính kèm của ${req.title}`}
            className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-7 items-center justify-center rounded-md transition-colors"
          >
            <Paperclip className="size-3.5" />
          </a>
        ) : (
          <span
            className="text-muted-foreground text-xs"
            aria-label="Không có tệp đính kèm"
          >
            -
          </span>
        )}
      </TableCell>

      <TableCell className="text-muted-foreground px-2 py-2.5 text-xs whitespace-nowrap tabular-nums">
        {formatDateTime(req.created_at)}
      </TableCell>

      <TableCell className="px-2 py-2.5 whitespace-nowrap">
        <StatusBadge status={req.status} className="px-1.5 text-[11px]" />
      </TableCell>

      <TableCell className="px-2 py-2.5 text-right whitespace-nowrap">
        <div className="inline-flex items-center justify-end gap-1">
          {isManageMode && req.status === 'PENDING' && (
            <>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onRequestStatusChange(req, 'APPROVED')}
              >
                <Check className="size-3.5" />
                <span>Duyệt</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => onRequestStatusChange(req, 'REJECTED')}
              >
                <X className="size-3.5" />
                <span>Từ chối</span>
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Mở menu thao tác cho ${req.title}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onInspectRequest(req)}>
                <Eye />
                <span>Xem chi tiết</span>
              </DropdownMenuItem>
              {isManageMode && req.status === 'PENDING' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onRequestStatusChange(req, 'APPROVED')}
                  >
                    <Check />
                    <span>Phê duyệt</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onRequestStatusChange(req, 'REJECTED')}
                  >
                    <X />
                    <span>Từ chối</span>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={deleting}
                onClick={() => onDeleteOne(req.id)}
              >
                <Trash2 />
                <span>Xóa yêu cầu</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function RequestListView({
  mode,
  requests,
  categories,
  departments,
  loading,
  isStaff,
  currentUsername,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onInspectRequest,
  onRequestStatusChange,
  onDeleteRequests,
  onNavigate,
}: RequestListViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [groupByDepartment, setGroupByDepartment] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const isManageMode = mode === 'manage' && isStaff;

  const scopedRequests = useMemo(() => {
    if (isManageMode) {
      return requests.filter((item) => !item.hidden_by_receiver);
    }
    return requests.filter(
      (item) =>
        !item.hidden_by_sender &&
        (!isStaff || !currentUsername || item.created_by === currentUsername)
    );
  }, [requests, isManageMode, isStaff, currentUsername]);

  const availableDepartments = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const req of scopedRequests) {
      let key: string;
      let label: string;
      if (isManageMode) {
        key = (req.sender_group || '').trim() || 'NO_GROUP';
        label = key === 'NO_GROUP' ? 'Chưa gắn lớp' : key;
      } else {
        key = (req.target_department || '').trim().replace(/^\/+/, '') || 'OTHER';
        const { targetDepartmentLabel } = resolveRequestDisplay(
          req,
          categories,
          departments
        );
        label = targetDepartmentLabel || (key === 'OTHER' ? 'Chưa phân ban' : key);
      }
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { key, label, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [scopedRequests, isManageMode, categories, departments]);

  const activeDepartmentFilter =
    departmentFilter !== 'ALL' &&
    availableDepartments.some((d) => d.key === departmentFilter)
      ? departmentFilter
      : 'ALL';

  const departmentScopedRequests = useMemo(() => {
    if (activeDepartmentFilter === 'ALL') return scopedRequests;
    return scopedRequests.filter((req) => {
      const key = isManageMode
        ? (req.sender_group || '').trim() || 'NO_GROUP'
        : (req.target_department || '').trim().replace(/^\/+/, '') || 'OTHER';
      return key === activeDepartmentFilter;
    });
  }, [scopedRequests, isManageMode, activeDepartmentFilter]);

  const counts = useMemo(
    () => ({
      ALL: departmentScopedRequests.length,
      PENDING: departmentScopedRequests.filter((r) => r.status === 'PENDING').length,
      APPROVED: departmentScopedRequests.filter((r) => r.status === 'APPROVED').length,
      REJECTED: departmentScopedRequests.filter((r) => r.status === 'REJECTED').length,
    }),
    [departmentScopedRequests]
  );

  const filteredRequests = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return departmentScopedRequests.filter((req) => {
      if (statusFilter !== 'ALL' && req.status !== statusFilter) return false;
      if (!keyword) return true;
      const { categoryLabel, targetDepartmentLabel, cleanDescription } =
        resolveRequestDisplay(req, categories, departments);
      return (
        req.title.toLowerCase().includes(keyword) ||
        categoryLabel.toLowerCase().includes(keyword) ||
        (targetDepartmentLabel?.toLowerCase().includes(keyword) ?? false) ||
        (req.sender_group?.toLowerCase().includes(keyword) ?? false) ||
        cleanDescription.toLowerCase().includes(keyword) ||
        req.created_by.toLowerCase().includes(keyword) ||
        (req.review_note?.toLowerCase().includes(keyword) ?? false)
      );
    });
  }, [departmentScopedRequests, categories, departments, statusFilter, searchQuery]);

  const groupedByDepartmentList = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; pending: number; items: RequestItem[] }
    >();
    for (const req of filteredRequests) {
      let key: string;
      let label: string;
      if (isManageMode) {
        key = (req.sender_group || '').trim() || 'NO_GROUP';
        label = key === 'NO_GROUP' ? 'Chưa gắn lớp' : key;
      } else {
        key = (req.target_department || '').trim().replace(/^\/+/, '') || 'OTHER';
        const { targetDepartmentLabel } = resolveRequestDisplay(
          req,
          categories,
          departments
        );
        label = targetDepartmentLabel || (key === 'OTHER' ? 'Chưa phân ban' : key);
      }
      let group = map.get(key);
      if (!group) {
        group = { key, label, pending: 0, items: [] };
        map.set(key, group);
      }
      if (req.status === 'PENDING') group.pending += 1;
      group.items.push(req);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (b.pending !== a.pending) return b.pending - a.pending;
      return a.label.localeCompare(b.label, 'vi');
    });
  }, [filteredRequests, isManageMode, categories, departments]);

  const visibleSelectedIds = useMemo(() => {
    const visibleSet = new Set(filteredRequests.map((r) => r.id));
    return selectedIds.filter((id) => visibleSet.has(id));
  }, [filteredRequests, selectedIds]);

  const visibleSelectedSet = useMemo(
    () => new Set(visibleSelectedIds),
    [visibleSelectedIds]
  );

  const allVisibleSelected =
    filteredRequests.length > 0 && visibleSelectedIds.length === filteredRequests.length;
  const someVisibleSelected =
    visibleSelectedIds.length > 0 && visibleSelectedIds.length < filteredRequests.length;

  const toggleSelectBatch = (ids: string[]) => {
    if (ids.length === 0) return;
    const allInBatchSelected = ids.every((id) => visibleSelectedSet.has(id));
    if (allInBatchSelected) {
      const batchSet = new Set(ids);
      setSelectedIds((prev) => prev.filter((id) => !batchSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteIds = async (ids: string[]) => {
    if (ids.length === 0 || deleting) return;
    setDeleting(true);
    try {
      await onDeleteRequests(ids);
      const removed = new Set(ids);
      setSelectedIds((prev) => prev.filter((id) => !removed.has(id)));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isManageMode ? 'Quản lý & Phê duyệt' : 'Yêu cầu của tôi'}
        </h1>

        <div className="flex items-center gap-2">
          {visibleSelectedIds.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              disabled={deleting}
              onClick={() => void handleDeleteIds(visibleSelectedIds)}
              aria-label={`Xóa ${visibleSelectedIds.length} yêu cầu đã chọn`}
              title={`Xóa ${visibleSelectedIds.length} yêu cầu đã chọn`}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
            <span>Làm mới</span>
          </Button>
          {!isManageMode && (
            <Button type="button" size="sm" onClick={() => onNavigate('create')}>
              <Plus className="size-3.5" />
              <span>Tạo yêu cầu</span>
            </Button>
          )}
        </div>
      </div>

      {/* Data Table Toolbar */}
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tiêu đề, danh mục, người gửi..."
              className="pr-8 pl-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {availableDepartments.length > 1 && (
            <select
              value={activeDepartmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              aria-label={isManageMode ? 'Lọc theo lớp / nhóm gửi' : 'Lọc theo phòng ban'}
              className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/35 h-9 rounded-md border px-2.5 text-xs outline-none focus-visible:ring-1"
            >
              <option value="ALL">
                {isManageMode
                  ? `Tất cả lớp / nhóm (${availableDepartments.length})`
                  : `Tất cả phòng ban (${availableDepartments.length})`}
              </option>
              {availableDepartments.map((dept) => (
                <option key={dept.key} value={dept.key}>
                  {dept.label} ({dept.count})
                </option>
              ))}
            </select>
          )}

          {availableDepartments.length > 1 && (
            <Button
              type="button"
              variant={groupByDepartment ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setGroupByDepartment((prev) => !prev)}
            >
              {groupByDepartment ? (
                <List className="size-3.5" />
              ) : (
                <Layers className="size-3.5" />
              )}
              <span>
                {groupByDepartment
                  ? 'Xem phẳng'
                  : isManageMode
                    ? 'Gom theo Lớp'
                    : 'Gom theo Ban'}
              </span>
            </Button>
          )}
        </div>

        <Tabs
          value={statusFilter}
          onValueChange={(value) => onStatusFilterChange(value as StatusFilter)}
        >
          <TabsList className="w-full overflow-x-auto md:w-auto">
            <TabsTrigger value="ALL">
              Tất cả{' '}
              <span className="text-muted-foreground tabular-nums">{counts.ALL}</span>
            </TabsTrigger>
            <TabsTrigger value="PENDING">
              Chờ duyệt{' '}
              <span className="text-muted-foreground tabular-nums">{counts.PENDING}</span>
            </TabsTrigger>
            <TabsTrigger value="APPROVED">
              Đã duyệt{' '}
              <span className="text-muted-foreground tabular-nums">
                {counts.APPROVED}
              </span>
            </TabsTrigger>
            <TabsTrigger value="REJECTED">
              Từ chối{' '}
              <span className="text-muted-foreground tabular-nums">
                {counts.REJECTED}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Bordered Data Table */}
      <div className="bg-card overflow-hidden rounded-xl border shadow-xs">
        {filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <Inbox className="text-muted-foreground mb-3 size-8" />
            <p className="text-sm font-medium">
              {scopedRequests.length === 0
                ? 'Chưa có yêu cầu nào'
                : 'Không có kết quả phù hợp'}
            </p>
            {(searchQuery ||
              statusFilter !== 'ALL' ||
              activeDepartmentFilter !== 'ALL') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery('');
                  setDepartmentFilter('ALL');
                  onStatusFilterChange('ALL');
                }}
              >
                Đặt lại bộ lọc
              </Button>
            )}
          </div>
        ) : groupByDepartment && groupedByDepartmentList.length > 0 ? (
          <div className="divide-y">
            {groupedByDepartmentList.map((group) => {
              const groupIds = group.items.map((item) => item.id);
              const groupSelectedCount = groupIds.filter((id) =>
                visibleSelectedSet.has(id)
              ).length;
              const allGroupSelected =
                groupIds.length > 0 && groupSelectedCount === groupIds.length;
              const someGroupSelected =
                groupSelectedCount > 0 && groupSelectedCount < groupIds.length;

              return (
                <div key={group.key}>
                  <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="text-foreground size-4 shrink-0" />
                      <span className="text-sm font-semibold">{group.label}</span>
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        {group.items.length} hồ sơ
                      </Badge>
                    </div>
                    {group.pending > 0 && (
                      <span className="text-xs font-medium text-amber-600 tabular-nums dark:text-amber-400">
                        {group.pending} chờ duyệt
                      </span>
                    )}
                  </div>
                  <Table>
                    <RequestTableHeader
                      isManageMode={isManageMode}
                      isGroupedView
                      allSelected={allGroupSelected}
                      someSelected={someGroupSelected}
                      onToggleSelectAll={() => toggleSelectBatch(groupIds)}
                      selectAllLabel={`Chọn tất cả trong ${group.label}`}
                    />
                    <TableBody>
                      {group.items.map((req) => (
                        <RequestTableRow
                          key={req.id}
                          req={req}
                          isManageMode={isManageMode}
                          isGroupedView
                          categories={categories}
                          departments={departments}
                          selected={visibleSelectedSet.has(req.id)}
                          deleting={deleting}
                          onToggleSelect={toggleSelectOne}
                          onInspectRequest={onInspectRequest}
                          onRequestStatusChange={onRequestStatusChange}
                          onDeleteOne={(id) => void handleDeleteIds([id])}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </div>
        ) : (
          <Table>
            <RequestTableHeader
              isManageMode={isManageMode}
              isGroupedView={false}
              allSelected={allVisibleSelected}
              someSelected={someVisibleSelected}
              onToggleSelectAll={() =>
                toggleSelectBatch(filteredRequests.map((r) => r.id))
              }
              selectAllLabel="Chọn tất cả"
            />
            <TableBody>
              {filteredRequests.map((req) => (
                <RequestTableRow
                  key={req.id}
                  req={req}
                  isManageMode={isManageMode}
                  isGroupedView={false}
                  categories={categories}
                  departments={departments}
                  selected={visibleSelectedSet.has(req.id)}
                  deleting={deleting}
                  onToggleSelect={toggleSelectOne}
                  onInspectRequest={onInspectRequest}
                  onRequestStatusChange={onRequestStatusChange}
                  onDeleteOne={(id) => void handleDeleteIds([id])}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

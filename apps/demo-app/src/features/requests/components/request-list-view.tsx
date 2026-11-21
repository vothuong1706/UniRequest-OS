import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Eye,
  Inbox,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { PageId } from '@/components/layout/nav-config';
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
import { formatDateTime } from '@/lib/format';
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

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

  const counts = useMemo(
    () => ({
      ALL: scopedRequests.length,
      PENDING: scopedRequests.filter((r) => r.status === 'PENDING').length,
      APPROVED: scopedRequests.filter((r) => r.status === 'APPROVED').length,
      REJECTED: scopedRequests.filter((r) => r.status === 'REJECTED').length,
    }),
    [scopedRequests]
  );

  const filteredRequests = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return scopedRequests.filter((req) => {
      if (statusFilter !== 'ALL' && req.status !== statusFilter) return false;
      if (!keyword) return true;
      const { categoryLabel, targetDepartmentLabel, cleanDescription } =
        resolveRequestDisplay(req, categories, departments);
      return (
        req.title.toLowerCase().includes(keyword) ||
        categoryLabel.toLowerCase().includes(keyword) ||
        (targetDepartmentLabel?.toLowerCase().includes(keyword) ?? false) ||
        cleanDescription.toLowerCase().includes(keyword) ||
        req.created_by.toLowerCase().includes(keyword) ||
        (req.review_note?.toLowerCase().includes(keyword) ?? false)
      );
    });
  }, [scopedRequests, categories, departments, statusFilter, searchQuery]);

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

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(filteredRequests.map((r) => r.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...filteredRequests.map((r) => r.id)]))
      );
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
              aria-label="Xóa các yêu cầu đã chọn"
              title="Xóa"
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
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-xs">
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
            {(searchQuery || statusFilter !== 'ALL') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery('');
                  onStatusFilterChange('ALL');
                }}
              >
                Đặt lại bộ lọc
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pr-0">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả"
                    className="accent-primary size-4 cursor-pointer rounded align-middle"
                  />
                </TableHead>
                {isManageMode && <TableHead>Người gửi</TableHead>}
                <TableHead>Tiêu đề</TableHead>
                <TableHead>Danh mục</TableHead>
                <TableHead>Đính kèm</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.map((req) => {
                const {
                  categoryLabel,
                  targetDepartmentLabel,
                  priority,
                  cleanDescription,
                } = resolveRequestDisplay(req, categories, departments);

                return (
                  <TableRow key={req.id}>
                    <TableCell className="w-10 pr-0">
                      <input
                        type="checkbox"
                        checked={visibleSelectedSet.has(req.id)}
                        onChange={() => toggleSelectOne(req.id)}
                        aria-label={`Chọn ${req.title}`}
                        className="accent-primary size-4 cursor-pointer rounded align-middle"
                      />
                    </TableCell>
                    {isManageMode && (
                      <TableCell className="whitespace-nowrap text-xs font-medium">
                        {req.created_by}
                      </TableCell>
                    )}

                    <TableCell className="max-w-sm">
                      <button
                        type="button"
                        onClick={() => onInspectRequest(req)}
                        className="cursor-pointer text-left hover:underline"
                      >
                        <p className="font-medium">{req.title}</p>
                      </button>
                      {cleanDescription && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                          {cleanDescription}
                        </p>
                      )}
                      {req.review_note && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px] italic">
                          Phản hồi: {req.review_note}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CategoryBadge label={categoryLabel} />
                        {targetDepartmentLabel && (
                          <DepartmentBadge label={targetDepartmentLabel} />
                        )}
                        {priority !== 'NORMAL' && <PriorityBadge priority={priority} />}
                      </div>
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {req.attachment_url ? (
                        <a
                          href={req.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                        >
                          <Paperclip className="size-3.5" />
                          <span>Xem tệp</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs"> - </span>
                      )}
                    </TableCell>

                    <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
                      {formatDateTime(req.created_at)}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      <StatusBadge status={req.status} />
                    </TableCell>

                    <TableCell className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {isManageMode && req.status === 'PENDING' && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onRequestStatusChange(req, 'APPROVED')}
                            >
                              <Check className="size-3.5" />
                              <span>Duyệt</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onRequestStatusChange(req, 'REJECTED')}
                            >
                              <X className="size-3.5" />
                              <span>Từ chối</span>
                            </Button>
                          </>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={deleting}
                          onClick={() => void handleDeleteIds([req.id])}
                          className="text-muted-foreground hover:text-destructive size-8"
                          aria-label={`Xóa ${req.title}`}
                          title="Xóa"
                        >
                          <Trash2 className="size-4" />
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label="Mở menu thao tác"
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
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

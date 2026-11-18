import { useMemo, useState } from 'react';
import {
  Check,
  Eye,
  Inbox,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
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
  RequestCategoryItem,
  RequestItem,
  RequestStatus,
  StatusFilter,
} from '../types';
import { resolveRequestDisplay } from '../utils/priority';
import { CategoryBadge, PriorityBadge, StatusBadge } from './status-badge';

interface RequestListViewProps {
  mode: 'history' | 'manage';
  requests: RequestItem[];
  categories: RequestCategoryItem[];
  loading: boolean;
  isStaff: boolean;
  currentUsername: string;
  statusFilter: StatusFilter;
  onStatusFilterChange: (next: StatusFilter) => void;
  onRefresh: () => void;
  onInspectRequest: (request: RequestItem) => void;
  onRequestStatusChange: (request: RequestItem, nextStatus: RequestStatus) => void;
  onNavigate: (page: PageId) => void;
}

export function RequestListView({
  mode,
  requests,
  categories,
  loading,
  isStaff,
  currentUsername,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onInspectRequest,
  onRequestStatusChange,
  onNavigate,
}: RequestListViewProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const isManageMode = mode === 'manage' && isStaff;

  const scopedRequests = useMemo(() => {
    if (isManageMode || !isStaff || !currentUsername) {
      return requests;
    }
    return requests.filter((item) => item.created_by === currentUsername);
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
      const { categoryLabel, cleanDescription } = resolveRequestDisplay(req, categories);
      return (
        req.title.toLowerCase().includes(keyword) ||
        categoryLabel.toLowerCase().includes(keyword) ||
        cleanDescription.toLowerCase().includes(keyword) ||
        req.created_by.toLowerCase().includes(keyword) ||
        (req.review_note?.toLowerCase().includes(keyword) ?? false)
      );
    });
  }, [scopedRequests, categories, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isManageMode ? 'Quản lý & Phê duyệt' : 'Yêu cầu của tôi'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isManageMode
              ? 'Xem xét và phê duyệt các yêu cầu gửi tới nhà trường.'
              : 'Theo dõi trạng thái và phản hồi cho các yêu cầu của bạn.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
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
            <p className="text-muted-foreground mt-1 text-xs">
              {scopedRequests.length === 0
                ? 'Tạo yêu cầu mới hoặc bấm Làm mới để đồng bộ dữ liệu.'
                : 'Thử xóa bộ lọc hoặc nhập từ khóa khác.'}
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
                const { categoryLabel, priority, cleanDescription } =
                  resolveRequestDisplay(req, categories);

                return (
                  <TableRow key={req.id}>
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
                      <div className="flex items-center gap-1.5">
                        <CategoryBadge label={categoryLabel} />
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

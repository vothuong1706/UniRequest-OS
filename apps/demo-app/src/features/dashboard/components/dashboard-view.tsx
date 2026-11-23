// SPDX-License-Identifier: Apache-2.0
import { useMemo } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Inbox,
  Paperclip,
  Plus,
  RefreshCw,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { KeycloakProfile } from '@/auth/keycloak';
import type { PageId } from '@/components/layout/nav-config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CategoryBadge,
  DepartmentBadge,
  PriorityBadge,
  StatusBadge,
} from '@/features/requests/components/status-badge';
import type {
  DepartmentGroupItem,
  RequestAnalytics,
  RequestCategoryItem,
  RequestItem,
  StatusFilter,
} from '@/features/requests/types';
import { resolveRequestDisplay } from '@/features/requests/utils/priority';
import { formatDateTime, getDateKeyInAppTimezone } from '@/lib/format';

interface DashboardViewProps {
  requests: RequestItem[];
  categories: RequestCategoryItem[];
  departments: DepartmentGroupItem[];
  analytics: RequestAnalytics | null;
  loading: boolean;
  isStaff: boolean;
  userInfo: KeycloakProfile | null;
  onRefresh: () => void;
  onNavigate: (page: PageId) => void;
  onOpenFilteredList: (page: PageId, filter: StatusFilter) => void;
  onInspectRequest: (request: RequestItem) => void;
}

function formatShortDay(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

export function DashboardView({
  requests,
  categories,
  departments,
  analytics,
  loading,
  isStaff,
  userInfo,
  onRefresh,
  onNavigate,
  onOpenFilteredList,
  onInspectRequest,
}: DashboardViewProps) {
  const totalCount = analytics?.total ?? requests.length;
  const pendingCount =
    analytics?.by_status.PENDING ?? requests.filter((r) => r.status === 'PENDING').length;
  const approvedCount =
    analytics?.by_status.APPROVED ??
    requests.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount =
    analytics?.by_status.REJECTED ??
    requests.filter((r) => r.status === 'REJECTED').length;

  const completionRate =
    analytics?.completion_rate ??
    (totalCount > 0
      ? Math.round(((approvedCount + rejectedCount) / totalCount) * 100)
      : 0);

  const targetListPage: PageId = isStaff ? 'manage' : 'history';
  const greetingName =
    userInfo?.given_name || userInfo?.name || userInfo?.preferred_username || 'bạn';

  const kpiCards = [
    {
      label: 'Tổng yêu cầu',
      value: totalCount,
      icon: Inbox,
      filter: 'ALL' as StatusFilter,
    },
    {
      label: 'Chờ duyệt',
      value: pendingCount,
      icon: Clock,
      filter: 'PENDING' as StatusFilter,
    },
    {
      label: 'Đã duyệt',
      value: approvedCount,
      icon: CheckCircle2,
      filter: 'APPROVED' as StatusFilter,
    },
    {
      label: 'Từ chối',
      value: rejectedCount,
      icon: XCircle,
      filter: 'REJECTED' as StatusFilter,
    },
  ];

  // Build 7-day trend series (fill missing days with 0 for a balanced chart)
  const dailyTrend = useMemo(() => {
    const map = new Map<string, number>();
    for (const point of analytics?.daily_trend ?? []) {
      map.set(point.date, point.total);
    }

    const days: Array<{ date: string; label: string; total: number }> = [];
    const today = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const iso = getDateKeyInAppTimezone(new Date(today.getTime() - i * 86_400_000));
      days.push({
        date: iso,
        label: formatShortDay(iso),
        total: map.get(iso) ?? 0,
      });
    }
    return days;
  }, [analytics]);

  const maxDailyTotal = Math.max(1, ...dailyTrend.map((d) => d.total));

  // Top dynamic categories for staff analytics
  const categoryStats = useMemo(() => {
    if (analytics?.categories && analytics.categories.length > 0) {
      return analytics.categories.slice(0, 6);
    }
    const counts = new Map<
      string,
      { code: string; name: string; department: string; count: number }
    >();
    for (const req of requests) {
      const { categoryCode, categoryLabel, department } = resolveRequestDisplay(
        req,
        categories
      );
      const existing = counts.get(categoryCode);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(categoryCode, {
          code: categoryCode,
          name: categoryLabel,
          department,
          count: 1,
        });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [analytics, requests, categories]);

  const recentRequests = requests.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Xin chào, {greetingName}
        </h1>

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
          {isStaff && pendingCount > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onNavigate('create')}
              >
                <Plus className="size-3.5" />
                <span>Tạo yêu cầu</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenFilteredList('manage', 'PENDING')}
              >
                <span>Xử lý ngay ({pendingCount})</span>
                <ArrowUpRight className="size-3.5" />
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => onNavigate('create')}>
              <Plus className="size-3.5" />
              <span>Tạo yêu cầu</span>
            </Button>
          )}
        </div>
      </div>

      {/* 4 Minimal KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.label}
              onClick={() => onOpenFilteredList(targetListPage, item.filter)}
              className="hover:border-foreground/20 cursor-pointer gap-2 py-5 transition-colors"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardDescription className="text-xs font-medium">
                  {item.label}
                </CardDescription>
                <Icon className="text-muted-foreground size-4" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight tabular-nums">
                  {item.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Staff / Admin Analytics Only */}
      {isStaff && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 7-Day Trend Bar Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4" />
                <span>Xu hướng 7 ngày gần nhất</span>
              </CardTitle>
              {analytics?.avg_resolution_hours !== null &&
                analytics?.avg_resolution_hours !== undefined && (
                  <Badge variant="outline" className="font-normal tabular-nums">
                    TB {analytics.avg_resolution_hours}h
                  </Badge>
                )}
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid h-44 grid-cols-7 items-end gap-2">
                {dailyTrend.map((day) => {
                  const heightPct =
                    day.total > 0
                      ? Math.max(12, Math.round((day.total / maxDailyTotal) * 100))
                      : 4;
                  return (
                    <div
                      key={day.date}
                      className="flex h-full flex-col items-center justify-end gap-1.5"
                    >
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        {day.total > 0 ? day.total : ''}
                      </span>
                      <div className="bg-muted flex h-32 w-full items-end overflow-hidden rounded-md">
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={
                            day.total > 0
                              ? 'bg-primary w-full rounded-md transition-all'
                              : 'bg-border/60 w-full rounded-md'
                          }
                        />
                      </div>
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        {day.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Dynamic Category Distribution */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4" />
                <span>Phân bổ theo danh mục</span>
              </CardTitle>
              <Badge variant="outline" className="font-normal tabular-nums">
                Hoàn tất {completionRate}%
              </Badge>
            </CardHeader>

            <CardContent className="pt-4">
              {categoryStats.length === 0 ? (
                <div className="text-muted-foreground flex h-44 items-center justify-center text-xs">
                  Chưa có dữ liệu thống kê theo danh mục.
                </div>
              ) : (
                <div className="space-y-3.5">
                  {categoryStats.map((cat) => {
                    const pct =
                      totalCount > 0 ? Math.round((cat.count / totalCount) * 100) : 0;
                    return (
                      <div key={cat.code} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium">{cat.name}</span>
                          <span className="text-muted-foreground shrink-0 tabular-nums">
                            {cat.count} ({pct}%)
                          </span>
                        </div>
                        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                          <div
                            style={{ width: `${pct}%` }}
                            className="bg-primary h-full rounded-full transition-all"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Requests Data Table */}
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4">
          <div>
            <CardTitle className="text-base">Yêu cầu gần đây</CardTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenFilteredList(targetListPage, 'ALL')}
          >
            <span>Xem tất cả</span>
            <ArrowUpRight className="size-3.5" />
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {recentRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <Inbox className="text-muted-foreground mb-3 size-8" />
              <p className="text-sm font-medium">Chưa có yêu cầu nào</p>
              {!isStaff && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  onClick={() => onNavigate('create')}
                >
                  <Plus className="size-3.5" />
                  <span>Tạo yêu cầu</span>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Tiêu đề</TableHead>
                  {isStaff && <TableHead>Người gửi</TableHead>}
                  <TableHead>Danh mục</TableHead>
                  <TableHead>Đính kèm</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead className="text-right">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRequests.map((req) => {
                  const {
                    categoryLabel,
                    targetDepartmentLabel,
                    priority,
                    cleanDescription,
                  } = resolveRequestDisplay(req, categories, departments);

                  return (
                    <TableRow
                      key={req.id}
                      onClick={() => onInspectRequest(req)}
                      className="cursor-pointer"
                    >
                      <TableCell className="max-w-xs">
                        <p className="truncate font-medium">{req.title}</p>
                        {cleanDescription && (
                          <p className="text-muted-foreground truncate text-xs">
                            {cleanDescription}
                          </p>
                        )}
                      </TableCell>
                      {isStaff && (
                        <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                          {req.created_by}
                        </TableCell>
                      )}
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
                          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                            <Paperclip className="size-3" />
                            <span>Có tệp</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs"> - </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
                        {formatDateTime(req.created_at)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <StatusBadge status={req.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

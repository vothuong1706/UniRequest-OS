// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import {
  getRawUserRoles,
  getTokenUsername,
  getUserGroups,
  initKeycloak,
  isStaffOrLecturer,
  loadUserProfile,
  login,
  logout,
  type KeycloakProfile,
} from '@/auth/keycloak';
import { AppShell } from '@/components/layout/app-shell';
import type { PageId } from '@/components/layout/nav-config';
import { useTheme } from '@/components/theme/theme-context';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { LoginScreen } from '@/features/auth/components/login-screen';
import { AiAssistantView } from '@/features/assistant/components/ai-assistant-view';
import { CategoriesView } from '@/features/categories/components/categories-view';
import { DashboardView } from '@/features/dashboard/components/dashboard-view';
import { NotificationCenter } from '@/features/notifications/components/notification-center';
import { useRealtimeSocket } from '@/features/notifications/hooks/use-realtime-socket';
import { useWebPush } from '@/features/notifications/hooks/use-web-push';
import { ConfirmStatusDialog } from '@/features/requests/components/confirm-status-dialog';
import { RequestDetailDialog } from '@/features/requests/components/request-detail-dialog';
import { RequestFormView } from '@/features/requests/components/request-form-view';
import { RequestListView } from '@/features/requests/components/request-list-view';
import type {
  DepartmentGroupItem,
  NotificationItem,
  RequestAnalytics,
  RequestCategoryItem,
  RequestCommentItem,
  RequestDeleteMode,
  RequestItem,
  RequestStatus,
  StatusFilter,
} from '@/features/requests/types';
import {
  categoriesApi,
  departmentsApi,
  notificationsApi,
  requestsApi,
} from '@/services/api-client';

function PortalWorkspace() {
  const { theme } = useTheme();

  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<KeycloakProfile | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [categories, setCategories] = useState<RequestCategoryItem[]>([]);
  const [managedCategories, setManagedCategories] = useState<RequestCategoryItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentGroupItem[]>([]);
  const [analytics, setAnalytics] = useState<RequestAnalytics | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);

  const [inspectedRequest, setInspectedRequest] = useState<RequestItem | null>(null);
  const [latestComment, setLatestComment] = useState<RequestCommentItem | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    request: RequestItem;
    nextStatus: RequestStatus;
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const deepLinkHandledRef = useRef(false);
  const notificationsRef = useRef<NotificationItem[]>([]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const userGroups = getUserGroups();
  const isStaff = isStaffOrLecturer(userRoles, userGroups);
  const currentUsername = userInfo?.preferred_username || getTokenUsername();

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.list(40);
      if (res.success && res.data) {
        setNotifications(res.data.items);
        setUnreadCount(res.data.unread_count);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  const markRequestNotificationsRead = useCallback(
    (requestId: string) => {
      const matchingUnread = notificationsRef.current.filter(
        (n) => n.request_id === requestId && !n.is_read
      );
      if (matchingUnread.length > 0) {
        setNotifications((prev) =>
          prev.map((n) => (n.request_id === requestId ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - matchingUnread.length));
      }
      void notificationsApi
        .markReadByRequest(requestId)
        .catch(() => void loadNotifications());
    },
    [loadNotifications]
  );

  const openRequestById = useCallback(
    async (requestId: string) => {
      markRequestNotificationsRead(requestId);
      const existing = requests.find((r) => r.id === requestId);
      if (existing) {
        setInspectedRequest(existing);
        return;
      }
      try {
        const res = await requestsApi.detail(requestId);
        if (res.success && res.data) {
          setInspectedRequest(res.data);
        }
      } catch {
        toast.error('Không tìm thấy yêu cầu tương ứng.');
      }
    },
    [requests, markRequestNotificationsRead]
  );

  const handleInspectRequest = useCallback(
    (request: RequestItem) => {
      setInspectedRequest(request);
      markRequestNotificationsRead(request.id);
    },
    [markRequestNotificationsRead]
  );

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const [activeRes, manageRes] = await Promise.all([
        categoriesApi.list(false),
        categoriesApi.list(true),
      ]);
      if (activeRes.success && Array.isArray(activeRes.data)) {
        setCategories(activeRes.data);
      }
      if (manageRes.success && Array.isArray(manageRes.data)) {
        setManagedCategories(manageRes.data);
      }
    } catch {
      // Fall back gracefully
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const loadDepartments = useCallback(async (forceRefresh = false) => {
    setLoadingDepartments(true);
    try {
      const res = await departmentsApi.list(forceRefresh);
      if (res.success && Array.isArray(res.data)) {
        setDepartments(res.data);
      }
    } catch {
      // Fall back gracefully
    } finally {
      setLoadingDepartments(false);
    }
  }, []);

  const refreshRequestsSilently = useCallback(async () => {
    try {
      const [listRes, analyticsRes] = await Promise.all([
        requestsApi.list(),
        requestsApi.analytics().catch(() => null),
      ]);
      if (listRes.success && Array.isArray(listRes.data)) {
        setRequests(listRes.data);
        setInspectedRequest((prev) => {
          if (!prev) return null;
          return listRes.data?.find((item) => item.id === prev.id) ?? prev;
        });
      }
      if (analyticsRes?.success && analyticsRes.data) {
        setAnalytics(analyticsRes.data);
      }
    } catch {
      // Ignore silent sync error
    }
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const [
        listRes,
        analyticsRes,
        activeCategoriesRes,
        manageCategoriesRes,
        departmentsRes,
        notiRes,
      ] = await Promise.all([
        requestsApi.list(),
        requestsApi.analytics().catch(() => null),
        categoriesApi.list(false).catch(() => null),
        categoriesApi.list(true).catch(() => null),
        departmentsApi.list().catch(() => null),
        notificationsApi.list(40).catch(() => null),
      ]);

      if (listRes.success && Array.isArray(listRes.data)) {
        setRequests(listRes.data);
      }
      if (analyticsRes?.success && analyticsRes.data) {
        setAnalytics(analyticsRes.data);
      }
      if (activeCategoriesRes?.success && Array.isArray(activeCategoriesRes.data)) {
        setCategories(activeCategoriesRes.data);
      }
      if (manageCategoriesRes?.success && Array.isArray(manageCategoriesRes.data)) {
        setManagedCategories(manageCategoriesRes.data);
      }
      if (departmentsRes?.success && Array.isArray(departmentsRes.data)) {
        setDepartments(departmentsRes.data);
      }
      if (notiRes?.success && notiRes.data) {
        setNotifications(notiRes.data.items);
        setUnreadCount(notiRes.data.unread_count);
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Không thể tải yêu cầu: ${err.message}`
          : 'Không thể tải danh sách yêu cầu.'
      );
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  // Realtime Socket.IO subscription
  const handleIncomingNotification = useCallback(
    (item: NotificationItem) => {
      // Avoid notifying the actor for their own group broadcast
      if (item.recipient_role === 'staff' && item.actor === currentUsername) {
        return;
      }

      // Deduplicate BEFORE touching unreadCount
      if (notificationsRef.current.some((existing) => existing.id === item.id)) {
        return;
      }

      setNotifications((prev) => [item, ...prev].slice(0, 40));
      setUnreadCount((prev) => prev + 1);

      const action = item.request_id
        ? {
            label: 'Xem ngay',
            onClick: () => {
              void openRequestById(item.request_id!);
            },
          }
        : undefined;

      // UI/UX Pro Max (uupm.cc) WCAG rules: urgent alerts persist longer with explicit close/action
      if (item.severity === 'URGENT') {
        toast.error(item.title, {
          description: item.message,
          duration: 8500,
          closeButton: true,
          action,
        });
      } else if (item.severity === 'SUCCESS') {
        toast.success(item.title, {
          description: item.message,
          duration: 5500,
          action,
        });
      } else if (item.severity === 'WARNING') {
        toast.warning(item.title, {
          description: item.message,
          duration: 6500,
          closeButton: true,
          action,
        });
      } else {
        toast.info(item.title, {
          description: item.message,
          duration: 5000,
          action,
        });
      }
    },
    [currentUsername, openRequestById]
  );

  const handleRealtimeRequestUpdated = useCallback(() => {
    void refreshRequestsSilently();
  }, [refreshRequestsSilently]);

  const handleRealtimeComment = useCallback((comment: RequestCommentItem) => {
    setLatestComment(comment);
  }, []);

  const { connected: socketConnected } = useRealtimeSocket({
    enabled: authenticated,
    onNotification: handleIncomingNotification,
    onNotificationSync: () => void loadNotifications(),
    onRequestUpdated: handleRealtimeRequestUpdated,
    onCommentAdded: handleRealtimeComment,
  });

  const {
    supported: pushSupported,
    subscribed: pushSubscribed,
    busy: pushBusy,
    togglePush,
  } = useWebPush(authenticated);

  useEffect(() => {
    let mounted = true;

    initKeycloak()
      .then((isAuth) => {
        if (!mounted) return;
        setAuthenticated(isAuth);

        if (isAuth) {
          const roles = getRawUserRoles();
          setUserRoles(roles);
          loadUserProfile()
            .then((profile) => {
              if (mounted) setUserInfo(profile);
            })
            .catch(() => {
              // Ignore optional UserInfo fetch failure
            });
          void loadWorkspaceData();
        }
      })
      .catch(() => {
        if (mounted) {
          toast.error('Không thể kết nối máy chủ đăng nhập.');
        }
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [loadWorkspaceData]);

  // Handle Web Push deep-link `/?requestId=<uuid>` once authenticated
  useEffect(() => {
    if (!authenticated || deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('requestId');
    if (!requestId) return;

    deepLinkHandledRef.current = true;
    params.delete('requestId');
    const cleanSearch = params.toString();
    const nextUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`;
    window.history.replaceState({}, '', nextUrl);

    let active = true;
    markRequestNotificationsRead(requestId);
    requestsApi
      .detail(requestId)
      .then((res) => {
        if (active && res.success && res.data) {
          setInspectedRequest(res.data);
        }
      })
      .catch(() => {
        // Ignore invalid or inaccessible deep-linked request
      });

    return () => {
      active = false;
    };
  }, [authenticated, markRequestNotificationsRead]);

  const pendingCount = requests.filter(
    (r) =>
      r.status === 'PENDING' && (isStaff ? !r.hidden_by_receiver : !r.hidden_by_sender)
  ).length;

  const handleNavigate = (page: PageId) => {
    if ((page === 'manage' || page === 'categories') && !isStaff) {
      setActivePage('history');
      return;
    }
    setActivePage(page);
  };

  const handleOpenFilteredList = (page: PageId, filter: StatusFilter) => {
    setStatusFilter(filter);
    handleNavigate(page);
  };

  const handleCreated = async () => {
    await loadWorkspaceData();
    setStatusFilter('ALL');
    setActivePage('history');
  };

  const handleSelectNotification = (item: NotificationItem) => {
    if (item.request_id) {
      void openRequestById(item.request_id);
    } else if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      void notificationsApi.markRead(item.id).catch(() => void loadNotifications());
    }
  };

  const handleToggleNotificationRead = (item: NotificationItem) => {
    const nextRead = !item.is_read;
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, is_read: nextRead } : n))
    );
    setUnreadCount((prev) => (nextRead ? Math.max(0, prev - 1) : prev + 1));

    const apiCall = nextRead
      ? notificationsApi.markRead(item.id)
      : notificationsApi.markUnread(item.id);
    void apiCall.catch(() => void loadNotifications());
  };

  const handleHideNotification = (item: NotificationItem) => {
    setNotifications((prev) => prev.filter((n) => n.id !== item.id));
    if (!item.is_read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    void notificationsApi.hide(item.id).catch(() => void loadNotifications());
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    void notificationsApi.markAllRead().catch(() => void loadNotifications());
  };

  const handleConfirmStatus = async (reviewNote: string) => {
    if (!confirmTarget) return;
    setUpdatingStatus(true);
    try {
      const { request, nextStatus } = confirmTarget;
      const res = await requestsApi.updateStatus(request.id, nextStatus, reviewNote);
      if (res.success) {
        const updatedItem = res.data;
        setRequests((prev) =>
          prev.map((item) =>
            item.id === request.id
              ? (updatedItem ?? {
                  ...item,
                  status: nextStatus,
                  review_note: reviewNote || null,
                })
              : item
          )
        );
        requestsApi
          .analytics()
          .then((a) => {
            if (a.success && a.data) setAnalytics(a.data);
          })
          .catch(() => {});

        toast.success(
          nextStatus === 'APPROVED' ? 'Đã phê duyệt yêu cầu.' : 'Đã từ chối yêu cầu.'
        );
        markRequestNotificationsRead(request.id);
        setConfirmTarget(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteRequests = useCallback(
    async (ids: string[], mode: RequestDeleteMode) => {
      if (ids.length === 0) return;
      try {
        const res = await requestsApi.deleteMany(ids, mode);
        if (res.success) {
          const deletedSet = new Set(res.data ?? ids);
          setRequests((prev) =>
            prev
              .map((item) => {
                if (!deletedSet.has(item.id)) return item;
                return mode === 'history'
                  ? { ...item, hidden_by_sender: true }
                  : { ...item, hidden_by_receiver: true };
              })
              .filter((item) => {
                if (!deletedSet.has(item.id)) return true;
                if (item.hidden_by_sender && item.hidden_by_receiver) return false;
                if (!isStaff) return !item.hidden_by_sender;
                const keepInHistory =
                  item.created_by === currentUsername && !item.hidden_by_sender;
                const keepInManage = !item.hidden_by_receiver;
                return keepInHistory || keepInManage;
              })
          );
          setInspectedRequest((prev) => (prev && deletedSet.has(prev.id) ? null : prev));
          void requestsApi
            .analytics()
            .then((a) => {
              if (a.success && a.data) setAnalytics(a.data);
            })
            .catch(() => {});
          void loadNotifications();
          toast.success(`Đã xóa ${deletedSet.size} yêu cầu.`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Không thể xóa yêu cầu.');
      }
    },
    [currentUsername, isStaff, loadNotifications]
  );

  return (
    <>
      <Toaster theme={theme} position="top-right" richColors closeButton />

      {!authReady ? (
        <div className="bg-background flex min-h-dvh items-center justify-center">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            <span>Đang kiểm tra phiên đăng nhập...</span>
          </div>
        </div>
      ) : !authenticated ? (
        <LoginScreen onLogin={() => void login()} />
      ) : (
        <AppShell
          activePage={activePage}
          onNavigate={handleNavigate}
          userInfo={userInfo}
          userRoles={userRoles}
          isStaff={isStaff}
          pendingCount={pendingCount}
          onLogout={() => void logout()}
          headerActions={
            <NotificationCenter
              items={notifications}
              unreadCount={unreadCount}
              connected={socketConnected}
              pushSupported={pushSupported}
              pushSubscribed={pushSubscribed}
              pushBusy={pushBusy}
              onTogglePush={() => void togglePush()}
              onSelectNotification={handleSelectNotification}
              onToggleRead={handleToggleNotificationRead}
              onHideNotification={handleHideNotification}
              onMarkAllRead={handleMarkAllRead}
            />
          }
        >
          {activePage === 'dashboard' && (
            <DashboardView
              requests={requests.filter((r) =>
                isStaff ? !r.hidden_by_receiver : !r.hidden_by_sender
              )}
              categories={categories}
              departments={departments}
              analytics={analytics}
              loading={loadingRequests}
              isStaff={isStaff}
              userInfo={userInfo}
              onRefresh={() => void loadWorkspaceData()}
              onNavigate={handleNavigate}
              onOpenFilteredList={handleOpenFilteredList}
              onInspectRequest={handleInspectRequest}
            />
          )}

          {activePage === 'create' && (
            <RequestFormView
              categories={categories}
              departments={departments}
              loadingDepartments={loadingDepartments}
              onRefreshDepartments={() => loadDepartments(true)}
              isStaff={isStaff}
              onCreated={handleCreated}
            />
          )}

          {activePage === 'history' && (
            <RequestListView
              mode="history"
              requests={requests}
              categories={categories}
              departments={departments}
              loading={loadingRequests}
              isStaff={isStaff}
              currentUsername={currentUsername}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onRefresh={() => void loadWorkspaceData()}
              onInspectRequest={handleInspectRequest}
              onRequestStatusChange={(request, nextStatus) =>
                setConfirmTarget({ request, nextStatus })
              }
              onDeleteRequests={(ids) => handleDeleteRequests(ids, 'history')}
              onNavigate={handleNavigate}
            />
          )}

          {activePage === 'assistant' && (
            <AiAssistantView
              isStaff={isStaff}
              departments={departments}
              onOpenRequest={(requestId) => void openRequestById(requestId)}
              onNavigate={handleNavigate}
            />
          )}

          {activePage === 'manage' && isStaff && (
            <RequestListView
              mode="manage"
              requests={requests}
              categories={categories}
              departments={departments}
              loading={loadingRequests}
              isStaff={isStaff}
              currentUsername={currentUsername}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onRefresh={() => void loadWorkspaceData()}
              onInspectRequest={handleInspectRequest}
              onRequestStatusChange={(request, nextStatus) =>
                setConfirmTarget({ request, nextStatus })
              }
              onDeleteRequests={(ids) => handleDeleteRequests(ids, 'manage')}
              onNavigate={handleNavigate}
            />
          )}

          {activePage === 'categories' && isStaff && (
            <CategoriesView
              categories={managedCategories}
              departments={departments}
              userRoles={userRoles}
              userGroups={userGroups}
              loading={loadingCategories}
              onReload={loadCategories}
            />
          )}
        </AppShell>
      )}

      <RequestDetailDialog
        request={inspectedRequest}
        categories={categories}
        departments={departments}
        currentUsername={currentUsername}
        incomingComment={latestComment}
        canReview={isStaff}
        onClose={() => setInspectedRequest(null)}
        onRequestStatusChange={(request, nextStatus) =>
          setConfirmTarget({ request, nextStatus })
        }
      />

      <ConfirmStatusDialog
        key={
          confirmTarget
            ? `${confirmTarget.request.id}-${confirmTarget.nextStatus}`
            : 'closed'
        }
        target={confirmTarget}
        loading={updatingStatus}
        onConfirm={(note) => void handleConfirmStatus(note)}
        onClose={() => setConfirmTarget(null)}
      />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <PortalWorkspace />
    </ThemeProvider>
  );
}

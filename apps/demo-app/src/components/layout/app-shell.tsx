// SPDX-License-Identifier: Apache-2.0
import { useState, type ReactNode } from 'react';
import { ChevronRight, PanelLeft, Plus } from 'lucide-react';
import type { KeycloakProfile } from '@/auth/keycloak';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AppSidebar } from './app-sidebar';
import { NAV_ITEMS, type PageId } from './nav-config';
import { PwaStatusBanner } from './pwa-status-banner';

interface AppShellProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  userInfo: KeycloakProfile | null;
  userRoles: string[];
  isStaff: boolean;
  pendingCount: number;
  onLogout: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  activePage,
  onNavigate,
  userInfo,
  userRoles,
  isStaff,
  pendingCount,
  onLogout,
  headerActions,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentNav = NAV_ITEMS.find((item) => item.id === activePage) ?? NAV_ITEMS[0];

  return (
    <div className="bg-sidebar flex min-h-dvh w-full">
      <AppSidebar
        activePage={activePage}
        onNavigate={onNavigate}
        userInfo={userInfo}
        userRoles={userRoles}
        isStaff={isStaff}
        pendingCount={pendingCount}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={onLogout}
      />

      {/* Official Shadcn Inset Main Surface */}
      <div className="flex min-w-0 flex-1 flex-col lg:p-2 lg:pl-0">
        <div className="bg-background flex min-h-[calc(100dvh-1rem)] flex-1 flex-col lg:rounded-xl lg:border lg:shadow-xs">
          {/* Top Breadcrumb Header */}
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Mở menu điều hướng"
              >
                <PanelLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden size-8 lg:inline-flex"
                onClick={() => setCollapsed((prev) => !prev)}
                aria-label="Thu gọn hoặc mở rộng thanh bên"
              >
                <PanelLeft className="size-4" />
              </Button>

              <Separator orientation="vertical" className="mr-1 h-4" />

              <nav
                aria-label="Breadcrumb"
                className="flex min-w-0 items-center gap-1.5 text-sm"
              >
                <span className="text-muted-foreground hidden sm:inline">UniRequest</span>
                <ChevronRight className="text-muted-foreground hidden size-3.5 sm:inline" />
                <span className="truncate font-medium">{currentNav.label}</span>
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {activePage !== 'create' && (
                <Button type="button" size="sm" onClick={() => onNavigate('create')}>
                  <Plus className="size-3.5" />
                  <span className="hidden sm:inline">Tạo yêu cầu</span>
                </Button>
              )}
              {headerActions}
              <ThemeToggle />
            </div>
          </header>

          <PwaStatusBanner />

          {/* Main page canvas */}
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

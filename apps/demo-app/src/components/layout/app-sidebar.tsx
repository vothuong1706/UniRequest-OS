// SPDX-License-Identifier: Apache-2.0
import { ChevronsUpDown, Download, LogOut, Moon, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  getDisplayRoles,
  getPortalSubtitle,
  getRoleLabel,
  type KeycloakProfile,
} from '@/auth/keycloak';
import { useTheme } from '@/components/theme/theme-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, type PageId } from './nav-config';

interface AppSidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  userInfo: KeycloakProfile | null;
  userRoles: string[];
  isStaff: boolean;
  pendingCount: number;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
}

function getInitials(userInfo: KeycloakProfile | null): string {
  const source = userInfo?.name || userInfo?.preferred_username || userInfo?.email || 'U';
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function AppSidebar({
  activePage,
  onNavigate,
  userInfo,
  userRoles,
  isStaff,
  pendingCount,
  collapsed,
  mobileOpen,
  onCloseMobile,
  onLogout,
}: AppSidebarProps) {
  const { isDark, toggleTheme } = useTheme();
  const { canInstall, promptInstall } = usePwaInstall();
  const displayRoles = getDisplayRoles(userRoles);
  const portalSubtitle = getPortalSubtitle(userRoles);
  const displayName = userInfo?.name || userInfo?.preferred_username || 'Người dùng';
  const displayEmail = userInfo?.email || userInfo?.preferred_username || '';
  const personalItems = NAV_ITEMS.filter((item) => !item.staffOnly);
  const staffItems = isStaff ? NAV_ITEMS.filter((item) => item.staffOnly) : [];

  const handleSelect = (page: PageId) => {
    onNavigate(page);
    onCloseMobile();
  };

  const renderContent = (isCompact: boolean) => (
    <div className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      {/* Brand header */}
      <div
        className={cn(
          'flex h-14 items-center gap-2.5 px-3',
          isCompact ? 'justify-center' : 'justify-between'
        )}
      >
        <button
          type="button"
          onClick={() => handleSelect('dashboard')}
          className="flex min-w-0 items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-sidebar-accent cursor-pointer"
        >
          <img
            src="/logo-3d.png"
            alt="UniRequest"
            className="size-8 shrink-0 object-contain drop-shadow-xs"
          />
          {!isCompact && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold tracking-tight">UniRequest</p>
              <p className="text-muted-foreground truncate text-xs">{portalSubtitle}</p>
            </div>
          )}
        </button>

        {!isCompact && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Đóng menu"
            className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground inline-flex size-8 items-center justify-center rounded-md lg:hidden cursor-pointer"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Navigation menu */}
      <nav aria-label="Menu chính" className="flex-1 space-y-4 px-2.5 py-3">
        <div className="space-y-1">
          {!isCompact && (
            <p className="text-muted-foreground px-2 pb-1 text-[11px] font-medium">
              {isStaff ? 'Cá nhân' : 'Không gian làm việc'}
            </p>
          )}
          {personalItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                title={isCompact ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                  isCompact && 'justify-center px-0',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!isCompact && (
                  <span className="flex-1 truncate text-left">{item.label}</span>
                )}
              </button>
            );
          })}
        </div>

        {staffItems.length > 0 && (
          <div className="space-y-1">
            {!isCompact && (
              <p className="text-muted-foreground px-2 pb-1 text-[11px] font-medium">
                Điều hành & Quản trị
              </p>
            )}
            {staffItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              const showBadge = item.id === 'manage' && pendingCount > 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  title={isCompact ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                    isCompact && 'justify-center px-0',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {isCompact && showBadge && (
                    <span
                      aria-hidden="true"
                      className="bg-rose-600 absolute top-1.5 right-2 size-2 rounded-full"
                    />
                  )}
                  {!isCompact && (
                    <>
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {showBadge && (
                        <span className="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums">
                          {pendingCount}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Bottom User Profile Dropdown (Shadcn Sidebar-07 pattern) */}
      <div className="border-sidebar-border border-t p-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors cursor-pointer',
                isCompact && 'justify-center p-1.5'
              )}
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {getInitials(userInfo)}
                </AvatarFallback>
              </Avatar>
              {!isCompact && (
                <>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {displayEmail}
                    </p>
                  </div>
                  <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            side={isCompact ? 'right' : 'top'}
            className="w-60"
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="truncate text-sm font-medium">{displayName}</p>
                {displayEmail && (
                  <p className="text-muted-foreground truncate text-xs">{displayEmail}</p>
                )}
                {displayRoles.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {displayRoles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-[11px]">
                        {getRoleLabel(role)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme}>
              {isDark ? <Sun /> : <Moon />}
              <span>
                {isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
              </span>
            </DropdownMenuItem>
            {canInstall && (
              <DropdownMenuItem
                onClick={() => {
                  void promptInstall().then((accepted) => {
                    if (accepted) {
                      toast.success('Đã cài đặt ứng dụng UniRequest.');
                    }
                  });
                }}
              >
                <Download />
                <span>Cài đặt ứng dụng</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onLogout}>
              <LogOut />
              <span>Đăng xuất</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 transition-[width] duration-200 lg:block',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="sticky top-0 h-dvh">{renderContent(collapsed)}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Điều hướng"
        >
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-64 max-w-[82vw] border-r shadow-xl">
            {renderContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}

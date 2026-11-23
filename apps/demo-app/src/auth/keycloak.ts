import Keycloak from 'keycloak-js';
import { resolveServiceUrl } from '@/lib/runtime-urls';

export interface KeycloakProfile {
  sub?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
}

const keycloak = new Keycloak({
  url: resolveServiceUrl(
    import.meta.env.VITE_KEYCLOAK_URL,
    '/auth',
    'http://localhost:8000/auth'
  ),
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'unirequest',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'unirequest-portal',
});

const IGNORED_SYSTEM_ROLES = new Set([
  'uma_authorization',
  'offline_access',
  'default-roles-unirequest',
]);

const STAFF_ROLES = ['canbo', 'giangvien', 'admin'] as const;

let initPromise: Promise<boolean> | null = null;

keycloak.onTokenExpired = () => {
  keycloak.updateToken(30).catch(() => {
    keycloak.login();
  });
};

export function initKeycloak(): Promise<boolean> {
  if (!initPromise) {
    initPromise = keycloak.init({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    });
  }
  return initPromise;
}

export async function ensureFreshToken(minValidity = 30): Promise<string> {
  try {
    await keycloak.updateToken(minValidity);
    return keycloak.token ?? '';
  } catch (error) {
    keycloak.login();
    throw error;
  }
}

export function getRawUserRoles(): string[] {
  return keycloak.realmAccess?.roles ?? [];
}

export function getUserGroups(): string[] {
  const parsed = keycloak.tokenParsed as { groups?: unknown } | undefined;
  if (!Array.isArray(parsed?.groups)) return [];
  return Array.from(
    new Set(
      parsed.groups
        .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
        .map((g) => g.trim().replace(/^\/+/, ''))
    )
  );
}

export function getTokenUsername(): string {
  const parsed = keycloak.tokenParsed as { preferred_username?: string } | undefined;
  return parsed?.preferred_username ?? '';
}

export function getDisplayRoles(roles: string[] = getRawUserRoles()): string[] {
  return roles.filter((role) => !IGNORED_SYSTEM_ROLES.has(role));
}

export function isStaffOrLecturer(
  roles: string[] = getRawUserRoles(),
  groups: string[] = getUserGroups()
): boolean {
  if (STAFF_ROLES.some((role) => roles.includes(role))) {
    return true;
  }
  const isStudent = roles.some((role) => role.toLowerCase() === 'sinhvien');
  return !isStudent && groups.length > 0;
}

export function getPortalSubtitle(roles: string[] = getRawUserRoles()): string {
  if (roles.includes('admin')) return 'Quản trị hệ thống';
  if (roles.includes('canbo')) return 'Cổng điều hành cán bộ';
  if (roles.includes('giangvien')) return 'Cổng giảng viên';
  return 'Cổng dịch vụ sinh viên';
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'Quản trị viên';
    case 'canbo':
      return 'Cán bộ';
    case 'giangvien':
      return 'Giảng viên';
    case 'sinhvien':
      return 'Sinh viên';
    default:
      return role;
  }
}

export function loadUserProfile(): Promise<KeycloakProfile> {
  return keycloak.loadUserInfo() as Promise<KeycloakProfile>;
}

export function login(): Promise<void> {
  return keycloak.login();
}

export function logout(): Promise<void> {
  return keycloak.logout();
}

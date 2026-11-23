// SPDX-License-Identifier: Apache-2.0
import { config } from '../config/environment.js';
import { DepartmentGroupItem } from '../types/request.js';

interface KeycloakGroupRepresentation {
  id: string;
  name: string;
  path?: string;
  subGroupCount?: number;
  subGroups?: KeycloakGroupRepresentation[];
}

const CACHE_TTL_MS = 15_000;

export class KeycloakGroupService {
  private cachedGroups: DepartmentGroupItem[] = [];
  private lastFetchTime = 0;

  private async fetchAdminToken(): Promise<string> {
    const baseUrl = config.keycloak.adminUrl.replace(/\/+$/, '');
    const tokenUrl = `${baseUrl}/realms/master/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      client_id: 'admin-cli',
      grant_type: 'password',
      username: config.keycloak.adminUser,
      password: config.keycloak.adminPassword,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(`Keycloak admin token HTTP ${response.status}`);
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error('Không nhận được access_token từ Keycloak admin-cli');
    }
    return data.access_token;
  }

  private async fetchChildGroups(
    groupId: string,
    token: string
  ): Promise<KeycloakGroupRepresentation[]> {
    const baseUrl = config.keycloak.adminUrl.replace(/\/+$/, '');
    const realm = encodeURIComponent(config.keycloak.realm);
    const url = `${baseUrl}/admin/realms/${realm}/groups/${encodeURIComponent(groupId)}/children?briefRepresentation=false&max=500`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as unknown;
    return Array.isArray(data) ? (data as KeycloakGroupRepresentation[]) : [];
  }

  private async flattenGroupTree(
    nodes: KeycloakGroupRepresentation[],
    token: string,
    parentPath: string | null = null,
    depth = 0
  ): Promise<DepartmentGroupItem[]> {
    const result: DepartmentGroupItem[] = [];

    for (const node of nodes) {
      const normalizedPath = (
        node.path || (parentPath ? `${parentPath}/${node.name}` : node.name)
      )
        .trim()
        .replace(/^\/+/, '');
      const displayLabel = normalizedPath.split('/').join(' / ');
      const subCount = Number(node.subGroupCount || 0);

      result.push({
        id: node.id,
        name: node.name,
        path: normalizedPath,
        display_label: displayLabel,
        parent_path: parentPath,
        depth,
        sub_group_count: subCount,
      });

      let children = Array.isArray(node.subGroups) ? node.subGroups : [];
      if (children.length === 0 && subCount > 0) {
        children = await this.fetchChildGroups(node.id, token);
      }

      if (children.length > 0) {
        const nested = await this.flattenGroupTree(
          children,
          token,
          normalizedPath,
          depth + 1
        );
        result.push(...nested);
      }
    }

    return result;
  }

  /**
   * Lấy toàn bộ danh sách Group (kèm Group con) từ Keycloak Realm hiện tại.
   */
  async listGroups(forceRefresh = false): Promise<DepartmentGroupItem[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedGroups.length > 0 && now - this.lastFetchTime < CACHE_TTL_MS) {
      return this.cachedGroups;
    }

    try {
      const token = await this.fetchAdminToken();
      const baseUrl = config.keycloak.adminUrl.replace(/\/+$/, '');
      const realm = encodeURIComponent(config.keycloak.realm);
      const url = `${baseUrl}/admin/realms/${realm}/groups?briefRepresentation=false&max=500`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Keycloak groups API HTTP ${response.status}`);
      }

      const rawGroups = (await response.json()) as KeycloakGroupRepresentation[];
      const flattened = await this.flattenGroupTree(
        Array.isArray(rawGroups) ? rawGroups : [],
        token
      );

      this.cachedGroups = flattened;
      this.lastFetchTime = now;
      return flattened;
    } catch (error) {
      console.warn(
        '[KeycloakGroupService] Không thể đồng bộ danh sách Group từ Keycloak:',
        error instanceof Error ? error.message : error
      );
      return this.cachedGroups;
    }
  }

  /**
   * Chuẩn hóa và đối chiếu danh sách group trong JWT (hỗ trợ cả Full path ON và OFF).
   */
  async resolveUserGroupPaths(rawGroups: string[] = []): Promise<string[]> {
    const normalized = Array.from(
      new Set(
        rawGroups
          .map((g) => g.trim().replace(/^\/+/, ''))
          .filter((g) => g.length > 0)
      )
    );
    if (normalized.length === 0) return [];

    const allGroups = await this.listGroups();
    if (allGroups.length === 0) {
      return normalized;
    }

    const resolved: string[] = [];
    for (const item of normalized) {
      const exactPath = allGroups.find((g) => g.path === item);
      if (exactPath) {
        resolved.push(exactPath.path);
        continue;
      }

      // Khi mapper tắt "Full group path", token chỉ chứa tên group con (vd: "K11A1")
      const byLeafName = allGroups.filter((g) => g.name === item);
      if (byLeafName.length > 0) {
        for (const matched of byLeafName) {
          resolved.push(matched.path);
        }
      } else {
        resolved.push(item);
      }
    }

    return Array.from(new Set(resolved));
  }

  /**
   * Tìm đường dẫn chuẩn (path) của một group được chọn khi tạo yêu cầu.
   * Trả về null nếu Keycloak có dữ liệu nhưng không khớp group nào.
   */
  async resolveTargetDepartmentPath(
    input: string
  ): Promise<{ valid: boolean; canonicalPath: string; checkedAgainstKeycloak: boolean }> {
    const clean = input.trim().replace(/^\/+/, '');
    if (!clean) {
      return { valid: false, canonicalPath: '', checkedAgainstKeycloak: false };
    }

    let groups = await this.listGroups(false);
    let matched = groups.find(
      (g) => g.path.toLowerCase() === clean.toLowerCase()
    );

    if (!matched) {
      groups = await this.listGroups(true);
      matched = groups.find(
        (g) => g.path.toLowerCase() === clean.toLowerCase()
      );
    }

    if (matched) {
      return {
        valid: true,
        canonicalPath: matched.path,
        checkedAgainstKeycloak: true,
      };
    }

    // Nếu Keycloak có danh sách group mà giá trị gửi lên không tồn tại -> từ chối
    if (groups.length > 0) {
      return {
        valid: false,
        canonicalPath: clean,
        checkedAgainstKeycloak: true,
      };
    }

    // Fallback an toàn nếu không gọi được Keycloak Admin API
    return {
      valid: true,
      canonicalPath: clean,
      checkedAgainstKeycloak: false,
    };
  }
}

export const keycloakGroupService = new KeycloakGroupService();

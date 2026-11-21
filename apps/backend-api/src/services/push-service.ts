import webPush from 'web-push';
import { query } from '../config/database.js';
import { config } from '../config/environment.js';
import { canReviewRequest } from './request-service.js';

let vapidConfigured = false;

const ensureVapidConfigured = (): boolean => {
  if (vapidConfigured) return true;
  if (!config.vapid.publicKey || !config.vapid.privateKey) {
    return false;
  }
  try {
    webPush.setVapidDetails(
      config.vapid.subject,
      config.vapid.publicKey,
      config.vapid.privateKey
    );
    vapidConfigured = true;
    return true;
  } catch (error) {
    console.error('[WebPush] Cấu hình VAPID thất bại:', error);
    return false;
  }
};

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface StoredPushSubscription {
  id: string;
  username: string;
  roles: string[];
  groups: string[];
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  requestId?: string;
  url?: string;
  tag?: string;
}

export class PushService {
  getPublicKey(): string {
    ensureVapidConfigured();
    return config.vapid.publicKey;
  }

  async saveSubscription(
    username: string,
    roles: string[],
    groups: string[],
    subscription: PushSubscriptionInput,
    userAgent?: string
  ): Promise<void> {
    const sql = `
      INSERT INTO push_subscriptions (username, roles, groups, endpoint, p256dh, auth, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (endpoint) DO UPDATE
      SET username = EXCLUDED.username,
          roles = EXCLUDED.roles,
          groups = EXCLUDED.groups,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          updated_at = CURRENT_TIMESTAMP;
    `;
    await query(sql, [
      username,
      roles,
      groups,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      userAgent || null,
    ]);
  }

  async removeSubscription(username: string, endpoint: string): Promise<void> {
    await query(
      `DELETE FROM push_subscriptions WHERE username = $1 AND endpoint = $2;`,
      [username, endpoint]
    );
  }

  private async dispatchToRows(
    rows: StoredPushSubscription[],
    payload: WebPushPayload
  ): Promise<void> {
    if (!rows.length || !ensureVapidConfigured()) return;

    const jsonPayload = JSON.stringify(payload);
    await Promise.all(
      rows.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            jsonPayload,
            { TTL: 60 * 60 * 12 }
          );
        } catch (err: unknown) {
          const statusCode =
            typeof err === 'object' && err !== null && 'statusCode' in err
              ? Number((err as { statusCode?: number }).statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            await query(`DELETE FROM push_subscriptions WHERE id = $1;`, [sub.id]).catch(
              () => {}
            );
          }
        }
      })
    );
  }

  async sendToUser(username: string, payload: WebPushPayload): Promise<void> {
    try {
      const result = await query(
        `SELECT id, username, endpoint, p256dh, auth
         FROM push_subscriptions
         WHERE username = $1;`,
        [username]
      );
      await this.dispatchToRows(result.rows as StoredPushSubscription[], payload);
    } catch (error) {
      console.warn('[WebPush] Không thể gửi thông báo đẩy tới user:', error);
    }
  }

  async sendToStaff(
    payload: WebPushPayload,
    targetDepartment?: string | null,
    excludeUsername?: string
  ): Promise<void> {
    try {
      const result = await query(
        `SELECT id, username, roles, groups, endpoint, p256dh, auth
         FROM push_subscriptions
         WHERE (roles && ARRAY['canbo', 'giangvien', 'admin']::text[] OR cardinality(groups) > 0)
           AND ($1::text IS NULL OR username <> $1);`,
        [excludeUsername || null]
      );
      const rows = (result.rows as StoredPushSubscription[]).filter((sub) =>
        canReviewRequest(
          {
            preferred_username: sub.username,
            roles: sub.roles || [],
            groups: sub.groups || [],
          },
          { target_department: targetDepartment ?? null }
        )
      );
      await this.dispatchToRows(rows, payload);
    } catch (error) {
      console.warn('[WebPush] Không thể gửi thông báo đẩy tới cán bộ:', error);
    }
  }
}

export const pushService = new PushService();

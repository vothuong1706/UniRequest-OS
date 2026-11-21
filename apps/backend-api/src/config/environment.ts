import dotenv from 'dotenv';
import path from 'path';

// Nạp file cấu hình môi trường
dotenv.config();

const realmUrl =
  process.env.KEYCLOAK_REALM_URL || 'http://localhost:8080/realms/unirequest';

function deriveKeycloakBaseAndRealm(url: string): {
  adminUrl: string;
  realm: string;
} {
  const match = url.match(/^(https?:\/\/.+?)\/realms\/([^/]+)\/?$/i);
  if (match) {
    return { adminUrl: match[1], realm: match[2] };
  }
  return { adminUrl: 'http://localhost:8080', realm: 'unirequest' };
}

const derivedKeycloak = deriveKeycloakBaseAndRealm(realmUrl);

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  timezone: process.env.TZ || 'Asia/Ho_Chi_Minh',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'keycloak',
    password: process.env.DB_PASSWORD || 'keycloak_dev_2026',
    name: process.env.DB_NAME || 'keycloak',
  },

  keycloak: {
    realmUrl,
    adminUrl: process.env.KEYCLOAK_ADMIN_URL || derivedKeycloak.adminUrl,
    realm: process.env.KEYCLOAK_REALM || derivedKeycloak.realm,
    adminUser: process.env.KC_ADMIN_USER || 'admin',
    adminPassword: process.env.KC_ADMIN_PASSWORD || 'admin_dev_2026',
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin_dev_2026',
    bucketName: process.env.MINIO_BUCKET_NAME || 'unirequest-files',
    publicUrl: process.env.MINIO_PUBLIC_URL || 'http://localhost:9000',
  },

  kestra: {
    enabled: process.env.KESTRA_ENABLED !== 'false',
    url: process.env.KESTRA_URL || 'http://kestra:8080',
    namespace: process.env.KESTRA_NAMESPACE || 'unirequest.dxos',
    flowId: process.env.KESTRA_FLOW_ID || 'unirequest-lifecycle',
    webhookKey: process.env.KESTRA_WEBHOOK_KEY || 'unirequest-dxos-webhook-2026',
    username: process.env.KESTRA_BASIC_AUTH_USER || 'admin@unirequest.edu.vn',
    password: process.env.KESTRA_BASIC_AUTH_PASSWORD || 'KestraAdmin2026!',
  },

  vapid: {
    publicKey:
      process.env.VAPID_PUBLIC_KEY ||
      'BGkWBKqEemsbPjB6VQpjJv9djzuxxk2evYSoNNcFzT3QkuQNrpd4IG9udE3KrkQsBzqgVNu8adhPukf1YocOXng',
    privateKey:
      process.env.VAPID_PRIVATE_KEY ||
      'AVKU-Hy3zlWRpOxdXGK6pcTIUBiTzrA2XtGMyA2Hmz4',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@unirequest.edu.vn',
  },
};

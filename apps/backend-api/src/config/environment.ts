// SPDX-License-Identifier: Apache-2.0
import dotenv from 'dotenv';

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

const parseOriginList = (raw?: string): string[] =>
  (raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  timezone: process.env.TZ || 'Asia/Ho_Chi_Minh',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'keycloak',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'keycloak',
  },

  keycloak: {
    realmUrl,
    adminUrl: process.env.KEYCLOAK_ADMIN_URL || derivedKeycloak.adminUrl,
    realm: process.env.KEYCLOAK_REALM || derivedKeycloak.realm,
    adminUser: process.env.KC_ADMIN_USER || 'admin',
    adminPassword: process.env.KC_ADMIN_PASSWORD || '',
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || '',
    bucketName: process.env.MINIO_BUCKET_NAME || 'unirequest-files',
    publicUrl: process.env.MINIO_PUBLIC_URL || '/api/upload/files',
  },

  kestra: {
    enabled: process.env.KESTRA_ENABLED !== 'false',
    url: process.env.KESTRA_URL || 'http://kestra:8080',
    namespace: process.env.KESTRA_NAMESPACE || 'unirequest.dxos',
    flowId: process.env.KESTRA_FLOW_ID || 'unirequest-lifecycle',
    webhookKey: process.env.KESTRA_WEBHOOK_KEY || '',
    username: process.env.KESTRA_BASIC_AUTH_USER || 'admin@unirequest.edu.vn',
    password: process.env.KESTRA_BASIC_AUTH_PASSWORD || '',
  },

  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@unirequest.edu.vn',
  },

  ai: {
    enabled: process.env.AI_ENABLED !== 'false',
    ollamaUrl: process.env.OLLAMA_URL || 'http://host.docker.internal:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '3500', 10),
  },

  security: {
    corsAllowedOrigins: parseOriginList(process.env.CORS_ALLOWED_ORIGINS),
    attachmentSigningSecret: process.env.ATTACHMENT_SIGNING_SECRET || '',
    attachmentSignedUrlTtlSeconds: parseInt(
      process.env.ATTACHMENT_SIGNED_URL_TTL_SECONDS || '3600',
      10
    ),
  },

  seed: {
    enabled: process.env.SEED_DEMO_DATA !== 'false',
    dataFile: process.env.SEED_DATA_FILE || '',
  },
};

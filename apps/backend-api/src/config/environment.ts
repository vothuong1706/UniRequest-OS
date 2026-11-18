import dotenv from 'dotenv';
import path from 'path';

// Nạp file cấu hình môi trường
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'keycloak',
    password: process.env.DB_PASSWORD || 'keycloak_dev_2026',
    name: process.env.DB_NAME || 'keycloak',
  },

  keycloak: {
    realmUrl: process.env.KEYCLOAK_REALM_URL || 'http://localhost:8080/realms/unirequest',
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

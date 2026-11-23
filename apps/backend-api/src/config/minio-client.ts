// SPDX-License-Identifier: Apache-2.0
import * as Minio from 'minio';
import { config } from './environment.js';

export const minioClient = new Minio.Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

export const initMinioBucket = async (): Promise<void> => {
  const bucketName = config.minio.bucketName;
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
      console.log(`[MinIO] Đã tạo bucket Private thành công: ${bucketName}`);
    } else {
      console.log(`[MinIO] Bucket ${bucketName} đã sẵn sàng (chế độ Private).`);
    }

    // Đảm bảo bucket luôn ở chế độ Private (gỡ mọi policy Public Read cũ nếu từng tồn tại)
    await minioClient.setBucketPolicy(bucketName, '');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[MinIO] Cảnh báo khởi tạo bucket ${bucketName}:`, message);
  }
};

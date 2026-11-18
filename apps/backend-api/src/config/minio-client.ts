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
      console.log(`[MinIO] Đã tạo bucket thành công: ${bucketName}`);

      // Cấu hình policy công khai (Public Read) để ảnh/tài liệu có thể truy cập qua URL
      const publicPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      };
      await minioClient.setBucketPolicy(bucketName, JSON.stringify(publicPolicy));
      console.log(`[MinIO] Đã kích hoạt policy Public Read cho bucket: ${bucketName}`);
    } else {
      console.log(`[MinIO] Bucket ${bucketName} đã sẵn sàng.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[MinIO] Cảnh báo khởi tạo bucket ${bucketName}:`, message);
  }
};

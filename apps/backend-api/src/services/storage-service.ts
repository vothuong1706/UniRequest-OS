// SPDX-License-Identifier: Apache-2.0
import crypto from 'crypto';
import path from 'path';
import { minioClient } from '../config/minio-client.js';
import { config } from '../config/environment.js';

export class StorageService {
  /**
   * Tải file lên bucket của MinIO và trả về URL công khai
   */
  async uploadFile(file: Express.Multer.File): Promise<{
    url: string;
    objectName: string;
    originalName: string;
    size: number;
    mimeType: string;
  }> {
    const bucketName = config.minio.bucketName;
    const fileExt = path.extname(file.originalname);
    const sanitizedBase = path
      .basename(file.originalname, fileExt)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const randomHash = crypto.randomBytes(6).toString('hex');
    const objectName = `${Date.now()}_${randomHash}_${sanitizedBase}${fileExt}`;

    const metadata = {
      'Content-Type': file.mimetype,
      'x-amz-meta-original-name': encodeURIComponent(file.originalname),
    };

    await minioClient.putObject(
      bucketName,
      objectName,
      file.buffer,
      file.size,
      metadata
    );

    const baseUrl = config.minio.publicUrl.replace(/\/+$/, '');
    const publicUrl =
      baseUrl === 'proxy' || baseUrl.startsWith('/')
        ? `/api/upload/files/${objectName}`
        : `${baseUrl}/${bucketName}/${objectName}`;

    return {
      url: publicUrl,
      objectName,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Đọc luồng tệp từ MinIO để phục vụ qua API Proxy (/api/upload/files/:objectName)
   * giúp hoạt động xuyên suốt qua HTTPS / Tunnel / Same-Origin Proxy.
   */
  async getObjectStream(objectName: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    size: number;
  }> {
    const safeName = path.basename(objectName).trim();
    if (!safeName || safeName !== objectName || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
      const invalidError = new Error('Tên tệp không hợp lệ.') as Error & {
        statusCode?: number;
      };
      invalidError.statusCode = 400;
      throw invalidError;
    }

    const bucketName = config.minio.bucketName;
    const stat = await minioClient.statObject(bucketName, safeName);
    const stream = await minioClient.getObject(bucketName, safeName);
    const contentType =
      (stat.metaData?.['content-type'] as string | undefined) ||
      'application/octet-stream';

    return {
      stream,
      contentType,
      size: stat.size,
    };
  }
}

export const storageService = new StorageService();

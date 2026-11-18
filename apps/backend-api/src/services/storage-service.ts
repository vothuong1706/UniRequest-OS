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

    const publicUrl = `${config.minio.publicUrl}/${bucketName}/${objectName}`;

    return {
      url: publicUrl,
      objectName,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }
}

export const storageService = new StorageService();

import { Router } from 'express';
import { categoryRouter } from './category-routes.js';
import { departmentRouter } from './department-routes.js';
import { internalKestraRouter } from './internal-kestra-routes.js';
import { notificationRouter } from './notification-routes.js';
import { pushRouter } from './push-routes.js';
import { requestRouter } from './request-routes.js';
import { uploadRouter } from './upload-routes.js';
import { pool } from '../config/database.js';
import { minioClient } from '../config/minio-client.js';
import { config } from '../config/environment.js';
import { workflowService } from '../services/workflow-service.js';

export const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', async (_req, res) => {
  let dbStatus = 'DISCONNECTED';
  let minioStatus = 'DISCONNECTED';

  try {
    const client = await pool.connect();
    client.release();
    dbStatus = 'CONNECTED';
  } catch {
    dbStatus = 'ERROR';
  }

  try {
    const bucketExists = await minioClient.bucketExists(config.minio.bucketName);
    minioStatus = bucketExists ? 'CONNECTED' : 'BUCKET_NOT_FOUND';
  } catch {
    minioStatus = 'ERROR';
  }

  const workflowStatus = await workflowService.checkHealth();

  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      minio: minioStatus,
      workflow: workflowStatus,
    },
  });
});

// Gắn các router nhánh
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/departments', departmentRouter);
apiRouter.use('/internal/kestra', internalKestraRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/push', pushRouter);
apiRouter.use('/requests', requestRouter);
apiRouter.use('/upload', uploadRouter);

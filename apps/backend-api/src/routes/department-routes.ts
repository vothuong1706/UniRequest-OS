// SPDX-License-Identifier: Apache-2.0
import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth-middleware.js';
import { keycloakGroupService } from '../services/keycloak-group-service.js';

export const departmentRouter = Router();

departmentRouter.use(authenticateToken);

// GET /api/departments - Đồng bộ động danh sách Groups (kể cả Group con) từ Keycloak
departmentRouter.get('/', async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const groups = await keycloakGroupService.listGroups(forceRefresh);
    res.status(200).json({
      success: true,
      count: groups.length,
      data: groups,
    });
  } catch (error) {
    next(error);
  }
});

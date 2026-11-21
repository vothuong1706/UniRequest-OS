import { Request, Response, NextFunction } from 'express';
import { categoryService } from '../services/category-service.js';
import { keycloakGroupService } from '../services/keycloak-group-service.js';
import {
  canReviewRequest,
  resolveRequestAccessScope,
} from '../services/request-service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CategoryController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      const includeInactive =
        req.query.all === 'true' || req.query.include_inactive === 'true';
      const departmentFilter =
        typeof req.query.department === 'string' ? req.query.department : undefined;

      let scope = undefined;
      if (includeInactive && user) {
        const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
          user.groups
        );
        scope = resolveRequestAccessScope({ ...user, groups: resolvedGroups });
      }

      const categories = await categoryService.list({
        includeInactive,
        scope,
        department: departmentFilter,
      });

      res.status(200).json({
        success: true,
        count: categories.length,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const { code, name, department, sla_hours, requires_evidence, sort_order } =
        req.body as {
          code?: string;
          name?: string;
          department?: string;
          sla_hours?: number;
          requires_evidence?: boolean;
          sort_order?: number;
        };

      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        res.status(400).json({
          success: false,
          message: 'Tên loại yêu cầu bắt buộc có ít nhất 2 ký tự.',
        });
        return;
      }

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      const userWithGroups = { ...user, groups: resolvedGroups };
      const scope = resolveRequestAccessScope(userWithGroups);

      let targetDepartment =
        typeof department === 'string' ? department.trim().replace(/^\/+/, '') : '';
      if (!targetDepartment && scope.type === 'DEPARTMENT' && scope.departments.length > 0) {
        targetDepartment = scope.departments[0];
      }

      if (!targetDepartment || targetDepartment.length < 2) {
        res.status(400).json({
          success: false,
          message: 'Vui lòng chọn ban / nhóm phụ trách cho danh mục.',
        });
        return;
      }

      const resolvedTarget =
        await keycloakGroupService.resolveTargetDepartmentPath(targetDepartment);
      if (!resolvedTarget.valid) {
        res.status(400).json({
          success: false,
          message: 'Ban / nhóm phụ trách không tồn tại trong Keycloak.',
        });
        return;
      }

      if (
        !canReviewRequest(userWithGroups, {
          target_department: resolvedTarget.canonicalPath,
        })
      ) {
        res.status(403).json({
          success: false,
          message: 'Bạn chỉ có quyền tạo danh mục cho ban / nhóm mình phụ trách.',
        });
        return;
      }

      const created = await categoryService.create({
        code,
        name,
        department: resolvedTarget.canonicalPath,
        sla_hours: sla_hours !== undefined ? Number(sla_hours) : undefined,
        requires_evidence,
        sort_order: sort_order !== undefined ? Number(sort_order) : undefined,
      });

      res.status(201).json({
        success: true,
        message: 'Đã thêm danh mục yêu cầu mới.',
        data: created,
      });
    } catch (error) {
      const pgCode = (error as { code?: string })?.code;
      if (pgCode === '23505') {
        res.status(409).json({
          success: false,
          message: 'Mã danh mục đã tồn tại. Vui lòng chọn tên khác.',
        });
        return;
      }
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({
          success: false,
          message: 'Mã danh mục không hợp lệ.',
        });
        return;
      }

      const existing = await categoryService.getById(id);
      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy danh mục yêu cầu.',
        });
        return;
      }

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      const userWithGroups = { ...user, groups: resolvedGroups };

      if (
        !canReviewRequest(userWithGroups, { target_department: existing.department })
      ) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền chỉnh sửa danh mục của ban khác.',
        });
        return;
      }

      const payload = { ...(req.body as Record<string, unknown>) };
      if (typeof payload.department === 'string' && payload.department.trim()) {
        const resolvedDept = await keycloakGroupService.resolveTargetDepartmentPath(
          payload.department
        );
        if (!resolvedDept.valid) {
          res.status(400).json({
            success: false,
            message: 'Ban / nhóm phụ trách không tồn tại trong Keycloak.',
          });
          return;
        }
        if (
          !canReviewRequest(userWithGroups, {
            target_department: resolvedDept.canonicalPath,
          })
        ) {
          res.status(403).json({
            success: false,
            message: 'Bạn không có quyền chuyển danh mục sang ban khác.',
          });
          return;
        }
        payload.department = resolvedDept.canonicalPath;
      }

      const updated = await categoryService.update(id, payload);
      res.status(200).json({
        success: true,
        message: 'Đã cập nhật danh mục.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({
          success: false,
          message: 'Mã danh mục không hợp lệ.',
        });
        return;
      }

      const existing = await categoryService.getById(id);
      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy danh mục yêu cầu.',
        });
        return;
      }

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      if (
        !canReviewRequest(
          { ...user, groups: resolvedGroups },
          { target_department: existing.department }
        )
      ) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền thay đổi trạng thái danh mục của ban khác.',
        });
        return;
      }

      const updated = await categoryService.toggleActive(id);
      res.status(200).json({
        success: true,
        message: updated?.is_active
          ? 'Đã bật hiển thị danh mục.'
          : 'Đã tạm ẩn danh mục.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteMany(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const rawIds = req.params.id
        ? [req.params.id]
        : (req.body as { ids?: unknown })?.ids;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Vui lòng chọn ít nhất một danh mục để xóa.',
        });
        return;
      }

      const ids = Array.from(
        new Set(
          rawIds.filter(
            (item): item is string =>
              typeof item === 'string' && UUID_REGEX.test(item.trim())
          )
        )
      );
      if (ids.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Danh sách mã danh mục không hợp lệ.',
        });
        return;
      }

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      const { deletedIds, forbidden } = await categoryService.deleteMany(ids, {
        ...user,
        groups: resolvedGroups,
      });

      if (forbidden) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xóa danh mục của ban khác.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        deleted_count: deletedIds.length,
        data: deletedIds,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const categoryController = new CategoryController();

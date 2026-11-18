import { Request, Response, NextFunction } from 'express';
import { categoryService } from '../services/category-service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CategoryController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeInactive =
        req.query.all === 'true' || req.query.include_inactive === 'true';
      const categories = await categoryService.list(includeInactive);
      res.status(200).json({
        success: true,
        count: categories.length,
        data: categories,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Yêu cầu khác')) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
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

      if (
        !department ||
        typeof department !== 'string' ||
        department.trim().length < 2
      ) {
        res.status(400).json({
          success: false,
          message: 'Đơn vị phụ trách là trường bắt buộc.',
        });
        return;
      }

      const created = await categoryService.create({
        code,
        name,
        department,
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
          message: 'Mã danh mục đã tồn tại. Vui lòng chọn tên hoặc mã khác.',
        });
        return;
      }
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({
          success: false,
          message: 'Mã danh mục không hợp lệ.',
        });
        return;
      }

      const updated = await categoryService.update(id, req.body);
      if (!updated) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy danh mục yêu cầu.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Đã cập nhật danh mục.',
        data: updated,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Yêu cầu khác')) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }

  async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({
          success: false,
          message: 'Mã danh mục không hợp lệ.',
        });
        return;
      }

      const updated = await categoryService.toggleActive(id);
      if (!updated) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy danh mục yêu cầu.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: updated.is_active
          ? 'Đã bật hiển thị danh mục.'
          : 'Đã tạm ẩn danh mục.',
        data: updated,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Yêu cầu khác')) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }
}

export const categoryController = new CategoryController();

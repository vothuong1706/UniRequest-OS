// SPDX-License-Identifier: Apache-2.0
import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middlewares/auth-middleware.js';
import { aiAssistantService } from '../services/ai-assistant-service.js';
import { categoryService } from '../services/category-service.js';
import { keycloakGroupService } from '../services/keycloak-group-service.js';
import { resolveRequestAccessScope } from '../services/request-service.js';
import { AiAssistantHistoryTurn } from '../types/request.js';
import { loadAiConfig } from '../utils/ai-config-loader.js';

export const aiRouter = Router();

aiRouter.use(authenticateToken);

aiRouter.get('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
      return;
    }

    const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(user.groups);
    const scopedUser = { ...user, groups: resolvedGroups };
    const scope = resolveRequestAccessScope(scopedUser);
    const aiCfg = loadAiConfig();
    const scopedCount = await aiAssistantService.getScopedRequestCount(scopedUser);

    res.status(200).json({
      success: true,
      data: {
        scope: scope.type,
        departments: scope.type === 'DEPARTMENT' ? scope.departments : [],
        scoped_count: scopedCount,
        quick_prompts:
          scope.type === 'PERSONAL'
            ? aiCfg.quick_prompts.student
            : aiCfg.quick_prompts.staff,
      },
    });
  } catch (error) {
    next(error);
  }
});

aiRouter.post('/assistant', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
      return;
    }

    const body = (req.body || {}) as {
      question?: unknown;
      history?: unknown;
    };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (question.length < 2 || question.length > 500) {
      res.status(400).json({
        success: false,
        code: 'INVALID_QUESTION',
        message: 'Vui lòng nhập câu hỏi từ 2 đến 500 ký tự để Trợ lý AI tra cứu.',
      });
      return;
    }

    const history: AiAssistantHistoryTurn[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (item): item is AiAssistantHistoryTurn =>
              Boolean(item) &&
              typeof item === 'object' &&
              ((item as { role?: unknown }).role === 'user' ||
                (item as { role?: unknown }).role === 'assistant') &&
              typeof (item as { content?: unknown }).content === 'string' &&
              ((item as { content: string }).content.trim().length > 0)
          )
          .slice(-6)
          .map((item) => ({
            role: item.role,
            content: item.content.trim().slice(0, 600),
          }))
      : [];

    const [resolvedGroups, departments, categories] = await Promise.all([
      keycloakGroupService.resolveUserGroupPaths(user.groups),
      keycloakGroupService.listGroups(),
      categoryService.list({ includeInactive: false }),
    ]);

    const result = await aiAssistantService.askAssistant({
      question,
      history,
      user: { ...user, groups: resolvedGroups },
      departments,
      categories,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

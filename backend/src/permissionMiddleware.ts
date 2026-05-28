import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import type { PermissionAction } from './roleGuards.js';
import type { PermissionManager } from './permissionManager.js';

export const requireRoomAction =
  (permissions: PermissionManager, action: PermissionAction) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const userId = (request as unknown as AuthenticatedRequest).user.id;
    const reason = await permissions.requireAction(String(request.params.roomId), userId, action);

    if (reason) {
      response.status(403).json({ error: reason });
      return;
    }

    next();
  };

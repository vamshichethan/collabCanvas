import type { NextFunction, Request, Response } from 'express';
import type { PermissionAction } from './roleGuards.js';
import type { PermissionManager } from './permissionManager.js';

export const requireRoomAction =
  (permissions: PermissionManager, action: PermissionAction) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const userId = String(request.body?.userId ?? request.body?.actorId ?? request.query.userId ?? request.query.actorId ?? '');
    const reason = await permissions.requireAction(String(request.params.roomId), userId, action);

    if (reason) {
      response.status(403).json({ error: reason });
      return;
    }

    next();
  };

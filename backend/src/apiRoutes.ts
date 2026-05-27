import { Router } from 'express';
import { OperationManager } from './operationManager.js';
import { requireRoomAction } from './permissionMiddleware.js';
import { normalizeRole, PermissionManager } from './permissionManager.js';
import { PersistenceManager } from './persistenceManager.js';

export const createApiRoutes = (
  persistence: PersistenceManager,
  operations: OperationManager,
  permissions: PermissionManager,
) => {
  const router = Router();

  router.get('/rooms', async (request, response, next) => {
    try {
      const userId = String(request.query.userId ?? 'demo-user');
      response.json(await persistence.getDashboardRooms(userId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms', async (request, response, next) => {
    try {
      const { userId = 'demo-user', name = 'Demo User' } = request.body ?? {};
      const room = await persistence.createRoom(userId, name);
      response.status(201).json(room);
    } catch (error) {
      next(error);
    }
  });

  router.get('/rooms/:roomId', async (request, response, next) => {
    try {
      const room = await persistence.getRoom(request.params.roomId);
      if (!room) {
        response.status(404).json({ error: 'Room not found' });
        return;
      }
      response.json(room);
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/join', async (request, response, next) => {
    try {
      const { userId = 'demo-user', name = 'Demo User' } = request.body ?? {};
      await persistence.joinRoom(request.params.roomId, userId, name, 'VIEWER');
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/rooms/:roomId/settings', requireRoomAction(permissions, 'UPDATE_ROOM_SETTINGS'), async (request, response, next) => {
    try {
      response.json(await persistence.updateRoomSettings(String(request.params.roomId), request.body.settings ?? {}));
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/regenerate-invite', async (request, response, next) => {
    try {
      const userId = String(request.body?.userId ?? '');
      const reason = await permissions.requireAction(request.params.roomId, userId, 'INVITE');
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      response.json(await persistence.regenerateInviteCode(request.params.roomId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/participants', async (request, response, next) => {
    try {
      const actorId = String(request.body?.actorId ?? '');
      const reason = await permissions.requireAction(request.params.roomId, actorId, 'INVITE');
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      const { userId, name = 'Invited User', role = 'VIEWER' } = request.body ?? {};
      response.status(201).json(await persistence.inviteParticipant(request.params.roomId, userId, name, normalizeRole(role)));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/rooms/:roomId/participants/:userId', async (request, response, next) => {
    try {
      const actorId = String(request.body?.actorId ?? '');
      const reason = await permissions.canManageParticipant(request.params.roomId, actorId);
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      response.json(
        await persistence.updateParticipantRole(request.params.roomId, request.params.userId, normalizeRole(request.body?.role)),
      );
    } catch (error) {
      next(error);
    }
  });

  router.delete('/rooms/:roomId/participants/:userId', async (request, response, next) => {
    try {
      const actorId = String(request.query.actorId ?? '');
      const reason = await permissions.canManageParticipant(request.params.roomId, actorId);
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      response.json(await persistence.removeParticipant(request.params.roomId, request.params.userId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/transfer-owner', async (request, response, next) => {
    try {
      const actorId = String(request.body?.actorId ?? '');
      const reason = await permissions.assertOwner(request.params.roomId, actorId);
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      response.json(await persistence.transferOwnership(request.params.roomId, actorId, request.body.nextOwnerId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/boards/:boardId', async (request, response, next) => {
    try {
      response.json(await operations.getBoardState(request.params.boardId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/boards/:boardId/versions', async (request, response, next) => {
    try {
      response.json(await persistence.listVersions(request.params.boardId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards/:boardId/versions', async (request, response, next) => {
    try {
      const roomId = await persistence.getBoardRoomId(request.params.boardId);
      const createdBy = String(request.body?.createdBy ?? 'demo-user');
      const reason = roomId ? await permissions.canCreateVersion(roomId, createdBy) : 'board not found';
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      const { name = 'Untitled version' } = request.body ?? {};
      response.status(201).json(await persistence.createVersion(request.params.boardId, name, createdBy));
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards/:boardId/restore/:versionId', async (request, response, next) => {
    try {
      const roomId = await persistence.getBoardRoomId(request.params.boardId);
      const userId = String(request.body?.userId ?? 'demo-user');
      const reason = roomId ? await permissions.canRestoreVersion(roomId, userId) : 'board not found';
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      const restored = await persistence.restoreVersion(request.params.boardId, request.params.versionId, userId);
      operations.invalidateBoard(request.params.boardId);
      response.json(restored);
    } catch (error) {
      next(error);
    }
  });

  router.get('/boards/:boardId/snapshots', async (request, response, next) => {
    try {
      response.json(await persistence.listSnapshots(request.params.boardId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards/:boardId/comments', async (request, response, next) => {
    try {
      const roomId = await persistence.getBoardRoomId(request.params.boardId);
      const userId = String(request.body?.userId ?? '');
      const reason = roomId ? await permissions.canComment(roomId, userId) : 'board not found';
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      response.status(201).json(
        await persistence.createComment(request.params.boardId, userId, request.body.message, request.body.objectId),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/chat', async (request, response, next) => {
    try {
      const userId = String(request.body?.userId ?? '');
      const participant = await permissions.getParticipant(request.params.roomId, userId);
      if (!participant) {
        response.status(403).json({ error: 'user is not a room participant' });
        return;
      }
      response.status(201).json(await persistence.createChatMessage(request.params.roomId, userId, request.body.message));
    } catch (error) {
      next(error);
    }
  });

  return router;
};

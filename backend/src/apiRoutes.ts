import { Router } from 'express';
import type { ActivityService } from './activityService.js';
import { isSummaryType, type AISummaryService } from './aiSummaryService.js';
import type { ChatService } from './chatService.js';
import type { CommentService } from './commentService.js';
import { isExportType, type ExportService } from './exportService.js';
import { OperationManager } from './operationManager.js';
import { requireRoomAction } from './permissionMiddleware.js';
import { normalizeRole, PermissionManager } from './permissionManager.js';
import { PersistenceManager } from './persistenceManager.js';

export const createApiRoutes = (
  persistence: PersistenceManager,
  operations: OperationManager,
  permissions: PermissionManager,
  services: {
    chat: ChatService;
    comments: CommentService;
    activity: ActivityService;
    aiSummaries: AISummaryService;
    exports: ExportService;
  },
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
      const version = await persistence.createVersion(request.params.boardId, name, createdBy);
      if (roomId) await services.activity.create(roomId, 'VERSION_CREATE', `${createdBy} created version "${name}"`, createdBy);
      response.status(201).json(version);
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
      if (roomId) await services.activity.create(roomId, 'VERSION_RESTORE', `${userId} restored a board version`, userId);
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

  router.get('/boards/:boardId/ai-summaries', async (request, response, next) => {
    try {
      response.json(await services.aiSummaries.list(request.params.boardId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards/:boardId/ai-summary', async (request, response, next) => {
    try {
      const roomId = await persistence.getBoardRoomId(request.params.boardId);
      const userId = String(request.body?.userId ?? request.body?.generatedBy ?? '');
      const summaryType = request.body?.summaryType;
      if (!isSummaryType(summaryType)) {
        response.status(400).json({ error: 'summaryType is invalid' });
        return;
      }

      const reason = roomId ? await permissions.canGenerateAISummary(roomId, userId) : 'board not found';
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }

      response.status(201).json(await services.aiSummaries.generate(request.params.boardId, userId, summaryType));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate AI summary';
      if (message.includes('GEMINI_API_KEY')) {
        response.status(503).json({ error: message });
        return;
      }
      if (message.includes('rate limit')) {
        response.status(429).json({ error: message });
        return;
      }
      if (message.includes('invalid JSON') || message.includes('empty summary')) {
        response.status(502).json({ error: message });
        return;
      }
      next(error);
    }
  });

  router.get('/boards/:boardId/export/json', async (request, response, next) => {
    try {
      const roomId = await persistence.getBoardRoomId(request.params.boardId);
      const userId = String(request.query.userId ?? '');
      const reason = roomId ? await permissions.canExportBoard(roomId, userId) : 'board not found';
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }

      response.json(
        await services.exports.getJsonExport(request.params.boardId, {
          includeComments: request.query.includeComments === 'true',
          includeAISummaries: request.query.includeAISummaries === 'true',
          includeDeleted: request.query.includeDeleted === 'true',
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/boards/:boardId/replay', async (request, response, next) => {
    try {
      const roomId = await persistence.getBoardRoomId(request.params.boardId);
      const userId = String(request.query.userId ?? '');
      const reason = roomId ? await permissions.canReplayBoard(roomId, userId) : 'board not found';
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }

      const replay = await persistence.getReplayOperations(request.params.boardId);
      const userName = await persistence.getUserName(userId);
      await services.activity.create(replay.roomId, 'BOARD_REPLAY', `${userName} replayed the board session`, userId);
      response.json(replay);
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards/:boardId/export/record', async (request, response, next) => {
    try {
      const roomId = await persistence.getBoardRoomId(request.params.boardId);
      const userId = String(request.body?.userId ?? request.body?.exportedBy ?? '');
      const exportType = request.body?.exportType;
      if (!isExportType(exportType)) {
        response.status(400).json({ error: 'exportType is invalid' });
        return;
      }

      const reason = roomId ? await permissions.canExportBoard(roomId, userId) : 'board not found';
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }

      const record = await services.exports.recordExport(request.params.boardId, userId, exportType);
      await services.activity.create(record.roomId, 'BOARD_EXPORT', `${record.exportedByName} exported board as ${exportType}`, userId);
      response.status(201).json(record);
    } catch (error) {
      next(error);
    }
  });

  router.get('/rooms/:roomId/chat', async (request, response, next) => {
    try {
      response.json(await services.chat.list(request.params.roomId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/boards/:boardId/comments', async (request, response, next) => {
    try {
      response.json(await services.comments.list(request.params.boardId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/rooms/:roomId/activity', async (request, response, next) => {
    try {
      response.json(await services.activity.list(request.params.roomId));
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
      const comment = await services.comments.add(request.params.boardId, request.body.objectId, userId, request.body.message);
      if (roomId) await services.activity.create(roomId, 'COMMENT_ADD', `${comment.userName} commented on an object`, userId);
      response.status(201).json(comment);
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/chat', async (request, response, next) => {
    try {
      const userId = String(request.body?.userId ?? '');
      const reason = await permissions.canChat(request.params.roomId, userId);
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      response.status(201).json(await services.chat.create(request.params.roomId, userId, request.body.message));
    } catch (error) {
      next(error);
    }
  });

  return router;
};

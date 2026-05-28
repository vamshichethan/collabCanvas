import { Router } from 'express';
import type { ActivityService } from './activityService.js';
import { requireAuth, type AuthenticatedRequest } from './auth.js';
import { isSummaryType, type AISummaryService } from './aiSummaryService.js';
import type { ChatService } from './chatService.js';
import type { CommentService } from './commentService.js';
import { isExportType, type ExportService } from './exportService.js';
import { OperationManager } from './operationManager.js';
import { requireRoomAction } from './permissionMiddleware.js';
import { normalizeRole, PermissionManager } from './permissionManager.js';
import { PersistenceManager } from './persistenceManager.js';
import type { RateLimiter } from './rateLimiter.js';

const getAuthUser = (request: unknown) => (request as AuthenticatedRequest).user;

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
    rateLimiter: RateLimiter;
  },
) => {
  const router = Router();
  router.use(requireAuth);

  const getBoardAccess = async (boardId: string, userId: string) => {
    const board = await persistence.getBoardWithRoom(boardId);
    const participant = board?.room.participants.find((item) => item.userId === userId);
    return { board, participant };
  };
  const canJoinByInvite = (room: Awaited<ReturnType<PersistenceManager['getRoom']>>) =>
    Boolean(room?.inviteEnabled && room.visibility === 'PUBLIC' && (!room.inviteExpiresAt || room.inviteExpiresAt.getTime() > Date.now()));

  router.get('/rooms', async (request, response, next) => {
    try {
      const userId = getAuthUser(request).id;
      response.json(await persistence.getDashboardRooms(userId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms', async (request, response, next) => {
    try {
      const user = getAuthUser(request);
      const room = await persistence.createRoom(user.id, user.name);
      response.status(201).json(room);
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard/boards', async (request, response, next) => {
    try {
      const userId = getAuthUser(request).id;
      response.json(
        await persistence.getDashboardBoards(userId, {
          search: String(request.query.search ?? ''),
          role: request.query.role === 'OWNER' || request.query.role === 'EDITOR' || request.query.role === 'VIEWER' ? request.query.role : 'ALL',
          sort: request.query.sort === 'created' || request.query.sort === 'title' ? request.query.sort : 'updated',
          includeArchived: request.query.includeArchived === 'true',
          limit: Number(request.query.limit ?? 40),
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards', async (request, response, next) => {
    try {
      const user = getAuthUser(request);
      const created = await persistence.createBoard(user.id, user.name, {
        title: request.body?.title,
        description: request.body?.description,
        visibility: request.body?.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
      });
      await services.activity.create(created.room.id, 'BOARD_CREATE', `${user.name} created board "${created.board.title}"`, user.id);
      response.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/boards/:boardId', async (request, response, next) => {
    try {
      const user = getAuthUser(request);
      const { board, participant } = await getBoardAccess(request.params.boardId, user.id);
      if (!board) {
        response.status(404).json({ error: 'Board not found' });
        return;
      }
      const thumbnailOnly =
        typeof request.body?.thumbnailUrl === 'string' && request.body?.title === undefined && request.body?.pinned === undefined;
      if (thumbnailOnly ? !participant || participant.role === 'VIEWER' : participant?.role !== 'OWNER') {
        response.status(403).json({ error: 'owner permission required' });
        return;
      }

      const updated = await persistence.updateBoard(request.params.boardId, {
        title: request.body?.title,
        pinned: typeof request.body?.pinned === 'boolean' ? request.body.pinned : undefined,
        thumbnailUrl: typeof request.body?.thumbnailUrl === 'string' ? request.body.thumbnailUrl : undefined,
      });
      if (request.body?.title) {
        await services.activity.create(board.roomId, 'BOARD_RENAME', `${user.name} renamed board to "${updated.title}"`, user.id);
      }
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards/:boardId/duplicate', async (request, response, next) => {
    try {
      const user = getAuthUser(request);
      const { board, participant } = await getBoardAccess(request.params.boardId, user.id);
      if (!board) {
        response.status(404).json({ error: 'Board not found' });
        return;
      }
      if (!participant || participant.role === 'VIEWER') {
        response.status(403).json({ error: 'editor permission required' });
        return;
      }
      const duplicated = await persistence.duplicateBoard(request.params.boardId, user.id, user.name);
      await services.activity.create(duplicated.room.id, 'BOARD_DUPLICATE', `${user.name} duplicated "${board.title}"`, user.id);
      response.status(201).json(duplicated);
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards/:boardId/archive', async (request, response, next) => {
    try {
      const user = getAuthUser(request);
      const { board, participant } = await getBoardAccess(request.params.boardId, user.id);
      if (!board) {
        response.status(404).json({ error: 'Board not found' });
        return;
      }
      if (participant?.role !== 'OWNER') {
        response.status(403).json({ error: 'owner permission required' });
        return;
      }
      const archived = await persistence.setBoardStatus(request.params.boardId, 'ARCHIVED');
      await services.activity.create(board.roomId, 'BOARD_ARCHIVE', `${user.name} archived "${board.title}"`, user.id);
      response.json(archived);
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards/:boardId/restore', async (request, response, next) => {
    try {
      const user = getAuthUser(request);
      const { board, participant } = await getBoardAccess(request.params.boardId, user.id);
      if (!board) {
        response.status(404).json({ error: 'Board not found' });
        return;
      }
      if (participant?.role !== 'OWNER') {
        response.status(403).json({ error: 'owner permission required' });
        return;
      }
      const restored = await persistence.setBoardStatus(request.params.boardId, 'ACTIVE');
      await services.activity.create(board.roomId, 'BOARD_RESTORE', `${user.name} restored "${board.title}"`, user.id);
      response.json(restored);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/boards/:boardId', async (request, response, next) => {
    try {
      const user = getAuthUser(request);
      const { board, participant } = await getBoardAccess(request.params.boardId, user.id);
      if (!board) {
        response.status(404).json({ error: 'Board not found' });
        return;
      }
      if (participant?.role !== 'OWNER') {
        response.status(403).json({ error: 'owner permission required' });
        return;
      }
      const deleted = await persistence.setBoardStatus(request.params.boardId, 'DELETED');
      await services.activity.create(board.roomId, 'BOARD_DELETE', `${user.name} deleted "${board.title}"`, user.id);
      response.json(deleted);
    } catch (error) {
      next(error);
    }
  });

  router.get('/rooms/:roomId', async (request, response, next) => {
    try {
      const userId = getAuthUser(request).id;
      const room = await persistence.getRoom(request.params.roomId);
      if (!room) {
        response.status(404).json({ error: 'Room not found' });
        return;
      }
      const existing = room.participants.some((participant) => participant.userId === userId);
      if (room.status === 'DELETED' || (!existing && room.visibility !== 'PUBLIC')) {
        response.status(403).json({ error: 'Room is private or invite is required' });
        return;
      }
      response.json(room);
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/join', async (request, response, next) => {
    try {
      const user = getAuthUser(request);
      const room = await persistence.getRoom(request.params.roomId);
      const existing = room?.participants.some((participant) => participant.userId === user.id);
      if (!room || room.status !== 'ACTIVE' || (!existing && !canJoinByInvite(room))) {
        response.status(403).json({ error: 'Room is private or invite is required' });
        return;
      }
      await persistence.joinRoom(request.params.roomId, user.id, user.name, room.inviteRole);
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
      const userId = getAuthUser(request).id;
      const reason = await permissions.requireAction(request.params.roomId, userId, 'INVITE');
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      const room = await persistence.regenerateInviteCode(request.params.roomId);
      await services.activity.create(request.params.roomId, 'INVITE_REGENERATE', `${getAuthUser(request).name} regenerated the invite link`, userId);
      response.json(room);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/rooms/:roomId/invite-settings', async (request, response, next) => {
    try {
      const user = getAuthUser(request);
      const reason = await permissions.requireAction(request.params.roomId, user.id, 'INVITE');
      if (reason) {
        response.status(403).json({ error: reason });
        return;
      }
      const room = await persistence.updateInviteSettings(request.params.roomId, {
        inviteEnabled: typeof request.body?.inviteEnabled === 'boolean' ? request.body.inviteEnabled : undefined,
        inviteRole: request.body?.inviteRole ? normalizeRole(request.body.inviteRole) : undefined,
        inviteExpiresAt: request.body?.inviteExpiresAt ?? undefined,
        visibility: request.body?.visibility === 'PUBLIC' ? 'PUBLIC' : request.body?.visibility === 'PRIVATE' ? 'PRIVATE' : undefined,
      });
      await services.activity.create(request.params.roomId, 'INVITE_REGENERATE', `${user.name} updated invite settings`, user.id);
      response.json(room);
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/participants', async (request, response, next) => {
    try {
      const actorId = getAuthUser(request).id;
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
      const actorId = getAuthUser(request).id;
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
      const actorId = getAuthUser(request).id;
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
      const actorId = getAuthUser(request).id;
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
      const createdBy = getAuthUser(request).id;
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
      const userId = getAuthUser(request).id;
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
      const userId = getAuthUser(request).id;
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
      const rate = await services.rateLimiter.check('ai', userId);
      if (!rate.allowed) {
        response.status(429).json({ error: 'AI summary rate limit exceeded' });
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
      const userId = getAuthUser(request).id;
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
      const userId = getAuthUser(request).id;
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
      const userId = getAuthUser(request).id;
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
      const rate = await services.rateLimiter.check('export', userId);
      if (!rate.allowed) {
        response.status(429).json({ error: 'Export rate limit exceeded' });
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
      const userId = getAuthUser(request).id;
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
      const userId = getAuthUser(request).id;
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

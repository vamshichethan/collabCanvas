import { Router } from 'express';
import { OperationManager } from './operationManager.js';
import { PersistenceManager } from './persistenceManager.js';

export const createApiRoutes = (persistence: PersistenceManager, operations: OperationManager) => {
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
      const { userId = 'demo-user', name = 'Demo User', role = 'EDITOR' } = request.body ?? {};
      await persistence.joinRoom(request.params.roomId, userId, name, role);
      response.json({ ok: true });
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
      const { name = 'Untitled version', createdBy = 'demo-user' } = request.body ?? {};
      response.status(201).json(await persistence.createVersion(request.params.boardId, name, createdBy));
    } catch (error) {
      next(error);
    }
  });

  router.post('/boards/:boardId/restore/:versionId', async (request, response, next) => {
    try {
      const { userId = 'demo-user' } = request.body ?? {};
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

  return router;
};

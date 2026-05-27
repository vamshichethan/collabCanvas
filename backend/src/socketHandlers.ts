import type { Server, Socket } from 'socket.io';
import { ActivityService } from './activityService.js';
import { OperationManager } from './operationManager.js';
import { PersistenceManager } from './persistenceManager.js';
import { PermissionManager } from './permissionManager.js';
import { toDbRole, toSocketRole } from './roleGuards.js';
import { RoomManager } from './roomManager.js';
import type { ClientOperation, CursorPosition, Participant } from './types.js';

type Managers = {
  rooms: RoomManager;
  operations: OperationManager;
  permissions: PermissionManager;
  persistence: PersistenceManager;
  activity: ActivityService;
};

export const registerSocketHandlers = (io: Server, socket: Socket, managers: Managers) => {
  const { rooms, operations, permissions, persistence, activity } = managers;

  socket.on('room:create', async (payload: { userId: string; name: string; role?: Participant['role'] }, ack?: (response: { roomId: string }) => void) => {
    try {
      const persisted = await persistence.createRoom(payload.userId, payload.name);
      const room = rooms.createRoom(persisted.room.id);
      const participant = toParticipant({ ...payload, role: 'owner' }, socket.id);
      rooms.joinRoom(room.roomId, participant);
      socket.join(room.roomId);
      socket.data.roomId = room.roomId;
      socket.data.userId = participant.userId;

      ack?.({ roomId: room.roomId });
      emitParticipants(io, rooms, room.roomId);
      const boardState = await operations.getBoardState(persisted.board.id);
      socket.emit('board:full-sync', {
        board: boardState.board,
        lastSequenceNumber: boardState.lastSequenceNumber,
      });
    } catch (error) {
      socket.emit('room:error', { message: 'Unable to create room' });
      console.error(error);
    }
  });

  socket.on('room:join', async (payload: { roomId: string; userId: string; name: string; role?: Participant['role'] }, ack?: (response: { ok: boolean }) => void) => {
    try {
      const roomId = payload.roomId.trim();
      const persistedParticipant = await persistence.joinRoom(roomId, payload.userId, payload.name, 'VIEWER');
      const participant = toParticipant({ ...payload, role: toSocketRole(persistedParticipant.role) }, socket.id);
      rooms.joinRoom(roomId, participant);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.userId = participant.userId;

      ack?.({ ok: true });
      socket.to(roomId).emit('user:joined', participant);
      emitParticipants(io, rooms, roomId);
      const joinedActivity = await activity.create(roomId, 'JOIN', `${participant.name} joined the room`, participant.userId);
      io.to(roomId).emit('activity:new', joinedActivity);
      const boardState = await operations.getBoardState(roomId);
      socket.emit('board:full-sync', {
        board: boardState.board,
        lastSequenceNumber: boardState.lastSequenceNumber,
      });
    } catch (error) {
      socket.emit('room:error', { message: 'Unable to join room' });
      console.error(error);
    }
  });

  socket.on('room:leave', (payload: { roomId: string; userId: string }) => {
    socket.leave(payload.roomId);
    leaveRoom(io, rooms, payload.roomId, payload.userId);
    void activity.create(payload.roomId, 'LEAVE', `${payload.userId} left the room`, payload.userId).then((item) => {
      io.to(payload.roomId).emit('activity:new', item);
    });
  });

  socket.on('operation:submit', async (operation: ClientOperation) => {
    try {
      const reason = await permissions.validateOperation(operation);

      if (reason) {
        const boardState = await operations.getBoardState(operation.boardId || operation.roomId);
        socket.emit('operation:ack', {
          accepted: false,
          opId: operation.opId,
          reason,
          boardState: boardState.board,
        });
        socket.emit('board:full-sync', {
          board: boardState.board,
          lastSequenceNumber: boardState.lastSequenceNumber,
        });
        return;
      }

      const appliedOperation = await operations.submit(operation);
      if (appliedOperation.type === 'CREATE' || appliedOperation.type === 'DELETE') {
        const activityType = appliedOperation.type === 'CREATE' ? 'OBJECT_CREATE' : 'OBJECT_DELETE';
        const message = `${operation.userId} ${appliedOperation.type === 'CREATE' ? 'created' : 'deleted'} an object`;
        const item = await activity.create(operation.roomId, activityType, message, operation.userId);
        io.to(operation.roomId).emit('activity:new', item);
      }
      socket.emit('operation:ack', {
        accepted: true,
        opId: operation.opId,
        operation: appliedOperation,
      });
      socket.to(operation.roomId).emit('operation:applied', appliedOperation);
    } catch (error) {
      socket.emit('operation:ack', {
        accepted: false,
        opId: operation.opId,
        reason: 'Unable to persist operation',
      });
      console.error(error);
    }
  });

  socket.on(
    'operation:submit-batch',
    async (payload: { roomId: string; operations: Array<{ localId: string; operation: ClientOperation }> }) => {
      const acks: Array<{
        accepted: boolean;
        localId: string;
        opId: string;
        operation?: Awaited<ReturnType<OperationManager['submit']>>;
        reason?: string;
        boardState?: unknown;
      }> = [];

      socket.emit('sync:status', { status: 'Syncing' });

      for (const item of payload.operations) {
        try {
          const reason = await permissions.validateOperation(item.operation);
          if (reason) {
            acks.push({
              accepted: false,
              localId: item.localId,
              opId: item.operation.opId,
              reason,
            });
            continue;
          }

          const appliedOperation = await operations.submit(item.operation);
          if (appliedOperation.type === 'CREATE' || appliedOperation.type === 'DELETE') {
            const activityType = appliedOperation.type === 'CREATE' ? 'OBJECT_CREATE' : 'OBJECT_DELETE';
            const message = `${item.operation.userId} ${appliedOperation.type === 'CREATE' ? 'created' : 'deleted'} an object`;
            const itemActivity = await activity.create(item.operation.roomId, activityType, message, item.operation.userId);
            io.to(item.operation.roomId).emit('activity:new', itemActivity);
          }
          acks.push({
            accepted: true,
            localId: item.localId,
            opId: item.operation.opId,
            operation: appliedOperation,
          });
          socket.to(item.operation.roomId).emit('operation:applied', appliedOperation);
        } catch (error) {
          acks.push({
            accepted: false,
            localId: item.localId,
            opId: item.operation.opId,
            reason: 'Unable to persist operation',
          });
          console.error(error);
        }
      }

      const boardState = await operations.getBoardState(payload.roomId);
      socket.emit('operation:batch-ack', {
        acks,
        boardState: boardState.board,
        lastSequenceNumber: boardState.lastSequenceNumber,
      });
      socket.emit('sync:pending-ops', { count: acks.filter((ack) => !ack.accepted).length });
      socket.emit('sync:status', { status: acks.some((ack) => !ack.accepted) ? 'Reconnecting' : 'Synced' });
    },
  );

  socket.on('operation:missed-request', async (payload: { roomId: string; boardId?: string; afterSequenceNumber: number }) => {
    const boardId = payload.boardId ?? payload.roomId;
    socket.emit('operation:missed-response', {
      operations: await operations.getOperationsAfter(boardId, payload.afterSequenceNumber),
      lastSequenceNumber: await operations.getLastSequenceNumber(boardId),
    });
  });

  socket.on('cursor:move', (cursor: CursorPosition) => {
    socket.to(cursor.roomId).emit('cursor:move', cursor);
  });

  socket.on('operation:conflict', (payload: { roomId: string; objectIds: string[] }) => {
    socket.emit('operation:conflict', {
      objectIds: payload.objectIds,
      message: 'Remote changes won for one or more offline edits.',
    });
  });

  socket.on('participant:invite', async (payload: { roomId: string; actorId: string; userId: string; name: string; role: string }) => {
    const reason = await permissions.requireAction(payload.roomId, payload.actorId, 'INVITE');
    if (reason) {
      socket.emit('permission:error', { message: reason });
      return;
    }
    const participant = await persistence.inviteParticipant(payload.roomId, payload.userId, payload.name, toDbRole(payload.role));
    io.to(payload.roomId).emit('participant:role-update', participant);
  });

  socket.on('participant:remove', async (payload: { roomId: string; actorId: string; userId: string }) => {
    const reason = await permissions.canManageParticipant(payload.roomId, payload.actorId);
    if (reason) {
      socket.emit('permission:error', { message: reason });
      return;
    }
    await persistence.removeParticipant(payload.roomId, payload.userId);
    io.to(payload.roomId).emit('participant:remove', { userId: payload.userId });
  });

  socket.on('participant:role-update', async (payload: { roomId: string; actorId: string; userId: string; role: string }) => {
    const reason = await permissions.canManageParticipant(payload.roomId, payload.actorId);
    if (reason) {
      socket.emit('permission:error', { message: reason });
      return;
    }
    const participant = await persistence.updateParticipantRole(payload.roomId, payload.userId, toDbRole(payload.role));
    io.to(payload.roomId).emit('participant:role-update', participant);
  });

  socket.on('room:settings-update', async (payload: { roomId: string; actorId: string; settings: Parameters<PersistenceManager['updateRoomSettings']>[1] }) => {
    const reason = await permissions.canUpdateSettings(payload.roomId, payload.actorId);
    if (reason) {
      socket.emit('permission:error', { message: reason });
      return;
    }
    const room = await persistence.updateRoomSettings(payload.roomId, payload.settings);
    io.to(payload.roomId).emit('room:settings-update', room);
  });

  socket.on('disconnect', () => {
    rooms.removeSocket(socket.id).forEach(({ roomId, participant, participants }) => {
      socket.to(roomId).emit('user:left', participant);
      io.to(roomId).emit('room:participants', participants);
      void activity.create(roomId, 'LEAVE', `${participant.name} left the room`, participant.userId).then((item) => {
        io.to(roomId).emit('activity:new', item);
      });
    });
  });
};

const toParticipant = (payload: { userId: string; name: string; role?: Participant['role'] }, socketId: string): Participant => ({
  userId: payload.userId,
  name: payload.name || 'Guest',
  socketId,
  joinedAt: Date.now(),
  role: payload.role ?? 'editor',
});

const emitParticipants = (io: Server, rooms: RoomManager, roomId: string) => {
  io.to(roomId).emit('room:participants', rooms.getParticipants(roomId));
};

const leaveRoom = (io: Server, rooms: RoomManager, roomId: string, userId: string) => {
  const participants = rooms.leaveRoom(roomId, userId);
  io.to(roomId).emit('user:left', { userId });
  io.to(roomId).emit('room:participants', participants);
};

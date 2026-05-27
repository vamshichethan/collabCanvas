import type { Server, Socket } from 'socket.io';
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
};

export const registerSocketHandlers = (io: Server, socket: Socket, managers: Managers) => {
  const { rooms, operations, permissions, persistence } = managers;

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

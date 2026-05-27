import type { Server, Socket } from 'socket.io';
import { OperationManager } from './operationManager.js';
import { PermissionManager } from './permissionManager.js';
import { RoomManager } from './roomManager.js';
import type { ClientOperation, CursorPosition, Participant } from './types.js';

type Managers = {
  rooms: RoomManager;
  operations: OperationManager;
  permissions: PermissionManager;
};

export const registerSocketHandlers = (io: Server, socket: Socket, managers: Managers) => {
  const { rooms, operations, permissions } = managers;

  socket.on('room:create', (payload: { userId: string; name: string; role?: Participant['role'] }, ack?: (response: { roomId: string }) => void) => {
    const room = rooms.createRoom();
    const participant = toParticipant(payload, socket.id);
    rooms.joinRoom(room.roomId, participant);
    socket.join(room.roomId);
    socket.data.roomId = room.roomId;
    socket.data.userId = participant.userId;

    ack?.({ roomId: room.roomId });
    emitParticipants(io, rooms, room.roomId);
    socket.emit('board:full-sync', {
      board: operations.getBoard(room.roomId),
      lastSequenceNumber: operations.getLastSequenceNumber(room.roomId),
    });
  });

  socket.on('room:join', (payload: { roomId: string; userId: string; name: string; role?: Participant['role'] }, ack?: (response: { ok: boolean }) => void) => {
    const roomId = payload.roomId.trim();
    const participant = toParticipant(payload, socket.id);
    rooms.joinRoom(roomId, participant);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userId = participant.userId;

    ack?.({ ok: true });
    socket.to(roomId).emit('user:joined', participant);
    emitParticipants(io, rooms, roomId);
    socket.emit('board:full-sync', {
      board: operations.getBoard(roomId),
      lastSequenceNumber: operations.getLastSequenceNumber(roomId),
    });
  });

  socket.on('room:leave', (payload: { roomId: string; userId: string }) => {
    socket.leave(payload.roomId);
    leaveRoom(io, rooms, payload.roomId, payload.userId);
  });

  socket.on('operation:submit', (operation: ClientOperation) => {
    const reason = permissions.validateOperation(operation);

    if (reason) {
      socket.emit('operation:ack', {
        accepted: false,
        opId: operation.opId,
        reason,
        boardState: operations.getBoard(operation.roomId),
      });
      socket.emit('board:full-sync', {
        board: operations.getBoard(operation.roomId),
        lastSequenceNumber: operations.getLastSequenceNumber(operation.roomId),
      });
      return;
    }

    const appliedOperation = operations.submit(operation);
    socket.emit('operation:ack', {
      accepted: true,
      opId: operation.opId,
      operation: appliedOperation,
    });
    socket.to(operation.roomId).emit('operation:applied', appliedOperation);
  });

  socket.on('operation:missed-request', (payload: { roomId: string; afterSequenceNumber: number }) => {
    socket.emit('operation:missed-response', {
      operations: operations.getOperationsAfter(payload.roomId, payload.afterSequenceNumber),
      lastSequenceNumber: operations.getLastSequenceNumber(payload.roomId),
    });
  });

  socket.on('cursor:move', (cursor: CursorPosition) => {
    socket.to(cursor.roomId).emit('cursor:move', cursor);
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

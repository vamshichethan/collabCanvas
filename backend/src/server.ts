import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { RoomManager } from './roomManager.js';
import type { BoardOperation, CursorPosition, Participant } from './types.js';

const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const app = express();
const httpServer = createServer(app);
const rooms = new RoomManager();

app.use(cors({ origin: clientOrigin }));
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  socket.on('room:create', (payload: { userId: string; name: string }, ack?: (response: { roomId: string }) => void) => {
    const room = rooms.createRoom();
    const participant = toParticipant(payload, socket.id);
    rooms.joinRoom(room.roomId, participant);
    socket.join(room.roomId);
    socket.data.roomId = room.roomId;
    socket.data.userId = participant.userId;

    ack?.({ roomId: room.roomId });
    emitParticipants(room.roomId);
    socket.emit('board:sync', rooms.getBoard(room.roomId));
  });

  socket.on('room:join', (payload: { roomId: string; userId: string; name: string }, ack?: (response: { ok: boolean }) => void) => {
    const roomId = payload.roomId.trim();
    const participant = toParticipant(payload, socket.id);
    rooms.joinRoom(roomId, participant);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userId = participant.userId;

    ack?.({ ok: true });
    socket.to(roomId).emit('user:joined', participant);
    emitParticipants(roomId);
    socket.emit('board:sync', rooms.getBoard(roomId));
  });

  socket.on('room:leave', (payload: { roomId: string; userId: string }) => {
    socket.leave(payload.roomId);
    leaveRoom(payload.roomId, payload.userId);
  });

  socket.on('board:operation', (operation: BoardOperation) => {
    rooms.applyOperation(operation);
    socket.to(operation.roomId).emit('board:operation', operation);
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
});

const toParticipant = (payload: { userId: string; name: string }, socketId: string): Participant => ({
  userId: payload.userId,
  name: payload.name || 'Guest',
  socketId,
  joinedAt: Date.now(),
});

const emitParticipants = (roomId: string) => {
  io.to(roomId).emit('room:participants', rooms.getParticipants(roomId));
};

const leaveRoom = (roomId: string, userId: string) => {
  const participants = rooms.leaveRoom(roomId, userId);
  io.to(roomId).emit('user:left', { userId });
  io.to(roomId).emit('room:participants', participants);
};

httpServer.listen(port, () => {
  console.log(`CollabCanvas backend listening on http://localhost:${port}`);
});

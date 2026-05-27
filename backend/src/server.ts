import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { OperationManager } from './operationManager.js';
import { PermissionManager } from './permissionManager.js';
import { RoomManager } from './roomManager.js';
import { registerSocketHandlers } from './socketHandlers.js';

const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const app = express();
const httpServer = createServer(app);
const rooms = new RoomManager();
const operations = new OperationManager();
const permissions = new PermissionManager(rooms);

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
  registerSocketHandlers(io, socket, { rooms, operations, permissions });
});

httpServer.listen(port, () => {
  console.log(`CollabCanvas backend listening on http://localhost:${port}`);
});

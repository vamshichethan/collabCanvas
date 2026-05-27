import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApiRoutes } from './apiRoutes.js';
import { OperationManager } from './operationManager.js';
import { PersistenceManager } from './persistenceManager.js';
import { PermissionManager } from './permissionManager.js';
import { prisma } from './prisma.js';
import { RoomManager } from './roomManager.js';
import { registerSocketHandlers } from './socketHandlers.js';

const port = Number(process.env.PORT ?? 5000);
const clientOrigin = process.env.FRONTEND_URL ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const app = express();
const httpServer = createServer(app);
const rooms = new RoomManager();
const persistence = new PersistenceManager(prisma);
const operations = new OperationManager(persistence);
const permissions = new PermissionManager(prisma);

app.use(cors({ origin: clientOrigin }));
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.use('/api', createApiRoutes(persistence, operations));

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
});

const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  registerSocketHandlers(io, socket, { rooms, operations, permissions, persistence });
});

httpServer.listen(port, () => {
  console.log(`CollabCanvas backend listening on http://localhost:${port}`);
});

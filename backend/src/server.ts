import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ActivityService } from './activityService.js';
import { authCookieName, getUserFromToken, parseCookies } from './auth.js';
import { createAuthRoutes } from './authRoutes.js';
import { AISummaryService } from './aiSummaryService.js';
import { createApiRoutes } from './apiRoutes.js';
import { ChatService } from './chatService.js';
import { CommentService } from './commentService.js';
import { ExportService } from './exportService.js';
import { OperationManager } from './operationManager.js';
import { PersistenceManager } from './persistenceManager.js';
import { PermissionManager } from './permissionManager.js';
import { PresenceService } from './presenceService.js';
import { prisma } from './prisma.js';
import { RateLimiter } from './rateLimiter.js';
import { createRedisClients, instanceId, pingRedis } from './redisClient.js';
import { RoomManager } from './roomManager.js';
import { attachSocketAdapter } from './socketAdapter.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { registerSocketChatHandlers } from './socketChatHandlers.js';
import { registerSocketCommentHandlers } from './socketCommentHandlers.js';

const port = Number(process.env.PORT ?? 5000);
const clientOrigin = process.env.FRONTEND_URL ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const app = express();
const httpServer = createServer(app);
const redis = await createRedisClients();
const rooms = new RoomManager();
const persistence = new PersistenceManager(prisma);
const operations = new OperationManager(persistence);
const permissions = new PermissionManager(prisma);
const presence = new PresenceService(redis?.publisher ?? null);
const rateLimiter = new RateLimiter(redis?.publisher ?? null);
const activity = new ActivityService(prisma);
const chat = new ChatService(prisma);
const comments = new CommentService(prisma);
const aiSummaries = new AISummaryService(prisma);
const exports = new ExportService(prisma);

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.json());

const getHealth = async () => {
  let postgres = 'connected';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    postgres = 'disconnected';
  }
  return {
    status: 'ok',
    postgres,
    redis: await pingRedis(redis?.publisher ?? null),
    socketAdapter,
    instanceId,
  };
};

app.get('/health', async (_request, response) => {
  response.json(await getHealth());
});

app.get('/api/health', async (_request, response) => {
  response.json(await getHealth());
});

app.use('/api/auth', createAuthRoutes());
app.use('/api', createApiRoutes(persistence, operations, permissions, { chat, comments, activity, aiSummaries, exports, rateLimiter }));

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
});

const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
const socketAdapter = attachSocketAdapter(io, redis);

io.use(async (socket, next) => {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const user = await getUserFromToken(cookies[authCookieName]);
  if (!user) {
    next(new Error('Authentication required'));
    return;
  }
  socket.data.user = user;
  socket.data.userId = user.id;
  next();
});

io.on('connection', (socket) => {
  registerSocketHandlers(io, socket, { rooms, operations, permissions, persistence, activity, presence, rateLimiter });
  registerSocketChatHandlers(io, socket, { chat, activity, permissions, rateLimiter });
  registerSocketCommentHandlers(io, socket, { comments, activity, permissions });
});

httpServer.listen(port, () => {
  console.log(`CollabCanvas backend listening on http://localhost:${port}`);
});

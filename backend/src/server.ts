import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
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
import { errorMiddleware } from './errors.js';
import { logger } from './logger.js';
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
const corsOrigins = (process.env.CORS_ORIGINS ?? clientOrigin)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
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

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin denied'));
    },
    credentials: true,
  }),
);
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? '1mb' }));
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests', errors: [] },
  }),
);

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

app.use(errorMiddleware);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
const socketAdapter = attachSocketAdapter(io, redis);

io.use(async (socket, next) => {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const user = await getUserFromToken(cookies[authCookieName]);
  if (!user) {
    logger.warn({ socketId: socket.id }, 'Socket authentication failed');
    next(new Error('Authentication required'));
    return;
  }
  socket.data.user = user;
  socket.data.userId = user.id;
  next();
});

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id, userId: socket.data.userId }, 'Socket connected');
  socket.on('disconnect', (reason) => logger.info({ socketId: socket.id, userId: socket.data.userId, reason }, 'Socket disconnected'));
  registerSocketHandlers(io, socket, { rooms, operations, permissions, persistence, activity, presence, rateLimiter });
  registerSocketChatHandlers(io, socket, { chat, activity, permissions, rateLimiter });
  registerSocketCommentHandlers(io, socket, { comments, activity, permissions });
});

httpServer.listen(port, () => {
  logger.info(`CollabCanvas backend listening on http://localhost:${port}`);
});

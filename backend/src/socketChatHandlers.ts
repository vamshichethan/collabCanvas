import type { Server, Socket } from 'socket.io';
import type { ActivityService } from './activityService.js';
import type { ChatService } from './chatService.js';
import { logger } from './logger.js';
import type { PermissionManager } from './permissionManager.js';
import type { RateLimiter } from './rateLimiter.js';
import { schemas } from './validation.js';

export const registerSocketChatHandlers = (
  io: Server,
  socket: Socket,
  services: { chat: ChatService; activity: ActivityService; permissions: PermissionManager; rateLimiter: RateLimiter },
) => {
  socket.on('chat:history', async (payload: { roomId: string }) => {
    socket.emit('chat:history', await services.chat.list(payload.roomId));
  });

  socket.on('chat:send', async (payload: { roomId: string; userId: string; message: string }) => {
    const body = schemas.chatMessage.parse({ message: payload.message });
    const userId = socket.data.userId as string;
    const reason = await services.permissions.canChat(payload.roomId, userId);
    if (reason) {
      logger.warn({ roomId: payload.roomId, userId, reason }, 'Chat permission denied');
      socket.emit('permission:error', { message: reason });
      return;
    }
    const rate = await services.rateLimiter.check('chat', userId);
    if (!rate.allowed) {
      socket.emit('rate-limit:error', { message: 'Chat rate limit exceeded' });
      return;
    }

    try {
      const message = await services.chat.create(payload.roomId, userId, body.message);
      io.to(payload.roomId).emit('chat:new', message);
    } catch (error) {
      socket.emit('permission:error', { message: 'Unable to send chat message' });
      logger.error({ error }, 'Chat send failed');
    }
  });
};

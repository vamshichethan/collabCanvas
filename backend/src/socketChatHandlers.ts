import type { Server, Socket } from 'socket.io';
import type { ActivityService } from './activityService.js';
import type { ChatService } from './chatService.js';
import type { PermissionManager } from './permissionManager.js';
import type { RateLimiter } from './rateLimiter.js';

export const registerSocketChatHandlers = (
  io: Server,
  socket: Socket,
  services: { chat: ChatService; activity: ActivityService; permissions: PermissionManager; rateLimiter: RateLimiter },
) => {
  socket.on('chat:history', async (payload: { roomId: string }) => {
    socket.emit('chat:history', await services.chat.list(payload.roomId));
  });

  socket.on('chat:send', async (payload: { roomId: string; userId: string; message: string }) => {
    const userId = socket.data.userId as string;
    const reason = await services.permissions.canChat(payload.roomId, userId);
    if (reason) {
      socket.emit('permission:error', { message: reason });
      return;
    }
    const rate = await services.rateLimiter.check('chat', userId);
    if (!rate.allowed) {
      socket.emit('rate-limit:error', { message: 'Chat rate limit exceeded' });
      return;
    }

    try {
      const message = await services.chat.create(payload.roomId, userId, payload.message);
      io.to(payload.roomId).emit('chat:new', message);
    } catch (error) {
      socket.emit('permission:error', { message: 'Unable to send chat message' });
      console.error(error);
    }
  });
};

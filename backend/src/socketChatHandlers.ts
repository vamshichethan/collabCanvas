import type { Server, Socket } from 'socket.io';
import type { ActivityService } from './activityService.js';
import type { ChatService } from './chatService.js';
import type { PermissionManager } from './permissionManager.js';

export const registerSocketChatHandlers = (
  io: Server,
  socket: Socket,
  services: { chat: ChatService; activity: ActivityService; permissions: PermissionManager },
) => {
  socket.on('chat:history', async (payload: { roomId: string }) => {
    socket.emit('chat:history', await services.chat.list(payload.roomId));
  });

  socket.on('chat:send', async (payload: { roomId: string; userId: string; message: string }) => {
    const reason = await services.permissions.canChat(payload.roomId, payload.userId);
    if (reason) {
      socket.emit('permission:error', { message: reason });
      return;
    }

    try {
      const message = await services.chat.create(payload.roomId, payload.userId, payload.message);
      io.to(payload.roomId).emit('chat:new', message);
    } catch (error) {
      socket.emit('permission:error', { message: 'Unable to send chat message' });
      console.error(error);
    }
  });
};

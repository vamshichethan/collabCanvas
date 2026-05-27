import type { Server, Socket } from 'socket.io';
import type { ActivityService } from './activityService.js';
import type { CommentService } from './commentService.js';
import type { PermissionManager } from './permissionManager.js';

export const registerSocketCommentHandlers = (
  io: Server,
  socket: Socket,
  services: { comments: CommentService; activity: ActivityService; permissions: PermissionManager },
) => {
  socket.on('comment:list', async (payload: { boardId: string }) => {
    socket.emit('comment:list', await services.comments.list(payload.boardId));
  });

  socket.on('comment:add', async (payload: { roomId: string; boardId: string; objectId: string; userId: string; message: string }) => {
    const reason = await services.permissions.canComment(payload.roomId, payload.userId);
    if (reason) {
      socket.emit('permission:error', { message: reason });
      return;
    }

    try {
      const comment = await services.comments.add(payload.boardId, payload.objectId, payload.userId, payload.message);
      const activity = await services.activity.create(payload.roomId, 'COMMENT_ADD', `${comment.userName} commented on an object`, payload.userId);
      io.to(payload.roomId).emit('comment:new', comment);
      io.to(payload.roomId).emit('activity:new', activity);
    } catch (error) {
      socket.emit('permission:error', { message: 'Unable to add comment' });
      console.error(error);
    }
  });

  socket.on('comment:resolve', async (payload: { roomId: string; commentId: string; userId: string; resolved: boolean }) => {
    const reason = await services.permissions.canResolveComment(payload.roomId, payload.userId);
    if (reason) {
      socket.emit('permission:error', { message: reason });
      return;
    }
    const comment = await services.comments.setResolved(payload.commentId, payload.resolved);
    io.to(payload.roomId).emit('comment:resolve', comment);
  });

  socket.on('comment:delete', async (payload: { roomId: string; commentId: string; userId: string }) => {
    const existing = await services.comments.get(payload.commentId);
    if (!existing) return;

    const reason = await services.permissions.canDeleteComment(payload.roomId, payload.userId, existing.userId);
    if (reason) {
      socket.emit('permission:error', { message: reason });
      return;
    }

    const comment = await services.comments.delete(payload.commentId);
    io.to(payload.roomId).emit('comment:delete', comment);
  });
};

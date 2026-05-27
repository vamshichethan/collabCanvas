import type { PrismaClient } from '@prisma/client';
import { sanitizeMessage } from './messageUtils.js';

export class CommentService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(boardId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { boardId },
      include: { user: true, board: true },
      orderBy: { createdAt: 'asc' },
    });
    return comments.map((comment) => this.toComment(comment));
  }

  async add(boardId: string, objectId: string, userId: string, message: string) {
    const cleanMessage = sanitizeMessage(message, 1000);
    if (!cleanMessage) throw new Error('Comment is required');

    const comment = await this.prisma.comment.create({
      data: { boardId, objectId, userId, message: cleanMessage },
      include: { user: true, board: true },
    });
    return this.toComment(comment);
  }

  async setResolved(commentId: string, resolved: boolean) {
    const comment = await this.prisma.comment.update({
      where: { id: commentId },
      data: { resolved },
      include: { user: true, board: true },
    });
    return this.toComment(comment);
  }

  async delete(commentId: string) {
    const comment = await this.prisma.comment.delete({
      where: { id: commentId },
      include: { user: true, board: true },
    });
    return this.toComment(comment);
  }

  async get(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { user: true, board: true },
    });
    return comment ? this.toComment(comment) : null;
  }

  private toComment(comment: {
    id: string;
    boardId: string;
    objectId: string | null;
    userId: string;
    message: string;
    resolved: boolean;
    createdAt: Date;
    user: { name: string };
    board: { roomId: string };
  }) {
    return {
      id: comment.id,
      boardId: comment.boardId,
      roomId: comment.board.roomId,
      objectId: comment.objectId ?? '',
      userId: comment.userId,
      userName: comment.user.name,
      message: comment.message,
      resolved: comment.resolved,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}

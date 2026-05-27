import type { PrismaClient } from '@prisma/client';
import { sanitizeMessage } from './messageUtils.js';

export class ChatService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(roomId: string) {
    const messages = await this.prisma.chatMessage.findMany({
      where: { roomId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return messages.map((message) => ({
      id: message.id,
      roomId: message.roomId,
      userId: message.userId,
      userName: message.user.name,
      message: message.message,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  async create(roomId: string, userId: string, message: string) {
    const cleanMessage = sanitizeMessage(message, 1000);
    if (!cleanMessage) throw new Error('Message is required');

    const saved = await this.prisma.chatMessage.create({
      data: { roomId, userId, message: cleanMessage },
      include: { user: true },
    });

    return {
      id: saved.id,
      roomId: saved.roomId,
      userId: saved.userId,
      userName: saved.user.name,
      message: saved.message,
      createdAt: saved.createdAt.toISOString(),
    };
  }
}

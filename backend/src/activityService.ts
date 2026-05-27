import type { ActivityType, PrismaClient } from '@prisma/client';

export class ActivityService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(roomId: string, type: ActivityType, message: string, userId?: string | null) {
    const activity = await this.prisma.activityLog.create({
      data: { roomId, type, message, userId },
      include: { user: true },
    });
    return this.toActivity(activity);
  }

  async list(roomId: string) {
    const activity = await this.prisma.activityLog.findMany({
      where: { roomId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return activity.map((item) => this.toActivity(item));
  }

  private toActivity(item: {
    id: string;
    roomId: string;
    userId: string | null;
    type: ActivityType;
    message: string;
    createdAt: Date;
  }) {
    return {
      id: item.id,
      roomId: item.roomId,
      userId: item.userId,
      type: item.type,
      message: item.message,
      createdAt: item.createdAt.toISOString(),
    };
  }
}

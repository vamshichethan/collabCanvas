import type { Redis } from 'ioredis';
import type { Participant } from './types.js';
import { instanceId } from './redisClient.js';

const PRESENCE_TTL_SECONDS = 45;

export class PresenceService {
  constructor(private readonly redis: Redis | null) {}

  async upsert(roomId: string, participant: Participant) {
    if (!this.redis || this.redis.status !== 'ready') return;
    await this.redis.hset(this.key(roomId), participant.userId, JSON.stringify({
      userId: participant.userId,
      userName: participant.name,
      name: participant.name,
      socketId: participant.socketId,
      role: participant.role,
      instanceId,
      lastSeenAt: Date.now(),
    }));
    await this.redis.expire(this.key(roomId), PRESENCE_TTL_SECONDS);
  }

  async touch(roomId: string, userId: string) {
    if (!this.redis || this.redis.status !== 'ready') return;
    const raw = await this.redis.hget(this.key(roomId), userId);
    if (!raw) return;
    await this.redis.hset(this.key(roomId), userId, JSON.stringify({ ...JSON.parse(raw), lastSeenAt: Date.now() }));
    await this.redis.expire(this.key(roomId), PRESENCE_TTL_SECONDS);
  }

  async remove(roomId: string, userId: string) {
    if (!this.redis || this.redis.status !== 'ready') return;
    await this.redis.hdel(this.key(roomId), userId);
  }

  async list(roomId: string) {
    if (!this.redis || this.redis.status !== 'ready') return [];
    const values = await this.redis.hvals(this.key(roomId));
    const now = Date.now();
    const participants = values
      .map((value: string) => JSON.parse(value) as Participant & { userName?: string; lastSeenAt: number })
      .filter((participant: Participant & { lastSeenAt: number }) => now - participant.lastSeenAt < PRESENCE_TTL_SECONDS * 1000)
      .map((participant: Participant & { userName?: string; lastSeenAt: number }) => ({
        userId: participant.userId,
        name: participant.name ?? participant.userName ?? 'Guest',
        socketId: participant.socketId,
        joinedAt: participant.joinedAt ?? participant.lastSeenAt,
        role: participant.role,
      }));
    return participants;
  }

  private key(roomId: string) {
    return `presence:room:${roomId}`;
  }
}

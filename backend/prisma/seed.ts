import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const demoPasswordHash = await bcrypt.hash('Demo1234', 12);
  const user = await prisma.user.upsert({
    where: { id: 'demo-user' },
    update: {
      passwordHash: demoPasswordHash,
    },
    create: {
      id: 'demo-user',
      name: 'Demo User',
      email: 'demo@collabcanvas.local',
      passwordHash: demoPasswordHash,
    },
  });

  const room = await prisma.room.upsert({
    where: { id: 'DEMO01' },
    update: {},
    create: {
      id: 'DEMO01',
      name: 'Demo Room',
      inviteCode: 'DEMO01',
      visibility: 'PRIVATE',
      ownerId: user.id,
    },
  });

  await prisma.board.upsert({
    where: { id: 'DEMO01' },
    update: {},
    create: {
      id: 'DEMO01',
      roomId: room.id,
      title: 'Demo Board',
      currentState: [],
      lastSequenceNumber: 0,
    },
  });

  await prisma.participant.upsert({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
    update: {},
    create: {
      roomId: room.id,
      userId: user.id,
      role: 'OWNER',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

import type { PrismaClient, RoomVisibility } from '@prisma/client';

type RoomSettingsInput = {
  visibility?: RoomVisibility;
  allowViewerComments?: boolean;
  lockBoardEditing?: boolean;
};

export class RoomSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  async updateSettings(roomId: string, settings: RoomSettingsInput) {
    return this.prisma.room.update({
      where: { id: roomId },
      data: {
        visibility: settings.visibility,
        allowViewerComments: settings.allowViewerComments,
        lockBoardEditing: settings.lockBoardEditing,
      },
    });
  }

  async regenerateInviteCode(roomId: string) {
    return this.prisma.room.update({
      where: { id: roomId },
      data: { inviteCode: this.createInviteCode() },
    });
  }

  private createInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
}

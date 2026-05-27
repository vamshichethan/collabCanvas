import type { ExportType, Prisma, PrismaClient } from '@prisma/client';
import type { WhiteboardObject } from './types.js';

type ExportOptions = {
  includeComments: boolean;
  includeAISummaries: boolean;
  includeDeleted: boolean;
};

export class ExportService {
  constructor(private readonly prisma: PrismaClient) {}

  async getJsonExport(boardId: string, options: ExportOptions) {
    const board = await this.prisma.board.findUniqueOrThrow({
      where: { id: boardId },
      include: {
        comments: { include: { user: true }, orderBy: { createdAt: 'asc' } },
        versions: { orderBy: { createdAt: 'desc' } },
        aiSummaries: { orderBy: { createdAt: 'desc' } },
      },
    });
    const objects = this.toWhiteboardObjects(board.currentState).filter((object) => options.includeDeleted || !object.deleted);

    return {
      boardId: board.id,
      roomId: board.roomId,
      title: board.title,
      exportedAt: new Date().toISOString(),
      lastSequenceNumber: board.lastSequenceNumber,
      objects,
      comments: options.includeComments
        ? board.comments.map((comment) => ({
            id: comment.id,
            boardId: comment.boardId,
            objectId: comment.objectId,
            userId: comment.userId,
            userName: comment.user.name,
            message: comment.message,
            resolved: comment.resolved,
            createdAt: comment.createdAt.toISOString(),
          }))
        : [],
      versions: board.versions.map((version) => ({
        id: version.id,
        boardId: version.boardId,
        name: version.name,
        state: version.state,
        sequenceNumber: version.sequenceNumber,
        createdAt: version.createdAt.toISOString(),
        createdBy: version.createdBy,
      })),
      aiSummaries: options.includeAISummaries
        ? board.aiSummaries.map((summary) => ({
            id: summary.id,
            boardId: summary.boardId,
            roomId: summary.roomId,
            generatedBy: summary.generatedBy,
            summaryType: summary.summaryType,
            summary: summary.summary,
            createdAt: summary.createdAt.toISOString(),
          }))
        : [],
    };
  }

  async recordExport(boardId: string, exportedBy: string, exportType: ExportType) {
    const board = await this.prisma.board.findUniqueOrThrow({ where: { id: boardId } });
    const record = await this.prisma.boardExport.create({
      data: {
        boardId,
        roomId: board.roomId,
        exportedBy,
        exportType,
      },
      include: { user: true },
    });

    return {
      id: record.id,
      boardId: record.boardId,
      roomId: record.roomId,
      exportedBy: record.exportedBy,
      exportedByName: record.user.name,
      exportType: record.exportType,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private toWhiteboardObjects(value: Prisma.JsonValue) {
    return Array.isArray(value) ? (value as WhiteboardObject[]) : [];
  }
}

export const exportTypes: ExportType[] = ['PNG', 'PDF', 'JSON'];

export const isExportType = (value: unknown): value is ExportType =>
  typeof value === 'string' && exportTypes.includes(value as ExportType);

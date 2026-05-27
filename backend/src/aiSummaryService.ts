import type { Prisma, PrismaClient, SummaryType } from '@prisma/client';
import type { WhiteboardObject } from './types.js';

type SummaryPayload = {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
  openQuestions: string[];
  nextSteps: string[];
};

const MAX_TEXT_OBJECTS = 60;
const MAX_MESSAGES = 80;
const MAX_COMMENTS = 80;
const MAX_ACTIVITY = 80;

export class AISummaryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(boardId: string) {
    const summaries = await this.prisma.aISummary.findMany({
      where: { boardId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return summaries.map((summary) => ({
      id: summary.id,
      boardId: summary.boardId,
      roomId: summary.roomId,
      generatedBy: summary.generatedBy,
      generatedByName: summary.user.name,
      summaryType: summary.summaryType,
      summary: summary.summary as SummaryPayload,
      createdAt: summary.createdAt.toISOString(),
    }));
  }

  async generate(boardId: string, generatedBy: string, summaryType: SummaryType) {
    const context = await this.buildContext(boardId);
    const summary = await this.callGemini(context, summaryType);
    const saved = await this.prisma.aISummary.create({
      data: {
        boardId,
        roomId: context.roomId,
        generatedBy,
        summaryType,
        summary: summary as unknown as Prisma.InputJsonValue,
      },
      include: { user: true },
    });

    return {
      id: saved.id,
      boardId: saved.boardId,
      roomId: saved.roomId,
      generatedBy: saved.generatedBy,
      generatedByName: saved.user.name,
      summaryType: saved.summaryType,
      summary,
      actionItems: summary.actionItems,
      decisions: summary.decisions,
      openQuestions: summary.openQuestions,
      generatedAt: saved.createdAt.toISOString(),
      createdAt: saved.createdAt.toISOString(),
    };
  }

  private async buildContext(boardId: string) {
    const board = await this.prisma.board.findUniqueOrThrow({
      where: { id: boardId },
      include: {
        comments: { include: { user: true }, orderBy: { createdAt: 'desc' }, take: MAX_COMMENTS },
        room: {
          include: {
            chatMessages: { include: { user: true }, orderBy: { createdAt: 'desc' }, take: MAX_MESSAGES },
            activityLogs: { orderBy: { createdAt: 'desc' }, take: MAX_ACTIVITY },
          },
        },
        versions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const objects = this.toWhiteboardObjects(board.currentState).filter((object) => !object.deleted);
    const textObjects = objects
      .filter((object) => object.type === 'text' && object.text?.trim())
      .slice(0, MAX_TEXT_OBJECTS)
      .map((object) => object.text?.trim());
    const shapesOverview = objects.reduce<Record<string, number>>((counts, object) => {
      counts[object.type] = (counts[object.type] ?? 0) + 1;
      return counts;
    }, {});

    return {
      boardId: board.id,
      roomId: board.roomId,
      boardTitle: board.title,
      versionName: board.versions[0]?.name ?? null,
      textOnBoard: textObjects,
      shapesOverview,
      comments: board.comments
        .slice()
        .reverse()
        .map((comment) => ({
          objectId: comment.objectId,
          userName: comment.user.name,
          message: comment.message,
          resolved: comment.resolved,
          createdAt: comment.createdAt.toISOString(),
        })),
      chatMessages: board.room.chatMessages
        .slice()
        .reverse()
        .map((message) => ({
          userName: message.user.name,
          message: message.message,
          createdAt: message.createdAt.toISOString(),
        })),
      activitySummary: board.room.activityLogs
        .slice()
        .reverse()
        .map((item) => ({
          type: item.type,
          message: item.message,
          createdAt: item.createdAt.toISOString(),
        })),
    };
  }

  private async callGemini(context: Awaited<ReturnType<AISummaryService['buildContext']>>, summaryType: SummaryType): Promise<SummaryPayload> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'}:generateContent`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: this.buildPrompt(context, summaryType) }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('Gemini rate limit reached. Try again later.');
      throw new Error(`Gemini request failed with status ${response.status}`);
    }

    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
    if (!text) throw new Error('Gemini returned an empty summary');

    return normalizeSummary(parseSummaryJson(text));
  }

  private buildPrompt(context: Awaited<ReturnType<AISummaryService['buildContext']>>, summaryType: SummaryType) {
    return [
      'You are summarizing a collaborative whiteboard session.',
      'Return valid JSON only.',
      'Do not invent details.',
      'Use only the provided board, chat, comments, and activity context.',
      'Expected JSON:',
      '{"summary":"...","keyPoints":["..."],"actionItems":["..."],"decisions":["..."],"openQuestions":["..."],"nextSteps":["..."]}',
      `Summary type: ${summaryType}`,
      `Context: ${JSON.stringify(context)}`,
    ].join('\n');
  }

  private toWhiteboardObjects(value: Prisma.JsonValue) {
    return Array.isArray(value) ? (value as WhiteboardObject[]) : [];
  }
}

export const summaryTypes: SummaryType[] = ['MEETING_NOTES', 'ACTION_ITEMS', 'CLASS_NOTES', 'MIND_MAP'];

export const isSummaryType = (value: unknown): value is SummaryType =>
  typeof value === 'string' && summaryTypes.includes(value as SummaryType);

const parseSummaryJson = (text: string) => {
  const cleanText = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleanText) as Partial<SummaryPayload>;
  } catch {
    throw new Error('Gemini returned invalid JSON');
  }
};

const normalizeSummary = (summary: Partial<SummaryPayload>): SummaryPayload => ({
  summary: typeof summary.summary === 'string' ? summary.summary : '',
  keyPoints: normalizeStringList(summary.keyPoints),
  actionItems: normalizeStringList(summary.actionItems),
  decisions: normalizeStringList(summary.decisions),
  openQuestions: normalizeStringList(summary.openQuestions),
  nextSteps: normalizeStringList(summary.nextSteps),
});

const normalizeStringList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

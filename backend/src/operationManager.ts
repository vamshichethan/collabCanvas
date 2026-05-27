import { PersistenceManager } from './persistenceManager.js';
import type { ClientOperation } from './types.js';

export class OperationManager {
  private boardCache = new Map<string, Awaited<ReturnType<PersistenceManager['getBoardState']>>>();

  constructor(private readonly persistence: PersistenceManager) {}

  async submit(operation: ClientOperation) {
    const result = await this.persistence.submitOperation(operation);
    this.boardCache.set(operation.boardId, {
      board: result.board.filter((object) => !object.deleted),
      lastSequenceNumber: result.operation.sequenceNumber,
    });
    return result.operation;
  }

  async getBoard(boardId: string) {
    const state = await this.getBoardState(boardId);
    return state.board;
  }

  async getBoardState(boardId: string) {
    const cached = this.boardCache.get(boardId);
    if (cached) return cached;

    const state = await this.persistence.getBoardState(boardId);
    this.boardCache.set(boardId, state);
    return state;
  }

  async getOperationsAfter(boardId: string, sequenceNumber: number) {
    return this.persistence.getOperationsAfter(boardId, sequenceNumber);
  }

  async getLastSequenceNumber(boardId: string) {
    return (await this.getBoardState(boardId)).lastSequenceNumber;
  }

  invalidateBoard(boardId: string) {
    this.boardCache.delete(boardId);
  }
}

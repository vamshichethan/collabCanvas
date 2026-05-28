import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '../lib/api';
import { getBrowserOnline, subscribeConnectionStatus } from '../lib/connectionStatus';
import { offlineQueue } from '../lib/offlineQueue';
import { findOfflineConflicts, toBatchPayload } from '../lib/syncManager';
import type {
  ActivityItem,
  BatchOperationAck,
  BoardOperation,
  ChatMessage,
  ClientOperation,
  CursorPosition,
  ObjectComment,
  OperationAck,
  Participant,
  QueuedOperation,
  SyncStatus,
  AuthUser,
  WhiteboardObject,
} from '../types';

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:5000';

type FullSyncPayload = {
  board: WhiteboardObject[];
  lastSequenceNumber: number;
};

type MissedResponsePayload = {
  operations: BoardOperation[];
  lastSequenceNumber: number;
};

export function useRoomCollaboration(roomId: string, authUser: AuthUser) {
  const identity = useMemo(() => ({ userId: authUser.id, name: authUser.name, role: 'editor' as const }), [authUser.id, authUser.name]);
  const socketRef = useRef<Socket | null>(null);
  const lastCursorEmit = useRef(0);
  const lastSeenSequenceNumber = useRef(Number(localStorage.getItem(`collabcanvas:${roomId}:lastSequence`) ?? 0));
  const syncInProgressRef = useRef(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteOperation, setRemoteOperation] = useState<BoardOperation | null>(null);
  const [initialBoard, setInitialBoard] = useState<WhiteboardObject[] | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, CursorPosition>>({});
  const [connected, setConnected] = useState(false);
  const [lastSeenSequence, setLastSeenSequence] = useState(lastSeenSequenceNumber.current);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [comments, setComments] = useState<ObjectComment[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [browserOnline, setBrowserOnline] = useState(getBrowserOnline);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getBrowserOnline() ? 'Reconnecting' : 'Offline');
  const [pendingOperationCount, setPendingOperationCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const clearPermissionError = useCallback(() => setPermissionError(null), []);
  const clearConflictMessage = useCallback(() => setConflictMessage(null), []);

  const refreshPendingCounts = useCallback(async () => {
    const operations = await offlineQueue.listRoom(roomId);
    setPendingOperationCount(operations.filter((operation) => operation.status === 'PENDING' || operation.status === 'SYNCING').length);
    setFailedSyncCount(operations.filter((operation) => operation.status === 'FAILED').length);
  }, [roomId]);

  const markSequenceSeen = useCallback(
    (sequenceNumber: number) => {
      lastSeenSequenceNumber.current = Math.max(lastSeenSequenceNumber.current, sequenceNumber);
      localStorage.setItem(`collabcanvas:${roomId}:lastSequence`, String(lastSeenSequenceNumber.current));
      setLastSeenSequence(lastSeenSequenceNumber.current);
    },
    [roomId],
  );

  const applyRemoteOperation = useCallback(
    (operation: BoardOperation) => {
      markSequenceSeen(operation.sequenceNumber);
      if (operation.userId !== identity.userId) {
        setRemoteOperation(operation);
      }
    },
    [identity.userId, markSequenceSeen],
  );

  const submitQueuedOperations = useCallback(
    async (socket = socketRef.current, includeFailed = false) => {
      if (!socket?.connected || !browserOnline || syncInProgressRef.current) return;

      const pending = await offlineQueue.listPending(roomId, includeFailed);
      if (!pending.length) {
        setSyncStatus('Synced');
        await refreshPendingCounts();
        return;
      }

      syncInProgressRef.current = true;
      setSyncStatus('Syncing');
      await offlineQueue.markMany(pending.map((operation) => operation.localId), 'SYNCING');
      await refreshPendingCounts();

      socket.emit('operation:submit-batch', {
        roomId,
        operations: toBatchPayload(pending),
      });
    },
    [browserOnline, refreshPendingCounts, roomId],
  );

  useEffect(() => {
    let active = true;

    Promise.all([api.getChat(roomId), api.getComments(roomId), api.getActivity(roomId)])
      .then(([messages, nextComments, nextActivity]) => {
        if (!active) return;
        setChatMessages(messages);
        setComments(nextComments);
        setActivityItems(nextActivity);
      })
      .catch(() => {
        if (!active) return;
        setChatMessages([]);
        setComments([]);
        setActivityItems([]);
      });

    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    void refreshPendingCounts();
    return subscribeConnectionStatus((online) => {
      setBrowserOnline(online);
      setSyncStatus(online ? 'Reconnecting' : 'Offline');
      if (online) void submitQueuedOperations();
    });
  }, [refreshPendingCounts, submitQueuedOperations]);

  useEffect(() => {
    const socket = io(socketUrl, {
      transports: ['websocket'],
      reconnection: true,
      withCredentials: true,
    });
    socketRef.current = socket;

    const joinRoom = () => {
      socket.emit('room:join', {
        roomId,
        userId: identity.userId,
        name: identity.name,
        role: identity.role,
      });
    };

    socket.on('connect', () => {
      setConnected(true);
      setSyncStatus('Reconnecting');
      joinRoom();
      socket.emit('operation:missed-request', {
        roomId,
        afterSequenceNumber: lastSeenSequenceNumber.current,
      });
      socket.emit('chat:history', { roomId });
      socket.emit('comment:list', { boardId: roomId });
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setSyncStatus(getBrowserOnline() ? 'Reconnecting' : 'Offline');
    });
    socket.io.on('reconnect_attempt', () => setSyncStatus('Reconnecting'));
    socket.on('room:participants', setParticipants);
    socket.on('permission:error', (payload: { message: string }) => setPermissionError(payload.message));
    socket.on('rate-limit:error', (payload: { message: string }) => setPermissionError(payload.message));
    socket.on('room:error', (payload: { message: string }) => setPermissionError(payload.message));
    socket.on('board:full-sync', (payload: FullSyncPayload) => {
      setInitialBoard(payload.board);
      markSequenceSeen(payload.lastSequenceNumber);
    });
    socket.on('operation:ack', (ack: OperationAck) => {
      if (ack.accepted && ack.operation) {
        markSequenceSeen(ack.operation.sequenceNumber);
        return;
      }

      if (ack.boardState) {
        setInitialBoard(ack.boardState);
      } else {
        socket.emit('operation:missed-request', {
          roomId,
          afterSequenceNumber: 0,
        });
      }
    });
    socket.on('operation:applied', applyRemoteOperation);
    socket.on('operation:missed-response', (payload: MissedResponsePayload) => {
      void (async () => {
        const sortedOperations = payload.operations.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        const pending = await offlineQueue.listPending(roomId);
        const conflicts = findOfflineConflicts(pending, sortedOperations);
        if (conflicts.length) {
          const conflictIds = new Set(conflicts.map((operation) => operation.objectId));
          const conflictedLocalOperations = pending.filter((operation) => conflictIds.has(operation.objectId));
          await offlineQueue.markMany(
            conflictedLocalOperations.map((operation) => operation.localId),
            'FAILED',
            1,
          );
          setConflictMessage('Remote changes won for one or more offline edits. Review the board before retrying.');
          socket.emit('operation:conflict', {
            roomId,
            objectIds: Array.from(conflictIds),
          });
        }

        sortedOperations.forEach(applyRemoteOperation);
        markSequenceSeen(payload.lastSequenceNumber);
        await refreshPendingCounts();
        await submitQueuedOperations(socket);
      })();
    });
    socket.on('operation:batch-ack', (payload: { acks: BatchOperationAck[]; boardState?: WhiteboardObject[]; lastSequenceNumber?: number }) => {
      void (async () => {
        const accepted = payload.acks.filter((ack) => ack.accepted);
        const rejected = payload.acks.filter((ack) => !ack.accepted);
        await offlineQueue.markMany(accepted.map((ack) => ack.localId), 'SYNCED');
        await offlineQueue.markMany(rejected.map((ack) => ack.localId), 'FAILED', 1);

        accepted.forEach((ack) => {
          if (ack.operation) markSequenceSeen(ack.operation.sequenceNumber);
        });
        if (payload.lastSequenceNumber) markSequenceSeen(payload.lastSequenceNumber);
        if (payload.boardState && rejected.length) {
          setInitialBoard(payload.boardState);
        }
        if (rejected.length) {
          setPermissionError(rejected[0]?.reason ?? 'Some offline operations failed to sync');
        }

        syncInProgressRef.current = false;
        await refreshPendingCounts();
        const remaining = await offlineQueue.listPending(roomId);
        setSyncStatus(remaining.length ? 'Reconnecting' : 'Synced');
      })();
    });
    socket.on('operation:conflict', (payload: { message?: string }) => {
      setConflictMessage(payload.message ?? 'Remote changes won for one or more offline edits.');
    });
    socket.on('sync:status', (payload: { status: SyncStatus }) => setSyncStatus(payload.status));
    socket.on('sync:pending-ops', (payload: { count: number }) => setPendingOperationCount(payload.count));
    socket.on('board:resync-required', (payload: FullSyncPayload) => {
      setInitialBoard(payload.board);
      markSequenceSeen(payload.lastSequenceNumber);
      setSyncStatus('Synced');
    });
    socket.on('cursor:move', (cursor: CursorPosition) => {
      if (cursor.userId === identity.userId) return;
      setRemoteCursors((current) => ({ ...current, [cursor.userId]: cursor }));
    });
    socket.on('user:left', (participant: Partial<Participant>) => {
      if (!participant.userId) return;
      setRemoteCursors((current) => {
        const next = { ...current };
        delete next[participant.userId!];
        return next;
      });
    });
    socket.on('chat:history', (messages: ChatMessage[]) => setChatMessages(messages));
    socket.on('chat:new', (message: ChatMessage) => {
      setChatMessages((current) => [...current.filter((item) => item.id !== message.id), message]);
    });
    socket.on('comment:list', (nextComments: ObjectComment[]) => setComments(nextComments));
    socket.on('comment:new', (comment: ObjectComment) => {
      setComments((current) => [...current.filter((item) => item.id !== comment.id), comment]);
    });
    socket.on('comment:resolve', (comment: ObjectComment) => {
      setComments((current) => current.map((item) => (item.id === comment.id ? comment : item)));
    });
    socket.on('comment:delete', (payload: { commentId: string }) => {
      setComments((current) => current.filter((item) => item.id !== payload.commentId));
    });
    socket.on('activity:new', (activity: ActivityItem) => {
      setActivityItems((current) => [...current.filter((item) => item.id !== activity.id), activity]);
    });

    return () => {
      socket.emit('room:leave', { roomId, userId: identity.userId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyRemoteOperation, identity.name, identity.role, identity.userId, markSequenceSeen, refreshPendingCounts, roomId, submitQueuedOperations]);

  const emitOperation = useCallback(
    (operation: ClientOperation) => {
      void (async () => {
        await offlineQueue.enqueue(operation);
        await refreshPendingCounts();
        if (!browserOnline || !socketRef.current?.connected) {
          setSyncStatus(browserOnline ? 'Reconnecting' : 'Offline');
          return;
        }
        await submitQueuedOperations();
      })();
    },
    [browserOnline, refreshPendingCounts, submitQueuedOperations],
  );

  const sendChat = useCallback(
    (message: string) => {
      socketRef.current?.emit('chat:send', { roomId, userId: identity.userId, message });
    },
    [identity.userId, roomId],
  );

  const addComment = useCallback(
    (objectId: string, message: string) => {
      socketRef.current?.emit('comment:add', { roomId, boardId: roomId, objectId, userId: identity.userId, message });
    },
    [identity.userId, roomId],
  );

  const resolveComment = useCallback(
    (commentId: string, resolved: boolean) => {
      socketRef.current?.emit('comment:resolve', { roomId, userId: identity.userId, commentId, resolved });
    },
    [identity.userId, roomId],
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      socketRef.current?.emit('comment:delete', { roomId, userId: identity.userId, commentId });
    },
    [identity.userId, roomId],
  );

  const emitCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastCursorEmit.current < 45) return;
      lastCursorEmit.current = now;

      socketRef.current?.emit('cursor:move', {
        roomId,
        userId: identity.userId,
        name: identity.name,
        x,
        y,
      } satisfies CursorPosition);
    },
    [identity.name, identity.userId, roomId],
  );

  return {
    connected,
    browserOnline,
    syncStatus,
    userId: identity.userId,
    userName: identity.name,
    participants,
    currentRole: participants.find((participant) => participant.userId === identity.userId)?.role ?? identity.role,
    initialBoard,
    remoteOperation,
    remoteCursors: Object.values(remoteCursors),
    chatMessages,
    comments,
    activityItems,
    lastSeenSequence,
    pendingOperationCount,
    failedSyncCount,
    conflictMessage,
    permissionError,
    clearPermissionError,
    clearConflictMessage,
    emitOperation,
    emitCursor,
    sendChat,
    addComment,
    resolveComment,
    deleteComment,
    manualSync: () => submitQueuedOperations(socketRef.current, true),
  };
}

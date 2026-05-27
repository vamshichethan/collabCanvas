import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { createClientId } from '../lib/ids';
import type {
  BoardOperation,
  ClientOperation,
  CursorPosition,
  OperationAck,
  Participant,
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

export const getOrCreateIdentity = () => {
  const storedUserId = localStorage.getItem('collabcanvas:userId');
  const userId = storedUserId ?? createClientId('user');
  if (!storedUserId) localStorage.setItem('collabcanvas:userId', userId);

  const storedName = localStorage.getItem('collabcanvas:name');
  const name = storedName ?? `User ${userId.slice(-4)}`;
  if (!storedName) localStorage.setItem('collabcanvas:name', name);

  return { userId, name, role: 'editor' as const };
};

export function useRoomCollaboration(roomId: string) {
  const identity = useMemo(getOrCreateIdentity, []);
  const socketRef = useRef<Socket | null>(null);
  const lastCursorEmit = useRef(0);
  const lastSeenSequenceNumber = useRef(Number(localStorage.getItem(`collabcanvas:${roomId}:lastSequence`) ?? 0));
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteOperation, setRemoteOperation] = useState<BoardOperation | null>(null);
  const [initialBoard, setInitialBoard] = useState<WhiteboardObject[] | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, CursorPosition>>({});
  const [connected, setConnected] = useState(false);
  const [lastSeenSequence, setLastSeenSequence] = useState(lastSeenSequenceNumber.current);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const clearPermissionError = useCallback(() => setPermissionError(null), []);

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

  useEffect(() => {
    const socket = io(socketUrl, {
      transports: ['websocket'],
      reconnection: true,
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
      joinRoom();
      socket.emit('operation:missed-request', {
        roomId,
        afterSequenceNumber: lastSeenSequenceNumber.current,
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('room:participants', setParticipants);
    socket.on('permission:error', (payload: { message: string }) => setPermissionError(payload.message));
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
      payload.operations
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
        .forEach(applyRemoteOperation);
      markSequenceSeen(payload.lastSequenceNumber);
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

    return () => {
      socket.emit('room:leave', { roomId, userId: identity.userId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyRemoteOperation, identity.name, identity.role, identity.userId, markSequenceSeen, roomId]);

  const emitOperation = useCallback((operation: ClientOperation) => {
    socketRef.current?.emit('operation:submit', operation);
  }, []);

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
    userId: identity.userId,
    userName: identity.name,
    participants,
    currentRole: participants.find((participant) => participant.userId === identity.userId)?.role ?? identity.role,
    initialBoard,
    remoteOperation,
    remoteCursors: Object.values(remoteCursors),
    lastSeenSequence,
    permissionError,
    clearPermissionError,
    emitOperation,
    emitCursor,
  };
}

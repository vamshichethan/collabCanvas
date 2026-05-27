import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { createClientId } from '../lib/ids';
import type { BoardOperation, CursorPosition, Participant, WhiteboardObject } from '../types';

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000';

export const getOrCreateIdentity = () => {
  const storedUserId = localStorage.getItem('collabcanvas:userId');
  const userId = storedUserId ?? createClientId('user');
  if (!storedUserId) localStorage.setItem('collabcanvas:userId', userId);

  const storedName = localStorage.getItem('collabcanvas:name');
  const name = storedName ?? `User ${userId.slice(-4)}`;
  if (!storedName) localStorage.setItem('collabcanvas:name', name);

  return { userId, name };
};

export function useRoomCollaboration(roomId: string) {
  const identity = useMemo(getOrCreateIdentity, []);
  const socketRef = useRef<Socket | null>(null);
  const lastCursorEmit = useRef(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteOperation, setRemoteOperation] = useState<BoardOperation | null>(null);
  const [initialBoard, setInitialBoard] = useState<WhiteboardObject[] | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, CursorPosition>>({});
  const [connected, setConnected] = useState(false);

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
      });
    };

    socket.on('connect', () => {
      setConnected(true);
      joinRoom();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('room:participants', setParticipants);
    socket.on('board:sync', setInitialBoard);
    socket.on('board:operation', (operation: BoardOperation) => {
      if (operation.userId !== identity.userId) setRemoteOperation(operation);
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
  }, [identity.name, identity.userId, roomId]);

  const emitOperation = useCallback((operation: BoardOperation) => {
    socketRef.current?.emit('board:operation', operation);
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
    initialBoard,
    remoteOperation,
    remoteCursors: Object.values(remoteCursors),
    emitOperation,
    emitCursor,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '../lib/api';
import { createClientId } from '../lib/ids';
import type {
  ActivityItem,
  BoardOperation,
  ChatMessage,
  ClientOperation,
  CursorPosition,
  ObjectComment,
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [comments, setComments] = useState<ObjectComment[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
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
      socket.emit('chat:history', { roomId });
      socket.emit('comment:list', { boardId: roomId });
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
  }, [applyRemoteOperation, identity.name, identity.role, identity.userId, markSequenceSeen, roomId]);

  const emitOperation = useCallback((operation: ClientOperation) => {
    socketRef.current?.emit('operation:submit', operation);
  }, []);

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
    permissionError,
    clearPermissionError,
    emitOperation,
    emitCursor,
    sendChat,
    addComment,
    resolveComment,
    deleteComment,
  };
}

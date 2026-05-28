import { useEffect, useMemo, useState } from 'react';
import CanvasBoard from './components/CanvasBoard';
import CollaborationSidebar from './components/CollaborationSidebar';
import ParticipantPanel from './components/ParticipantPanel';
import RoomSettingsPanel from './components/RoomSettingsPanel';
import Toolbar from './components/Toolbar';
import VersionHistoryPanel from './components/VersionHistoryPanel';
import { getOrCreateIdentity, useRoomCollaboration } from './hooks/useRoomCollaboration';
import { api } from './lib/api';
import { buildReplayCache, buildReplayState } from './lib/replay';
import { getRoomIdFromPath, navigateToRoom } from './lib/room';
import type { AISummaryRecord, DashboardRoom, DrawingSettings, ReplayOperation, SummaryType, Tool, WhiteboardObject } from './types';

function App() {
  const [roomId, setRoomId] = useState(getRoomIdFromPath());

  useEffect(() => {
    const handleRouteChange = () => setRoomId(getRoomIdFromPath());
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  return roomId ? <RoomPage roomId={roomId} /> : <DashboardPage />;
}

function DashboardPage() {
  const identity = useMemo(getOrCreateIdentity, []);
  const [rooms, setRooms] = useState<DashboardRoom[]>([]);
  const [joinValue, setJoinValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadRooms = async () => {
    setLoading(true);
    try {
      setRooms(await api.listRooms(identity.userId));
    } catch {
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRooms();
  }, []);

  const createRoom = async () => {
    setCreating(true);
    const created = await api.createRoom(identity.userId, identity.name);
    setCreating(false);
    navigateToRoom(created.room.id);
  };

  const joinRoom = () => {
    const trimmed = joinValue.trim();
    const parsed = trimmed.match(/\/room\/([^/?#]+)/)?.[1] ?? trimmed;
    if (parsed) navigateToRoom(parsed);
  };

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-8 text-slate-950">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-board md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">CollabCanvas</p>
            <h1 className="mt-2 text-3xl font-semibold">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Rooms and persisted boards for {identity.name}</p>
          </div>
          <button
            type="button"
            onClick={createRoom}
            disabled={creating}
            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? 'Creating...' : 'Create room'}
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
          <input
            value={joinValue}
            onChange={(event) => setJoinValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') joinRoom();
            }}
            placeholder="Paste invite link or room ID"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500"
          />
          <button
            type="button"
            onClick={joinRoom}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Join room
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <p className="text-sm text-slate-500">Loading rooms...</p>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-slate-500">No rooms yet. Create one to start.</p>
          ) : (
            rooms.map((room) => (
              <button
                type="button"
                key={room.id}
                onClick={() => navigateToRoom(room.id)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-board"
              >
                <p className="text-lg font-semibold text-slate-900">{room.name}</p>
                <p className="mt-1 text-sm text-slate-500">Invite {room.inviteCode}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {room.boards[0]?.lastSequenceNumber ?? 0} operations
                </p>
              </button>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function RoomPage({ roomId }: { roomId: string }) {
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [settings, setSettings] = useState<DrawingSettings>({
    color: '#2563eb',
    strokeWidth: 4,
  });
  const [copied, setCopied] = useState(false);
  const [restoredBoard, setRestoredBoard] = useState<WhiteboardObject[] | null>(null);
  const [room, setRoom] = useState<DashboardRoom | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [aiSummaries, setAiSummaries] = useState<AISummaryRecord[]>([]);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [replayMode, setReplayMode] = useState(false);
  const [replayOperations, setReplayOperations] = useState<ReplayOperation[]>([]);
  const [replayStep, setReplayStep] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayLoading, setReplayLoading] = useState(false);
  const inviteLink = useMemo(() => `${window.location.origin}/room/${roomId}`, [roomId]);
  const collaboration = useRoomCollaboration(roomId);
  const currentDbParticipant = room?.participants.find((participant) => participant.userId === collaboration.userId);
  const currentRole = currentDbParticipant?.role ?? roleToDb(collaboration.currentRole);
  const isOwner = currentRole === 'OWNER';
  const isViewer = currentRole === 'VIEWER';
  const boardLocked = Boolean(room?.lockBoardEditing && !isOwner);
  const readOnly = isViewer || boardLocked;
  const canSendChat = currentRole === 'OWNER' || currentRole === 'EDITOR' || Boolean(room?.allowViewerComments);
  const canComment = canSendChat;
  const canGenerateAISummary = currentRole === 'OWNER' || currentRole === 'EDITOR' || Boolean(room?.allowViewerAISummaries);
  const canExport = currentRole === 'OWNER' || currentRole === 'EDITOR' || Boolean(room?.allowViewerExports);
  const canReplay = currentRole === 'OWNER' || currentRole === 'EDITOR' || Boolean(room?.allowViewerReplay);
  const boardTitle = room?.boards[0]?.title ?? 'CollabCanvas Board';
  const replayCache = useMemo(() => buildReplayCache(replayOperations), [replayOperations]);
  const replayObjects = useMemo(
    () => (replayMode ? buildReplayState(replayOperations, replayStep, replayCache) : null),
    [replayCache, replayMode, replayOperations, replayStep],
  );
  const currentReplayOperation = replayStep > 0 ? replayOperations[replayStep - 1] : null;

  const loadRoom = async () => {
    try {
      setRoom(await api.getRoom(roomId));
    } catch {
      setToast('Unable to load room details');
    }
  };

  useEffect(() => {
    void loadRoom();
  }, [roomId]);

  useEffect(() => {
    let active = true;

    api
      .getAISummaries(roomId)
      .then((summaries) => {
        if (active) setAiSummaries(summaries);
      })
      .catch(() => {
        if (active) setAiSummaries([]);
      });

    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!collaboration.permissionError) return;
    setToast(collaboration.permissionError);
    collaboration.clearPermissionError();
  }, [collaboration.permissionError, collaboration.clearPermissionError]);

  useEffect(() => {
    if (!collaboration.conflictMessage) return;
    setToast(collaboration.conflictMessage);
    collaboration.clearConflictMessage();
  }, [collaboration.conflictMessage, collaboration.clearConflictMessage]);

  useEffect(() => {
    if (!replayMode || !replayPlaying) return;
    if (replayStep >= replayOperations.length) {
      setReplayPlaying(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setReplayStep((current) => Math.min(current + 1, replayOperations.length));
    }, 900 / replaySpeed);

    return () => window.clearTimeout(timer);
  }, [replayMode, replayOperations.length, replayPlaying, replaySpeed, replayStep]);

  const copyInviteLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const handleRestore = (objects: WhiteboardObject[], lastSequenceNumber: number) => {
    setRestoredBoard(objects);
    localStorage.setItem(`collabcanvas:${roomId}:lastSequence`, String(lastSequenceNumber));
  };

  const updateRole = async (userId: string, role: 'OWNER' | 'EDITOR' | 'VIEWER') => {
    try {
      await api.updateParticipantRole(roomId, collaboration.userId, userId, role);
      await loadRoom();
    } catch {
      setToast('Only owners can change roles');
    }
  };

  const removeParticipant = async (userId: string) => {
    try {
      await api.removeParticipant(roomId, collaboration.userId, userId);
      await loadRoom();
    } catch {
      setToast('Only owners can remove participants');
    }
  };

  const updateSettings = async (settings: {
    visibility?: 'PUBLIC' | 'PRIVATE';
    allowViewerComments?: boolean;
    allowViewerAISummaries?: boolean;
    allowViewerExports?: boolean;
    lockBoardEditing?: boolean;
  }) => {
    try {
      setRoom(await api.updateRoomSettings(roomId, collaboration.userId, settings));
    } catch {
      setToast('Only owners can update room settings');
    }
  };

  const regenerateInvite = async () => {
    try {
      setRoom(await api.regenerateInvite(roomId, collaboration.userId));
    } catch {
      setToast('Only owners can regenerate invite links');
    }
  };

  const generateAISummary = async (summaryType: SummaryType) => {
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    try {
      const summary = await api.generateAISummary(roomId, collaboration.userId, summaryType);
      setAiSummaries((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate summary';
      setAiSummaryError(message);
      setToast('Unable to generate AI summary');
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const exportJson = (options: {
    includeComments: boolean;
    includeAISummaries: boolean;
    includeDeleted: boolean;
    transparentBackground: boolean;
  }) =>
    api.exportBoardJson(roomId, collaboration.userId, {
      includeComments: options.includeComments,
      includeAISummaries: options.includeAISummaries,
      includeDeleted: options.includeDeleted,
    });

  const recordExport = async (exportType: 'PNG' | 'PDF' | 'JSON') => {
    await api.recordBoardExport(roomId, collaboration.userId, exportType);
  };

  const startReplay = async () => {
    if (!canReplay) {
      setToast('You do not have permission to replay this board');
      return;
    }

    setReplayLoading(true);
    setToast(null);
    try {
      const replay = await api.getReplay(roomId, collaboration.userId);
      setReplayOperations(replay.operations);
      setReplayStep(0);
      setReplayPlaying(false);
      setReplayMode(true);
      setActiveTool('select');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to load replay');
    } finally {
      setReplayLoading(false);
    }
  };

  const exitReplay = async () => {
    setReplayMode(false);
    setReplayPlaying(false);
    setReplayStep(0);
    setReplayOperations([]);
    try {
      const liveBoard = await api.getBoard(roomId);
      setRestoredBoard(liveBoard.board);
      localStorage.setItem(`collabcanvas:${roomId}:lastSequence`, String(liveBoard.lastSequenceNumber));
    } catch {
      setToast('Exited replay. Live board will refresh on the next sync.');
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white/92 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">CollabCanvas</h1>
            <p className="text-sm text-slate-500">
              Room {roomId} · {collaboration.syncStatus}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={[
                'rounded-lg border px-3 py-2 text-sm font-semibold',
                collaboration.syncStatus === 'Synced' || collaboration.syncStatus === 'Connected'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : collaboration.syncStatus === 'Offline'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-blue-200 bg-blue-50 text-blue-700',
              ].join(' ')}
            >
              {collaboration.syncStatus}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              {collaboration.participants.length} participant{collaboration.participants.length === 1 ? '' : 's'}
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              Autosaved through sequence {collaboration.lastSeenSequence}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
              {collaboration.pendingOperationCount} pending
            </div>
            {collaboration.failedSyncCount ? (
              <button
                type="button"
                onClick={() => void collaboration.manualSync()}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                Retry failed ({collaboration.failedSyncCount})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void collaboration.manualSync()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Sync now
              </button>
            )}
            <button
              type="button"
              onClick={copyInviteLink}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {copied ? 'Copied' : 'Copy invite'}
            </button>
            <button
              type="button"
              onClick={startReplay}
              disabled={replayLoading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {replayLoading ? 'Loading replay' : 'Replay'}
            </button>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Phase 11</p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-3 py-4 md:px-6">
        {toast ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {toast}
          </div>
        ) : null}
        <RoomSettingsPanel room={room} isOwner={isOwner} onChange={updateSettings} onRegenerateInvite={regenerateInvite} />
        <ParticipantPanel room={room} currentUserId={collaboration.userId} onRoleChange={updateRole} onRemove={removeParticipant} />
        <VersionHistoryPanel
          boardId={roomId}
          userId={collaboration.userId}
          canCreate={currentRole === 'OWNER' || currentRole === 'EDITOR'}
          canRestore={isOwner}
          onRestore={handleRestore}
          onError={setToast}
        />
        {replayMode ? (
          <ReplayPanel
            step={replayStep}
            total={replayOperations.length}
            playing={replayPlaying}
            speed={replaySpeed}
            operation={currentReplayOperation}
            onPlay={() => setReplayPlaying(true)}
            onPause={() => setReplayPlaying(false)}
            onRestart={() => {
              setReplayStep(0);
              setReplayPlaying(false);
            }}
            onNext={() => setReplayStep((current) => Math.min(current + 1, replayOperations.length))}
            onPrevious={() => setReplayStep((current) => Math.max(current - 1, 0))}
            onSpeedChange={setReplaySpeed}
            onStepChange={(step) => setReplayStep(step)}
            onExit={() => void exitReplay()}
          />
        ) : null}
        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <CanvasBoard
            activeTool={activeTool}
            settings={settings}
            roomId={roomId}
            userId={collaboration.userId}
            userName={collaboration.userName}
            initialObjects={restoredBoard ?? collaboration.initialBoard}
            remoteOperation={replayMode ? null : collaboration.remoteOperation}
            remoteCursors={collaboration.remoteCursors}
            comments={collaboration.comments}
            replayMode={replayMode}
            replayObjects={replayObjects}
            boardTitle={boardTitle}
            canExport={canExport}
            onLocalOperation={replayMode ? undefined : collaboration.emitOperation}
            onCursorMove={collaboration.emitCursor}
            onSelectedObjectChange={setSelectedObjectId}
            onJsonExport={exportJson}
            onRecordExport={recordExport}
            onExportError={setToast}
            readOnly={readOnly || replayMode}
            toolbar={
              <Toolbar
                activeTool={activeTool}
                settings={settings}
                disabled={readOnly || replayMode}
                onToolChange={setActiveTool}
                onSettingsChange={setSettings}
              />
            }
          />
          <CollaborationSidebar
            currentUserId={collaboration.userId}
            currentRole={currentRole}
            selectedObjectId={selectedObjectId}
            canSendChat={canSendChat && !replayMode}
            canComment={canComment && !replayMode}
            canGenerateAISummary={canGenerateAISummary && !replayMode}
            chatMessages={collaboration.chatMessages}
            comments={collaboration.comments}
            activityItems={collaboration.activityItems}
            aiSummaries={aiSummaries}
            aiSummaryLoading={aiSummaryLoading}
            aiSummaryError={aiSummaryError}
            onSendChat={collaboration.sendChat}
            onAddComment={collaboration.addComment}
            onResolveComment={collaboration.resolveComment}
            onDeleteComment={collaboration.deleteComment}
            onGenerateAISummary={generateAISummary}
          />
        </div>
      </div>
    </main>
  );
}

export default App;

function ReplayPanel({
  step,
  total,
  playing,
  speed,
  operation,
  onPlay,
  onPause,
  onRestart,
  onNext,
  onPrevious,
  onSpeedChange,
  onStepChange,
  onExit,
}: {
  step: number;
  total: number;
  playing: boolean;
  speed: number;
  operation: ReplayOperation | null;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSpeedChange: (speed: number) => void;
  onStepChange: (step: number) => void;
  onExit: () => void;
}) {
  const objectType = operation?.payload?.type ?? operation?.previousPayload?.type ?? 'object';

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">Replay Mode</p>
          <h2 className="mt-1 text-lg font-semibold text-blue-950">
            Step {step} / {total}
          </h2>
          <p className="mt-1 text-sm text-blue-800">
            {operation
              ? `${operation.userName} ${operation.type.toLowerCase()}d ${objectType} · ${new Date(operation.serverTimestamp).toLocaleTimeString()}`
              : 'Ready to replay the board session'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={playing ? onPause : onPlay} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={onRestart} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700">
            Restart
          </button>
          <button type="button" onClick={onPrevious} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700">
            Previous
          </button>
          <button type="button" onClick={onNext} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700">
            Next
          </button>
          <select
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
          <button type="button" onClick={onExit} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            Exit replay
          </button>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max={total}
        value={step}
        onChange={(event) => onStepChange(Number(event.target.value))}
        className="mt-4 w-full accent-blue-600"
      />
    </section>
  );
}

const roleToDb = (role: 'owner' | 'editor' | 'viewer') => {
  if (role === 'owner') return 'OWNER';
  if (role === 'viewer') return 'VIEWER';
  return 'EDITOR';
};

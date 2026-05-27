import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import CanvasBoard from './components/CanvasBoard';
import Toolbar from './components/Toolbar';
import { getOrCreateIdentity, useRoomCollaboration } from './hooks/useRoomCollaboration';
import { getRoomIdFromPath, navigateToRoom } from './lib/room';
import type { DrawingSettings, Tool } from './types';

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000';

function App() {
  const [roomId, setRoomId] = useState(getRoomIdFromPath());

  useEffect(() => {
    const handleRouteChange = () => setRoomId(getRoomIdFromPath());
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  return roomId ? <RoomPage roomId={roomId} /> : <HomePage />;
}

function HomePage() {
  const [joinValue, setJoinValue] = useState('');
  const [creating, setCreating] = useState(false);

  const createRoom = () => {
    setCreating(true);
    const identity = getOrCreateIdentity();
    const socket = io(socketUrl, { transports: ['websocket'] });

    socket.emit('room:create', identity, (response: { roomId: string }) => {
      socket.disconnect();
      setCreating(false);
      navigateToRoom(response.roomId);
    });
  };

  const joinRoom = () => {
    const trimmed = joinValue.trim();
    const parsed = trimmed.match(/\/room\/([^/?#]+)/)?.[1] ?? trimmed;
    if (parsed) navigateToRoom(parsed);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4 text-slate-950">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-board">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">CollabCanvas</p>
        <h1 className="mt-3 text-3xl font-semibold">Create or join a whiteboard room</h1>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={createRoom}
            disabled={creating}
            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? 'Creating...' : 'Create room'}
          </button>
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
            Join
          </button>
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
  const inviteLink = useMemo(() => `${window.location.origin}/room/${roomId}`, [roomId]);
  const collaboration = useRoomCollaboration(roomId);

  const copyInviteLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white/92 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">CollabCanvas</h1>
            <p className="text-sm text-slate-500">
              Room {roomId} · {collaboration.connected ? 'Connected' : 'Reconnecting'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              {collaboration.participants.length} participant{collaboration.participants.length === 1 ? '' : 's'}
            </div>
            <button
              type="button"
              onClick={copyInviteLink}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {copied ? 'Copied' : 'Copy invite'}
            </button>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Phase 3</p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-3 py-4 md:px-6">
        <CanvasBoard
          activeTool={activeTool}
          settings={settings}
          roomId={roomId}
          userId={collaboration.userId}
          userName={collaboration.userName}
          initialObjects={collaboration.initialBoard}
          remoteOperation={collaboration.remoteOperation}
          remoteCursors={collaboration.remoteCursors}
          onLocalOperation={collaboration.emitOperation}
          onCursorMove={collaboration.emitCursor}
          toolbar={
            <Toolbar
              activeTool={activeTool}
              settings={settings}
              onToolChange={setActiveTool}
              onSettingsChange={setSettings}
            />
          }
        />
      </div>
    </main>
  );
}

export default App;

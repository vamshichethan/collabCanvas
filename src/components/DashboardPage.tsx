import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { navigateToRoom } from '../lib/room';
import type { AuthUser, DashboardBoard, DashboardBoardFilters } from '../types';
import BoardCard from './BoardCard';
import BoardFilters from './BoardFilters';
import BoardSearchBar from './BoardSearchBar';
import CreateBoardModal from './CreateBoardModal';
import EmptyState from './EmptyState';
import InviteSettingsModal from './InviteSettingsModal';
import LoadingSkeleton from './LoadingSkeleton';
import RenameBoardModal from './RenameBoardModal';

type DashboardPageProps = {
  authUser: AuthUser;
  onLogout: () => void;
};

export default function DashboardPage({ authUser, onLogout }: DashboardPageProps) {
  const [boards, setBoards] = useState<DashboardBoard[]>([]);
  const [joinValue, setJoinValue] = useState('');
  const [filters, setFilters] = useState<DashboardBoardFilters>({
    search: '',
    role: 'ALL',
    sort: 'updated',
    includeArchived: false,
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [renameBoard, setRenameBoard] = useState<DashboardBoard | null>(null);
  const [inviteBoard, setInviteBoard] = useState<DashboardBoard | null>(null);
  const [deleteBoard, setDeleteBoard] = useState<DashboardBoard | null>(null);

  const stats = useMemo(
    () => ({
      owned: boards.filter((board) => board.role === 'OWNER').length,
      shared: boards.filter((board) => board.role !== 'OWNER').length,
      publicBoards: boards.filter((board) => board.isPublic).length,
      recent: boards.filter((board) => Date.now() - new Date(board.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 7).length,
    }),
    [boards],
  );

  const loadBoards = async () => {
    setLoading(true);
    try {
      setBoards(await api.listDashboardBoards(filters));
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to load dashboard');
      setBoards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBoards(), 180);
    return () => window.clearTimeout(timer);
  }, [filters.search, filters.role, filters.sort, filters.includeArchived]);

  const joinRoom = () => {
    const trimmed = joinValue.trim();
    const parsed = trimmed.match(/\/room\/([^/?#]+)/)?.[1] ?? trimmed;
    if (parsed) navigateToRoom(parsed);
  };

  const createBoard = async (input: { title: string; description?: string; visibility: 'PUBLIC' | 'PRIVATE' }) => {
    const created = await api.createBoard(input);
    setShowCreate(false);
    navigateToRoom(created.board.id);
  };

  const rename = async (boardId: string, title: string) => {
    await api.updateBoard(boardId, { title });
    setRenameBoard(null);
    await loadBoards();
  };

  const duplicate = async (board: DashboardBoard) => {
    const duplicated = await api.duplicateBoard(board.id);
    navigateToRoom(duplicated.board.id);
  };

  const archive = async (board: DashboardBoard) => {
    await api.archiveBoard(board.id);
    await loadBoards();
  };

  const restore = async (board: DashboardBoard) => {
    await api.restoreArchivedBoard(board.id);
    await loadBoards();
  };

  const pin = async (board: DashboardBoard) => {
    await api.updateBoard(board.id, { pinned: !board.pinned });
    await loadBoards();
  };

  const saveInvite = async (
    roomId: string,
    settings: {
      inviteEnabled?: boolean;
      inviteRole?: 'EDITOR' | 'VIEWER';
      inviteExpiresAt?: string | null;
      visibility?: 'PUBLIC' | 'PRIVATE';
    },
  ) => {
    await api.updateInviteSettings(roomId, settings);
    setInviteBoard(null);
    await loadBoards();
  };

  const regenerateInvite = async (roomId: string) => {
    await api.regenerateInvite(roomId, authUser.id);
    await loadBoards();
  };

  const confirmDelete = async () => {
    if (!deleteBoard) return;
    await api.deleteBoard(deleteBoard.id);
    setDeleteBoard(null);
    await loadBoards();
  };

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-8 text-slate-950">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-board lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">CollabCanvas</p>
            <h1 className="mt-2 text-3xl font-semibold">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Signed in as {authUser.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Create board
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        {toast ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{toast}</div> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Created by you" value={stats.owned} />
          <Stat label="Shared with you" value={stats.shared} />
          <Stat label="Recent boards" value={stats.recent} />
          <Stat label="Public boards" value={stats.publicBoards} />
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row">
          <BoardSearchBar value={filters.search} onChange={(search) => setFilters((current) => ({ ...current, search }))} />
          <BoardFilters filters={filters} onChange={setFilters} />
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
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
            <LoadingSkeleton />
          ) : boards.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState title="No boards found" message="Create a board or adjust the filters." actionLabel="Create board" onAction={() => setShowCreate(true)} />
            </div>
          ) : (
            boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                onOpen={() => navigateToRoom(board.roomId)}
                onRename={setRenameBoard}
                onDuplicate={(item) => void duplicate(item)}
                onArchive={(item) => void archive(item)}
                onRestore={(item) => void restore(item)}
                onDelete={setDeleteBoard}
                onPin={(item) => void pin(item)}
                onInvite={setInviteBoard}
              />
            ))
          )}
        </div>
      </section>

      {showCreate ? <CreateBoardModal onClose={() => setShowCreate(false)} onCreate={createBoard} /> : null}
      {renameBoard ? <RenameBoardModal board={renameBoard} onClose={() => setRenameBoard(null)} onRename={rename} /> : null}
      {inviteBoard ? (
        <InviteSettingsModal board={inviteBoard} onClose={() => setInviteBoard(null)} onSave={saveInvite} onRegenerate={regenerateInvite} />
      ) : null}
      {deleteBoard ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-board">
            <h2 className="text-lg font-semibold text-slate-950">Delete board?</h2>
            <p className="mt-2 text-sm text-slate-500">{deleteBoard.title} will be removed from active dashboards.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteBoard(null)} className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button type="button" onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white">
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

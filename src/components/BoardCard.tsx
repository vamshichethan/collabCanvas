import { Archive, Copy, ExternalLink, MoreHorizontal, Pin, PinOff, RotateCcw, Settings, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DashboardBoard } from '../types';

type BoardCardProps = {
  board: DashboardBoard;
  onOpen: (board: DashboardBoard) => void;
  onRename: (board: DashboardBoard) => void;
  onDuplicate: (board: DashboardBoard) => void;
  onArchive: (board: DashboardBoard) => void;
  onRestore: (board: DashboardBoard) => void;
  onDelete: (board: DashboardBoard) => void;
  onPin: (board: DashboardBoard) => void;
  onInvite: (board: DashboardBoard) => void;
};

export default function BoardCard({
  board,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  onPin,
  onInvite,
}: BoardCardProps) {
  const canOwnerManage = board.role === 'OWNER';
  const canDuplicate = board.role === 'OWNER' || board.role === 'EDITOR';
  const isArchived = board.status === 'ARCHIVED' || board.roomStatus === 'ARCHIVED';

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-board">
      <button type="button" onClick={() => onOpen(board)} className="block w-full text-left">
        <div className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-slate-100">
          {board.thumbnailUrl ? (
            <img src={board.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full grid-cols-4 gap-px bg-slate-200 p-px">
              {Array.from({ length: 16 }).map((_, index) => (
                <div key={index} className="bg-white" />
              ))}
            </div>
          )}
        </div>
      </button>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button type="button" onClick={() => onOpen(board)} className="block truncate text-left text-lg font-semibold text-slate-950">
              {board.title}
            </button>
            <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">{board.description || 'No description'}</p>
          </div>
          <span className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">{board.role}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
          <span>{board.visibility}</span>
          <span className="text-right">{isArchived ? 'ARCHIVED' : board.status}</span>
          <span>{board.activeParticipantCount} participants</span>
          <span className="text-right">{board.lastSequenceNumber} ops</span>
        </div>

        <p className="mt-3 text-xs text-slate-400">Last active {new Date(board.lastActiveAt).toLocaleString()}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <IconButton label="Open" onClick={() => onOpen(board)} icon={<ExternalLink className="h-4 w-4" />} />
          {canOwnerManage ? <IconButton label="Rename" onClick={() => onRename(board)} icon={<MoreHorizontal className="h-4 w-4" />} /> : null}
          {canDuplicate ? <IconButton label="Duplicate" onClick={() => onDuplicate(board)} icon={<Copy className="h-4 w-4" />} /> : null}
          {canOwnerManage ? <IconButton label={board.pinned ? 'Unpin' : 'Pin'} onClick={() => onPin(board)} icon={board.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} /> : null}
          {canOwnerManage ? <IconButton label="Invite" onClick={() => onInvite(board)} icon={<Settings className="h-4 w-4" />} /> : null}
          {canOwnerManage && isArchived ? <IconButton label="Restore" onClick={() => onRestore(board)} icon={<RotateCcw className="h-4 w-4" />} /> : null}
          {canOwnerManage && !isArchived ? <IconButton label="Archive" onClick={() => onArchive(board)} icon={<Archive className="h-4 w-4" />} /> : null}
          {canOwnerManage ? <IconButton label="Delete" onClick={() => onDelete(board)} icon={<Trash2 className="h-4 w-4" />} danger /> : null}
        </div>
      </div>
    </article>
  );
}

function IconButton({ label, icon, danger, onClick }: { label: string; icon: ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={[
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition',
        danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
      ].join(' ')}
    >
      {icon}
    </button>
  );
}

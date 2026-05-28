import { useState, type FormEvent } from 'react';
import type { DashboardBoard } from '../types';

type RenameBoardModalProps = {
  board: DashboardBoard;
  onClose: () => void;
  onRename: (boardId: string, title: string) => Promise<void>;
};

export default function RenameBoardModal({ board, onClose, onRename }: RenameBoardModalProps) {
  const [title, setTitle] = useState(board.title);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    await onRename(board.id, title.trim() || board.title);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-board">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-950">Rename board</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
            Close
          </button>
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-5 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500"
          required
        />
        <button
          type="submit"
          disabled={saving}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save name'}
        </button>
      </form>
    </div>
  );
}

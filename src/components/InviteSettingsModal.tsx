import { useMemo, useState } from 'react';
import type { DashboardBoard } from '../types';

type InviteSettingsModalProps = {
  board: DashboardBoard;
  onClose: () => void;
  onSave: (
    roomId: string,
    settings: {
      inviteEnabled?: boolean;
      inviteRole?: 'EDITOR' | 'VIEWER';
      inviteExpiresAt?: string | null;
      visibility?: 'PUBLIC' | 'PRIVATE';
    },
  ) => Promise<void>;
  onRegenerate: (roomId: string) => Promise<void>;
};

export default function InviteSettingsModal({ board, onClose, onSave, onRegenerate }: InviteSettingsModalProps) {
  const [inviteEnabled, setInviteEnabled] = useState(board.inviteEnabled);
  const [inviteRole, setInviteRole] = useState<'EDITOR' | 'VIEWER'>(board.inviteRole === 'EDITOR' ? 'EDITOR' : 'VIEWER');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>(board.visibility);
  const [expiresAt, setExpiresAt] = useState(board.inviteExpiresAt ? board.inviteExpiresAt.slice(0, 16) : '');
  const [saving, setSaving] = useState(false);
  const inviteLink = useMemo(() => `${window.location.origin}/room/${board.roomId}`, [board.roomId]);

  const save = async () => {
    setSaving(true);
    await onSave(board.roomId, {
      inviteEnabled,
      inviteRole,
      visibility,
      inviteExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-board">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Invite settings</h2>
            <p className="mt-1 text-sm text-slate-500">{board.title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
            Close
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="break-all text-sm font-medium text-slate-700">{inviteLink}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inviteLink)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => onRegenerate(board.roomId)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            >
              Regenerate
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={inviteEnabled} onChange={(event) => setInviteEnabled(event.target.checked)} className="accent-blue-600" />
            Invite link enabled
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Invite role
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as 'EDITOR' | 'VIEWER')}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Visibility
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as 'PUBLIC' | 'PRIVATE')}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none"
            >
              <option value="PRIVATE">Private</option>
              <option value="PUBLIC">Public</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Expiry
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save invite settings'}
        </button>
      </div>
    </div>
  );
}

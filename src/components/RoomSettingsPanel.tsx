import type { DashboardRoom } from '../types';

type RoomSettingsPanelProps = {
  room: DashboardRoom | null;
  isOwner: boolean;
  onChange: (settings: {
    visibility?: 'PUBLIC' | 'PRIVATE';
    allowViewerComments?: boolean;
    allowViewerAISummaries?: boolean;
    allowViewerExports?: boolean;
    lockBoardEditing?: boolean;
  }) => void;
  onRegenerateInvite: () => void;
};

function RoomSettingsPanel({ room, isOwner, onChange, onRegenerateInvite }: RoomSettingsPanelProps) {
  if (!room) return null;

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Room settings</h2>
        <span className="text-xs font-semibold text-slate-400">{room.inviteCode}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          Public
          <input
            type="checkbox"
            checked={room.visibility === 'PUBLIC'}
            disabled={!isOwner}
            onChange={(event) => onChange({ visibility: event.target.checked ? 'PUBLIC' : 'PRIVATE' })}
            className="accent-blue-600"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          Viewer comments
          <input
            type="checkbox"
            checked={room.allowViewerComments}
            disabled={!isOwner}
            onChange={(event) => onChange({ allowViewerComments: event.target.checked })}
            className="accent-blue-600"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          Lock editing
          <input
            type="checkbox"
            checked={room.lockBoardEditing}
            disabled={!isOwner}
            onChange={(event) => onChange({ lockBoardEditing: event.target.checked })}
            className="accent-blue-600"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          Viewer AI
          <input
            type="checkbox"
            checked={room.allowViewerAISummaries}
            disabled={!isOwner}
            onChange={(event) => onChange({ allowViewerAISummaries: event.target.checked })}
            className="accent-blue-600"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          Viewer export
          <input
            type="checkbox"
            checked={room.allowViewerExports}
            disabled={!isOwner}
            onChange={(event) => onChange({ allowViewerExports: event.target.checked })}
            className="accent-blue-600"
          />
        </label>
        <button
          type="button"
          disabled={!isOwner}
          onClick={onRegenerateInvite}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Regenerate invite
        </button>
      </div>
    </aside>
  );
}

export default RoomSettingsPanel;

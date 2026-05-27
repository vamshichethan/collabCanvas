import type { DashboardRoom } from '../types';

type ParticipantPanelProps = {
  room: DashboardRoom | null;
  currentUserId: string;
  onRoleChange: (userId: string, role: 'OWNER' | 'EDITOR' | 'VIEWER') => void;
  onRemove: (userId: string) => void;
};

function ParticipantPanel({ room, currentUserId, onRoleChange, onRemove }: ParticipantPanelProps) {
  const currentParticipant = room?.participants.find((participant) => participant.userId === currentUserId);
  const isOwner = currentParticipant?.role === 'OWNER';

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Participants</h2>
        {currentParticipant ? <RoleBadge role={currentParticipant.role} /> : null}
      </div>
      <div className="mt-3 space-y-2">
        {room?.participants.map((participant) => (
          <div key={participant.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">{participant.user?.name ?? participant.userId}</p>
              <p className="text-xs text-slate-500">{participant.userId}</p>
            </div>
            <div className="flex items-center gap-2">
              {isOwner ? (
                <select
                  value={participant.role}
                  onChange={(event) => onRoleChange(participant.userId, event.target.value as 'OWNER' | 'EDITOR' | 'VIEWER')}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  <option value="OWNER">OWNER</option>
                  <option value="EDITOR">EDITOR</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              ) : (
                <RoleBadge role={participant.role} />
              )}
              {isOwner && participant.userId !== currentUserId ? (
                <button
                  type="button"
                  onClick={() => onRemove(participant.userId)}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function RoleBadge({ role }: { role: 'OWNER' | 'EDITOR' | 'VIEWER' }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
      {role}
    </span>
  );
}

export default ParticipantPanel;

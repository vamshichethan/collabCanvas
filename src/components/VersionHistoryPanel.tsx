import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { BoardVersionRecord, WhiteboardObject } from '../types';

type VersionHistoryPanelProps = {
  boardId: string;
  userId: string;
  canCreate: boolean;
  canRestore: boolean;
  onRestore: (objects: WhiteboardObject[], lastSequenceNumber: number) => void;
  onError: (message: string) => void;
};

function VersionHistoryPanel({ boardId, userId, canCreate, canRestore, onRestore, onError }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<BoardVersionRecord[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const loadVersions = async () => {
    setVersions(await api.getVersions(boardId));
  };

  useEffect(() => {
    void loadVersions();
  }, [boardId]);

  const createVersion = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      await api.createVersion(boardId, trimmed, userId);
    } catch {
      onError('You do not have permission to create versions');
      setLoading(false);
      return;
    }
    setName('');
    await loadVersions();
    setLoading(false);
  };

  const restoreVersion = async (versionId: string) => {
    setLoading(true);
    let restored: Awaited<ReturnType<typeof api.restoreVersion>>;
    try {
      restored = await api.restoreVersion(boardId, versionId, userId);
    } catch {
      onError('Only owners can restore versions');
      setLoading(false);
      return;
    }
    onRestore(restored.board, restored.lastSequenceNumber);
    await loadVersions();
    setLoading(false);
  };

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Version name"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500"
        />
        <button
          type="button"
          onClick={createVersion}
          disabled={loading || !name.trim() || !canCreate}
          className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create version
        </button>
      </div>

      <div className="mt-4 max-h-52 overflow-auto">
        {versions.length === 0 ? (
          <p className="text-sm text-slate-500">No saved versions yet.</p>
        ) : (
          <div className="space-y-2">
            {versions.map((version) => (
              <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{version.name}</p>
                  <p className="text-xs text-slate-500">Sequence {version.sequenceNumber}</p>
                </div>
                <button
                  type="button"
                  onClick={() => restoreVersion(version.id)}
                  disabled={loading || !canRestore}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export default VersionHistoryPanel;

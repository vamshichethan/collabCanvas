import { useState, type FormEvent } from 'react';

type CreateBoardModalProps = {
  onClose: () => void;
  onCreate: (input: { title: string; description?: string; visibility: 'PUBLIC' | 'PRIVATE' }) => Promise<void>;
};

export default function CreateBoardModal({ onClose, onCreate }: CreateBoardModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    await onCreate({ title: title.trim() || 'Untitled Board', description: description.trim(), visibility });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <form onSubmit={submit} className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-board">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Create board</h2>
            <p className="mt-1 text-sm text-slate-500">Start a new room-backed board.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
            Close
          </button>
        </div>
        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500"
            required
          />
        </label>
        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-2 min-h-24 w-full resize-none rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500"
          />
        </label>
        <label className="mt-4 block text-sm font-semibold text-slate-700">
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
        <button
          type="submit"
          disabled={saving}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Creating...' : 'Create board'}
        </button>
      </form>
    </div>
  );
}

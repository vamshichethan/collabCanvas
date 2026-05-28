import type { DashboardBoardFilters } from '../types';

type BoardFiltersProps = {
  filters: DashboardBoardFilters;
  onChange: (filters: DashboardBoardFilters) => void;
};

export default function BoardFilters({ filters, onChange }: BoardFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={filters.role}
        onChange={(event) => onChange({ ...filters, role: event.target.value as DashboardBoardFilters['role'] })}
        className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 outline-none"
      >
        <option value="ALL">All roles</option>
        <option value="OWNER">Owner</option>
        <option value="EDITOR">Editor</option>
        <option value="VIEWER">Viewer</option>
      </select>
      <select
        value={filters.sort}
        onChange={(event) => onChange({ ...filters, sort: event.target.value as DashboardBoardFilters['sort'] })}
        className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 outline-none"
      >
        <option value="updated">Recently updated</option>
        <option value="created">Created date</option>
        <option value="title">Title</option>
      </select>
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={filters.includeArchived}
          onChange={(event) => onChange({ ...filters, includeArchived: event.target.checked })}
          className="accent-blue-600"
        />
        Archived
      </label>
    </div>
  );
}

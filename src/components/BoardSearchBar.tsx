type BoardSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function BoardSearchBar({ value, onChange }: BoardSearchBarProps) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search boards"
      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-500"
    />
  );
}

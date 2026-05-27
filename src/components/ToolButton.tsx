import type { LucideIcon } from 'lucide-react';

type ToolButtonProps = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ToolButton({ icon: Icon, label, active = false, disabled = false, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        'grid h-10 w-10 place-items-center rounded-lg border text-slate-700 transition',
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
        disabled ? 'cursor-not-allowed opacity-45 hover:border-slate-200 hover:bg-white' : '',
      ].join(' ')}
    >
      <Icon size={18} strokeWidth={2.2} />
    </button>
  );
}

export default ToolButton;

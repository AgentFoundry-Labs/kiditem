import type { LucideIcon } from 'lucide-react';

interface LoginFieldProps {
  id: string;
  label: string;
  type: 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  Icon: LucideIcon;
}

export function LoginField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  Icon,
}: LoginFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          strokeWidth={1.8}
        />
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/60 dark:border-[var(--border)] bg-white/60 dark:bg-[var(--surface-sunken)]/80 py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] shadow-inner backdrop-blur-xl transition focus:border-blue-400/60 focus:bg-white/80 dark:focus:bg-[var(--surface)]/80 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
        />
      </div>
    </div>
  );
}

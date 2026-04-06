'use client';

interface PeriodOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options?: PeriodOption[];
  className?: string;
}

export default function PeriodSelector({ value, onChange, options, className = '' }: Props) {
  const baseStyle = `border rounded-lg px-3 py-2 text-sm ${className}`;

  if (options && options.length > 0) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={baseStyle}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      type="month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={baseStyle}
    />
  );
}

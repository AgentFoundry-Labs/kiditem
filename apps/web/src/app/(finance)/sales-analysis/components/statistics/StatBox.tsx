type StatBoxProps = {
  label: string;
  value: number | string;
  unit: string;
};

/** A value rendered as `-` is unavailable, so it carries no unit. */
export function StatBox({ label, value, unit }: StatBoxProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="card-label">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-[var(--text-primary)]">
        {value}
        {value === '-' ? null : (
          <span className="ml-0.5 text-sm text-[var(--text-muted)]">{unit}</span>
        )}
      </div>
    </div>
  );
}

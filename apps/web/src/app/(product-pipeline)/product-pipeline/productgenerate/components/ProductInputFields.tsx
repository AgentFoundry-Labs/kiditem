'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface FieldProps {
  label: string;
  required?: boolean;
  trailing?: string;
  children: ReactNode;
}

export function Field({ label, required, trailing, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="block text-sm font-bold text-[var(--text-primary)]">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
        {trailing && (
          <span className="text-xs font-bold text-[var(--text-tertiary)]">{trailing}</span>
        )}
      </div>
      {children}
    </div>
  );
}

interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

export function SelectField({ value, onChange, options }: SelectFieldProps) {
  const hasCurrentOption = value === '' || options.some((option) => option.value === value);

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 pr-9 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
      >
        {!hasCurrentOption && (
          <option value={value}>{value}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
      />
    </div>
  );
}

export interface ProductSizeFields {
  height: string;
  width: string;
  depth: string;
}

interface SizeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function SizeInput({ label, value, onChange, placeholder }: SizeInputProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-[var(--text-secondary)]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
      />
    </label>
  );
}

export function parseSizeFields(value: string): ProductSizeFields {
  const text = value.trim();
  const pick = (labels: string[]): string => {
    const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const match = text.match(new RegExp(`(?:${escaped.join('|')})\\s*[:：]?\\s*([^,，/\\n]+)`, 'i'));
    return match?.[1]?.trim() ?? '';
  };
  return {
    height: pick(['높이', '세로', 'height', 'h']),
    width: pick(['가로', '너비', 'width', 'w']),
    depth: pick(['폭', '두께', 'depth', 'd']),
  };
}

export function formatSizeFields(fields: ProductSizeFields): string {
  return [
    fields.height.trim() ? `높이: ${fields.height.trim()}` : '',
    fields.width.trim() ? `가로: ${fields.width.trim()}` : '',
    fields.depth.trim() ? `폭: ${fields.depth.trim()}` : '',
  ].filter(Boolean).join('\n');
}

export function splitOptions(value: string, maxOptions: number): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxOptions);
}

export function joinOptions(options: string[]): string {
  return options.join('\n');
}

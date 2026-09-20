'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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

const INPUT_CLASS = 'h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]';

interface ValueInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function TextInput({ value, onChange, placeholder }: ValueInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={INPUT_CLASS}
    />
  );
}

/** 원 단위 금액. 숫자 · 쉼표만 받는다(사방넷 가격 칸과 같은 뜻). */
export function MoneyInput({ value, onChange, placeholder }: ValueInputProps) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d,]/g, ''))}
        placeholder={placeholder}
        className={`${INPUT_CLASS} pr-8 text-right tabular-nums`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">원</span>
    </div>
  );
}

/**
 * 고르기도 되고 직접 적기도 되는 칸. 우리가 쓰던 값을 목록으로 보여 주되 새 값도 그대로 받는다
 * (매입처가 늘면 제조사가 늘어난다).
 *
 * 브라우저 기본 `datalist` 는 몰 화면과 모양이 따로 놀아서 화면 부품으로 직접 그린다 — 다른 고르기 칸
 * (`SelectField`)과 같은 테두리 · 높이 · 화살표를 쓴다.
 */
export function OptionInput({
  value,
  onChange,
  placeholder,
  options,
}: ValueInputProps & { options: readonly string[]; listId?: string }) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // 적는 중에는 적은 글자로 좁혀 보여 주고, 칸을 누르기만 했으면 전부 보여 준다.
  const shown = typing && value.trim()
    ? options.filter((option) => option.toLowerCase().includes(value.trim().toLowerCase()))
    : options;

  return (
    <div className="relative" ref={box}>
      <input
        type="text"
        value={value}
        onChange={(event) => { onChange(event.target.value); setTyping(true); setOpen(true); }}
        onFocus={() => { setTyping(false); setOpen(true); }}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        className={`${INPUT_CLASS} pr-9`}
      />
      <button
        type="button"
        aria-label="고를거리 열기"
        onClick={() => { setTyping(false); setOpen((current) => !current); }}
        className="absolute right-0 top-0 flex h-11 w-9 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <ChevronDown size={16} />
      </button>
      {open && shown.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
          {shown.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => { onChange(option); setOpen(false); setTyping(false); }}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-sunken)] ${
                  option === value ? 'font-bold text-[var(--primary)]' : 'font-medium text-[var(--text-primary)]'
                }`}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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

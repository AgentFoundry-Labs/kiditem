'use client';

import * as Popover from '@radix-ui/react-popover';
import { HexColorInput, HexColorPicker } from 'react-colorful';

interface ColorPickerFieldProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  onClose?: () => void;
}

export function ColorPickerField({ label, value, onChange, onClose }: ColorPickerFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-600 w-28 shrink-0">{label}</span>
      <Popover.Root onOpenChange={(open: boolean) => { if (!open && onClose) onClose(); }}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="w-7 h-7 rounded border border-slate-300 shrink-0"
            style={{ backgroundColor: value }}
            aria-label={`${label} 색상 선택`}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-50 p-3 bg-white rounded-lg shadow-xl border border-slate-200"
            sideOffset={6}
          >
            <HexColorPicker color={value} onChange={onChange} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <HexColorInput
        color={value}
        onChange={onChange}
        prefixed
        className="w-20 px-2 py-1 text-xs border border-slate-200 rounded font-mono"
      />
    </div>
  );
}

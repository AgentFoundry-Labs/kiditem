'use client';

import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white hover:bg-slate-50">
          {value?.from && value?.to
            ? `${format(value.from, 'yyyy.MM.dd')} - ${format(value.to, 'yyyy.MM.dd')}`
            : '날짜 선택'}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-50"
          sideOffset={4}
        >
          <DayPicker
            mode="range"
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

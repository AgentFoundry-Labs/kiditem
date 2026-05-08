import { cn } from '@/lib/utils';
import type { ConfigurableParam } from '../lib/marketplace-types';

interface ConfigurableParamFieldProps {
  param: ConfigurableParam;
  value: unknown;
  onChange: (val: unknown) => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500';

export function ConfigurableParamField({
  param,
  value,
  onChange,
}: ConfigurableParamFieldProps) {
  switch (param.type) {
    case 'cron':
    case 'string':
      return (
        <input
          type="text"
          className={inputClass}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(param.default)}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          className={inputClass}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={String(param.default)}
        />
      );
    case 'boolean':
      return (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors', value ? 'bg-violet-600' : 'bg-slate-200')}
        >
          <span
            className={cn('pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform', value ? 'translate-x-5' : 'translate-x-0')}
          />
        </button>
      );
    case 'select':
      return (
        <select
          className={inputClass}
          value={value == null ? String(param.default) : String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {param.options?.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          type="text"
          className={inputClass}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

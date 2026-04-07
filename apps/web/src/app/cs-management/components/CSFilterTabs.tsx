'use client';

interface StatusTab {
  key: string;
  label: string;
}

interface Props {
  statusTabs: StatusTab[];
  filter: string;
  onChange: (key: string) => void;
}

export function CSFilterTabs({ statusTabs, filter, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {statusTabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === tab.key
              ? 'bg-purple-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

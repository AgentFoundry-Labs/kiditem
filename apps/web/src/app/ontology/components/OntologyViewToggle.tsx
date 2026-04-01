'use client';

import { Network, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  viewMode: 'graph' | 'list';
  onChange: (mode: 'graph' | 'list') => void;
}

export function OntologyViewToggle({ viewMode, onChange }: Props) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChange('graph')}
        className={cn(
          'px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5',
          viewMode === 'graph'
            ? 'bg-gray-900 text-white'
            : 'bg-white border border-gray-200 text-gray-700',
        )}
      >
        <Network className="w-4 h-4" /> 그래프
      </button>
      <button
        onClick={() => onChange('list')}
        className={cn(
          'px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5',
          viewMode === 'list'
            ? 'bg-gray-900 text-white'
            : 'bg-white border border-gray-200 text-gray-700',
        )}
      >
        <List className="w-4 h-4" /> 목록
      </button>
    </div>
  );
}

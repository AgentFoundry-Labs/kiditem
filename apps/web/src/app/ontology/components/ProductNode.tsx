'use client';

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

const gradeColor: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-yellow-100 text-yellow-700',
};

function ProductNode({ data }: NodeProps) {
  return (
    <div className="w-[160px] bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-gray-300" />
      <div className="flex items-center gap-2">
        {data.thumbnailUrl ? (
          <img src={data.thumbnailUrl} alt="" className="w-6 h-6 rounded object-cover" />
        ) : (
          <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center">
            <Package className="w-3 h-3 text-gray-400" />
          </div>
        )}
        <span className="text-xs text-gray-800 truncate flex-1">{data.label}</span>
        {data.grade && (
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', gradeColor[data.grade] || 'bg-gray-100 text-gray-500')}>
            {data.grade}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(ProductNode);

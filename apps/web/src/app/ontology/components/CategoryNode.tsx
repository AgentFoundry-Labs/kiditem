'use client';

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Layers } from 'lucide-react';

function CategoryNode({ data }: NodeProps) {
  return (
    <div className="w-[200px] bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-gray-300" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded bg-violet-100 flex items-center justify-center">
          <Layers className="w-3.5 h-3.5 text-violet-600" />
        </div>
        <span className="text-sm font-medium text-gray-900 truncate">{data.label}</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span>{data.productCount}개 상품</span>
        <span>·</span>
        <span>{data.brandCount}개 브랜드</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-violet-400" />
    </div>
  );
}

export default memo(CategoryNode);

'use client';

import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Tag, ChevronRight } from 'lucide-react';

function BrandNode({ data }: NodeProps) {
  const handleClick = useCallback(() => {
    data.onNodeClick?.(data);
  }, [data]);

  return (
    <div
      className="w-[180px] bg-white border border-gray-200 rounded-lg p-3 shadow-sm cursor-pointer hover:border-blue-300 transition-colors"
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-300" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
          <Tag className="w-3 h-3 text-blue-600" />
        </div>
        <span className="text-sm font-medium text-gray-800 truncate flex-1">{data.label}</span>
        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
      </div>
      <div className="text-[11px] text-gray-500">
        {data.productCount}개 상품
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-400" />
    </div>
  );
}

export default memo(BrandNode);

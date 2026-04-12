'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface TagEditorProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export default function TagEditor({ tags, onTagsChange }: TagEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState('');

  const handleAdd = () => {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed]);
    }
    setNewTag('');
    setIsAdding(false);
  };

  const handleRemove = (index: number) => {
    onTagsChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setNewTag('');
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-slate-700">태그</label>
      <div className="flex gap-2 flex-wrap">
        {tags.map((tag, index) => (
          <span
            key={`tag-${index}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-full transition-colors group"
          >
            <span>#{tag}</span>
            <button
              onClick={() => handleRemove(index)}
              className="text-slate-400 hover:text-red-500 transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        {isAdding ? (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-white border-2 border-emerald-400 rounded-full">
            <span className="text-sm text-slate-400">#</span>
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleAdd}
              autoFocus
              className="w-20 text-sm outline-none bg-transparent"
              placeholder="태그 입력"
            />
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-dashed border-slate-300 hover:border-emerald-400 text-slate-400 hover:text-emerald-500 text-sm rounded-full transition-colors"
          >
            <Plus size={12} />
            <span>추가</span>
          </button>
        )}
      </div>
    </div>
  );
}

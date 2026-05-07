'use client';

import {
  Image as ImageIcon,
  Layers,
  List,
  Megaphone,
  Palette,
  Shapes,
  Sparkles,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type EditorToolId = 'pages' | 'text' | 'image' | 'ai' | 'ads' | 'shape' | 'layers' | 'color';

const TOOL_ITEMS = [
  { id: 'pages', label: '페이지', icon: List },
  { id: 'text', label: '텍스트', icon: Type },
  { id: 'image', label: '사진', icon: ImageIcon },
  { id: 'ai', label: 'AI 생성', icon: Sparkles },
  { id: 'ads', label: '광고 소재', icon: Megaphone, badge: 'beta' },
  { id: 'shape', label: '도형', icon: Shapes },
  { id: 'layers', label: '레이어', icon: Layers },
  { id: 'color', label: '색상', icon: Palette },
] satisfies Array<{ id: EditorToolId; label: string; icon: typeof List; badge?: string }>;

interface EditorToolRailProps {
  activeTool: EditorToolId;
  onSelect: (tool: EditorToolId) => void;
}

export default function EditorToolRail({ activeTool, onSelect }: EditorToolRailProps) {
  return (
    <nav className="flex h-full w-[72px] shrink-0 flex-col items-stretch border-r border-slate-200 bg-white">
      {TOOL_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeTool;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={active}
            className={cn(
              'relative flex h-[72px] flex-col items-center justify-center gap-1.5 text-[11px] font-semibold transition-colors',
              active
                ? 'bg-slate-100 text-slate-950'
                : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950',
            )}
            title={item.label}
          >
            <span className="relative">
              <Icon size={21} strokeWidth={2.1} />
              {item.badge && (
                <span className="absolute -right-5 -top-2 rounded bg-violet-500 px-1 py-0.5 text-[8px] font-black leading-none text-white">
                  {item.badge}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

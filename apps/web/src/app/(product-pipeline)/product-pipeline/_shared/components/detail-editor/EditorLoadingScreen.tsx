'use client';

import { Loader2 } from 'lucide-react';

export default function EditorLoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-[#F5F7F8]">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Loader2 size={32} className="animate-spin" />
        <p className="text-sm font-medium">에디터를 준비하고 있습니다...</p>
      </div>
    </div>
  );
}

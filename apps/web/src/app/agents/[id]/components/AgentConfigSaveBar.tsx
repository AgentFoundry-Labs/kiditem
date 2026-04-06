'use client';

import { Loader2, Save } from 'lucide-react';

interface AgentConfigSaveBarProps {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function AgentConfigSaveBar({ saving, onSave, onCancel }: AgentConfigSaveBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="flex items-center justify-end gap-2 px-4 sm:px-8 py-3">
        <span className="text-sm text-slate-500 mr-auto">저장되지 않은 변경사항이 있습니다.</span>
        <button
          className="px-4 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          onClick={onCancel}
          disabled={saving}
        >
          취소
        </button>
        <button
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}

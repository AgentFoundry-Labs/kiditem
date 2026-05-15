import { ImageIcon, Loader2, Wand2, Zap, type LucideIcon } from 'lucide-react';

interface ActionItem {
  icon: LucideIcon;
  label: string;
  count: number;
  color: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  desc: string;
}

interface AiActionCenterProps {
  unclassifiedWithImageCount: number;
  needsRegenCount: number;
  noImageCount: number;
  batchAnalyzing: boolean;
  editJobsPending: boolean;
  onClassify: () => void;
  onEdit: () => void;
  onShowNoImage: () => void;
}

export function AiActionCenter({
  unclassifiedWithImageCount,
  needsRegenCount,
  noImageCount,
  batchAnalyzing,
  editJobsPending,
  onClassify,
  onEdit,
  onShowNoImage,
}: AiActionCenterProps) {
  const actions: ActionItem[] = [
    {
      icon: Zap,
      label: 'AI 분류',
      count: unclassifiedWithImageCount,
      color: '#3182f6',
      disabled: unclassifiedWithImageCount === 0 || batchAnalyzing,
      loading: false,
      onClick: onClassify,
      desc: '이미지 있는 전체',
    },
    {
      icon: Wand2,
      label: 'AI 편집',
      count: needsRegenCount,
      color: '#7048e8',
      disabled: needsRegenCount === 0 || editJobsPending,
      loading: editJobsPending,
      onClick: onEdit,
      desc: '개선 필요 상품 편집',
    },
    {
      icon: ImageIcon,
      label: '이미지 등록 필요',
      count: noImageCount,
      color: '#f59e0b',
      disabled: noImageCount === 0,
      loading: false,
      onClick: onShowNoImage,
      desc: '수동 업로드',
    },
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: 'var(--thumb-card-bg)',
        boxShadow: 'var(--thumb-shadow-md)',
        border: 'none',
      }}
    >
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={a.onClick}
          disabled={a.disabled}
          className="action-btn flex-1 w-full flex items-center gap-3 px-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed relative"
          style={{
            background: a.disabled
              ? 'var(--thumb-surface-sunken)'
              : `linear-gradient(135deg, ${a.color}18, ${a.color}06)`,
            borderBottom:
              i < actions.length - 1 ? '1px solid var(--thumb-border-subtle)' : 'none',
          }}
          onMouseEnter={(e) => {
            if (!a.disabled)
              e.currentTarget.style.background = `linear-gradient(135deg, ${a.color}30, ${a.color}15)`;
          }}
          onMouseLeave={(e) => {
            if (!a.disabled)
              e.currentTarget.style.background = `linear-gradient(135deg, ${a.color}18, ${a.color}06)`;
          }}
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md"
            style={{
              background: a.disabled
                ? 'var(--border)'
                : `linear-gradient(135deg, ${a.color}, ${a.color}cc)`,
            }}
          >
            {a.loading ? (
              <Loader2 size={20} className="animate-spin text-white" />
            ) : (
              <a.icon size={20} className="text-white" />
            )}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div
              className="text-[14px] font-black truncate"
              style={{ color: a.disabled ? 'var(--thumb-text-quaternary)' : a.color }}
            >
              {a.label}
            </div>
            <div className="text-[11px] font-medium" style={{ color: 'var(--thumb-text-tertiary)' }}>
              {a.desc}
            </div>
          </div>
          <span
            className="text-[24px] font-black tabular-nums shrink-0"
            style={{ color: a.disabled ? 'var(--thumb-text-quaternary)' : a.color }}
          >
            {a.count}
          </span>
        </button>
      ))}
    </div>
  );
}

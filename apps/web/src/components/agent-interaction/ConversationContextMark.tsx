import { Megaphone, PackageSearch, Search, Sparkles, Store, Warehouse } from 'lucide-react';
import { conversationContextForLabel } from './conversation-context.catalog';

const sizeClasses = {
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-7 w-7 text-xs',
  lg: 'h-10 w-10 text-base',
} as const;

const markIcons = {
  sparkles: Sparkles,
  search: Search,
  'package-search': PackageSearch,
  warehouse: Warehouse,
  store: Store,
  megaphone: Megaphone,
} as const;

/** A compact, context-specific mark shared by the conversation tree and message lane. */
export function ConversationContextMark({
  contextLabel,
  size = 'sm',
  testId,
  toneClassName,
}: {
  contextLabel: string;
  size?: keyof typeof sizeClasses;
  testId?: string;
  toneClassName?: string;
}) {
  const context = conversationContextForLabel(contextLabel);
  const key = context.key ?? 'general';
  const Icon = markIcons[context.mark.icon];

  return (
    <span
      aria-hidden="true"
      data-context-mark={key}
      data-testid={testId ?? `conversation-context-mark-${key}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeClasses[size]} ${toneClassName ?? context.mark.toneClassName}`}
    >
      <Icon size={size === 'lg' ? 18 : 14} />
    </span>
  );
}

import type { RegistrationAccountState } from '@kiditem/shared/sales-product';
import { cn } from '@/lib/utils';
import {
  REGISTRATION_TONE_CLASS,
  productRegistrationSummary,
  registrationBadges,
  type RegistrationTone,
} from '../registration-account-state';

type BadgeAccount = Pick<RegistrationAccountState, 'state' | 'soldOut' | 'changedSinceRegistration'>;

type RegistrationStateBadgeProps =
  | { account: BadgeAccount; accounts?: never; className?: string }
  | { accounts: readonly (BadgeAccount & Partial<Pick<RegistrationAccountState, 'channelAccountName' | 'channel'>>)[]; account?: never; className?: string };

function Chip({ label, tone, title }: { label: string; tone: RegistrationTone; title?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        REGISTRATION_TONE_CLASS[tone],
      )}
      title={title}
    >
      {label}
    </span>
  );
}

/**
 * 몰 등록 상태 배지 하나. `account` 면 그 계정의 상태 · 품절 · 변경됨 칩을, `accounts` 면 상품 요약 칩 하나를
 * 그린다(마우스를 올리면 계정별 줄). 모든 화면이 이 배지 하나를 쓴다(KID-320).
 */
export function RegistrationStateBadge(props: RegistrationStateBadgeProps) {
  if (props.account) {
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-1', props.className)}>
        {registrationBadges(props.account).map((badge) => (
          <Chip key={badge.key} label={badge.label} tone={badge.tone} />
        ))}
      </span>
    );
  }
  const summary = productRegistrationSummary(props.accounts);
  const title = props.accounts
    .map((account) => {
      const name = account.channelAccountName ?? account.channel ?? '몰 계정';
      return `${name}: ${registrationBadges(account).map((badge) => badge.label).join(' · ')}`;
    })
    .join('\n');
  return (
    <span className={cn('inline-flex items-center', props.className)}>
      <Chip label={summary.label} tone={summary.tone} title={title || undefined} />
    </span>
  );
}

'use client';

import { cn } from '@/lib/utils';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import { MALL_PUBLISH_ADAPTERS } from '../../_shared/adapters';
import { mallAccentClass, mallLogoPath, mallMonogram } from '../../_shared/mall-presentation';

/**
 * 상품등록 보드.
 *
 * 한 눈에 답해야 하는 질문은 하나다 — **지금 어느 몰로 상품을 보낼 수 있는가.**
 * 그래서 로고와 몰 이름, 그리고 불 하나만 둔다. 숫자도 설명도 여기서는 방해다.
 *
 * 초록은 '보낼 수 있다'이고, 빨강은 '아직 아니다'이다. 둘을 가르는 것은 두 가지가
 * 모두 있느냐다: 등록 경로(어댑터)와 연결된 계정. 어느 한쪽만 있으면 눌러도 안
 * 되므로 초록으로 칠하지 않는다.
 */
export interface MallRegisterTarget {
  mallKey: string;
  mallName: string;
  ready: boolean;
  reason: string;
}

export function mallRegisterTargets(
  channels: readonly MallChannelSummary[],
): MallRegisterTarget[] {
  const byKey = new Map(channels.map((channel) => [channel.mallKey, channel]));
  return MALL_PUBLISH_ADAPTERS.map((adapter) => {
    const channel = byKey.get(adapter.mallKey);
    if (!channel) {
      return {
        mallKey: adapter.mallKey,
        mallName: adapter.mallName,
        ready: false,
        reason: '연결된 계정이 없습니다.',
      };
    }
    return {
      mallKey: adapter.mallKey,
      mallName: channel.mallName,
      ready: true,
      reason: '상품등록 폼을 채울 수 있습니다.',
    };
  });
}

export function MallRegisterBoard({ channels }: { channels: readonly MallChannelSummary[] }) {
  const targets = mallRegisterTargets(channels);
  if (targets.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="section-title">
        상품등록
        <span className="ml-2 text-xs font-normal text-slate-400">
          초록은 보낼 수 있는 몰입니다
        </span>
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {targets.map((target) => (
          <article
            key={target.mallKey}
            title={target.reason}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300"
          >
            {mallLogoPath(target.mallKey) ? (
              // eslint-disable-next-line @next/next/no-img-element -- public 정적 파일
              <img
                src={mallLogoPath(target.mallKey) as string}
                alt=""
                className="h-8 w-8 flex-none rounded-lg border border-slate-200 bg-white object-contain p-1"
              />
            ) : (
              <span
                aria-hidden
                className={cn(
                  'flex h-8 w-8 flex-none items-center justify-center rounded-lg text-xs font-bold',
                  mallAccentClass(target.mallKey),
                )}
              >
                {mallMonogram(target.mallName)}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
              {target.mallName}
            </span>
            <span
              aria-label={target.ready ? '등록 가능' : '등록 불가'}
              className={cn(
                'h-2.5 w-2.5 flex-none rounded-full',
                target.ready ? 'bg-green-500' : 'bg-red-500',
              )}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

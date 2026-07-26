'use client';

import ChannelAvailability from './ChannelAvailability';

export function RocketInventoryWorkspace() {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Rocket도 채널 계정으로 계산합니다. 이 화면에서는 Sellpia 현재고를 수정하지 않습니다.
      </div>
      <ChannelAvailability />
    </section>
  );
}

'use client';

import { useMallAgentLoop, useMallAgentLoopRunner } from '@/hooks/use-mall-agent-loop';

/**
 * 쇼핑몰 에이전트 자동 운전 — 운영자가 시작하면 이 탭이 열려 있는 동안 어느 화면에서든 고리가 돈다.
 *
 * 앱을 열었을 때는 꺼져 있고 러너를 아예 붙이지 않는다(질의도 타이머도 만들지 않는다).
 * 운영자가 쇼핑몰 홈에서 시작해야 러너가 붙어 로그인 확인과 주문수집을 한 바퀴씩 돌린다.
 * 되돌리기 어려운 일은 하지 않는다 — 전송 · 제출 · 삭제는 사람이 그 화면에서 누른다.
 */
export function MallAgentLoopProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const { settings } = useMallAgentLoop();
  return (
    <>
      {enabled && settings.enabled ? <MallAgentLoopRunner /> : null}
      {children}
    </>
  );
}

function MallAgentLoopRunner() {
  useMallAgentLoopRunner();
  return null;
}

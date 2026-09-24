import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PipeConfirmChannel } from '@/hooks/use-confirm-report';
import type { ConfirmReportStatus } from '@/lib/agent-org/confirm-report-api';
import { buildPipeSnapshot, type PipeInputs } from '@/lib/agent-org/pipe-model';
import { AgentOrgView } from './AgentOrgView';

const NOW = Date.parse('2026-09-13T06:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function snapshot(overrides: Partial<PipeInputs> = {}) {
  return buildPipeSnapshot({
    now: NOW,
    alerts: {
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          attemptId: null,
          status: 'RESOLVED',
          type: 'source_failure',
          title: '쿠팡 키워드 순위 수집 실패',
          message: null,
          targetType: null,
          targetId: null,
          sourceType: 'coupang_keyword_serp',
          href: '/rank-tracking',
          isRead: true,
          createdAt: ago(40),
          updatedAt: ago(12),
        },
      ],
      failed: false,
    },
    malls: {
      data: [
        { key: 'gs-shop', name: 'GS샵', enabled: true },
        { key: 'icecream-mall', name: '아이스크림몰', enabled: true },
      ],
      failed: false,
    },
    collectionStatus: { data: null, failed: false },
    confirm: { data: null, failed: false },
    loginBlocks: [{ mallKey: 'gs-shop', kind: 'login', reason: '비밀번호 거부', at: NOW - 60_000 }],
    ...overrides,
  });
}

describe('AgentOrgView', () => {
  it('⭐ 다이어그램에 13단계와 주문이 박스로 서고, 아래에 확인 필요와 실시간 기록이 있다', () => {
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    expect(screen.getByRole('region', { name: 'Agent Org 파이프라인' })).toBeInTheDocument();
    // 상세페이지 · 썸네일은 상품등록 박스 안에 함께 담긴다.
    // 박스 이름은 이름표가, 아이콘 아래 제목은 그 박스가 하는 일을 말한다.
    for (const title of ['키워드 수집', 'SNS 트렌드', '급상승 탐지', '경쟁 추적', '후보 리스트', '공급처 찾기', 'AI 선별', '최종 선별', '상품등록', '몰별 전송', '주문 흐름', '재고 동기화', '고객 응대', '숏폼 영상', '블로그 글', '광고 운영']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    const register = screen.getByRole('link', { name: '10단계 상품등록 열기' });
    for (const tile of ['상세페이지', '썸네일', '쿠팡 WING']) {
      expect(within(register).getByText(tile)).toBeInTheDocument();
    }
    expect(screen.queryByRole('heading', { name: '상세·썸네일' })).toBeNull();
    for (const section of ['확인 필요', '실시간 기록']) {
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument();
    }
  });

  it('바깥 시스템(쇼핑몰 · 셀피아 · 텔레그램)과 사람 확인 · 알림 박스가 선다', () => {
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    for (const name of ['쇼핑몰 연결 상태 열기', '셀피아 재고 열기', '확인 필요 목록으로', '알림 열기']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('region', { name: '텔레그램 컨펌 보고' })).toBeInTheDocument();
    const malls = screen.getByRole('link', { name: '쇼핑몰 연결 상태 열기' });
    expect(within(malls).getByText('2곳')).toBeInTheDocument();
    expect(within(malls).getAllByRole('listitem')).toHaveLength(2);
    // 로그인이 막힌 몰이 앞에 선다.
    expect(within(malls).getAllByRole('listitem')[0]).toHaveAttribute('title', 'GS샵 · 로그인 필요');
  });

  it('⭐ 단계는 맡은 에이전트 틀에 묶이고, 바깥 서비스는 로고로 보인다', () => {
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    const diagram = screen.getByRole('region', { name: 'Agent Org 파이프라인' });
    for (const label of ['분석 에이전트', '소싱 에이전트', '사장님 컨펌', '상품 에이전트', '마케팅 에이전트', '쇼핑몰 에이전트', '주문 에이전트', '재고 에이전트', 'CS 에이전트']) {
      expect(within(diagram).getByText(label)).toBeInTheDocument();
    }
    const supplier = screen.getByRole('link', { name: '6단계 1688·타오바오 열기' });
    for (const brand of ['1688', '타오바오', '알리바바']) {
      expect(within(supplier).getByTitle(brand)).toBeInTheDocument();
    }
  });

  /** 빈칸이 "일이 없다"로 읽히면 안 된다. 셀 곳이 없으면 그렇다고, 왜인지까지 적는다. */
  it('⭐ 셀 곳이 없는 단계는 숫자 대신 데이터 없음과 그 이유를 적는다', () => {
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    const shortlist = screen.getByRole('link', { name: '7단계 AI 선별 열기' });
    expect(within(shortlist).getByText('데이터 없음')).toBeInTheDocument();
    expect(within(shortlist).getByText(/환율·배송비·몰 수수료/)).toBeInTheDocument();
    expect(within(shortlist).getByText('모름')).toBeInTheDocument();
    // 셀 곳이 없는 단계는 점선 테두리 — 정상처럼 보이지 않게.
    expect(shortlist.className).toContain('border-dashed');
  });

  it('⭐ 아직 화면이 없는 릴스 · 블로그는 누를 곳 없이 준비 중으로 서고, 광고 마케팅은 광고 화면으로 간다', () => {
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    for (const name of ['14단계 릴스 제작 · 준비 중', '15단계 블로그 제작 · 준비 중']) {
      const box = screen.getByRole('group', { name });
      expect(within(box).getByText('준비 중')).toBeInTheDocument();
      expect(within(box).queryByRole('link')).toBeNull();
    }
    expect(screen.getByRole('link', { name: '16단계 광고 마케팅 열기' })).toHaveAttribute('href', '/ad-ops');
  });

  it('받은 건수는 건수로, 단계를 누르면 그 단계 화면으로 간다', () => {
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    const keyword = screen.getByRole('link', { name: '1단계 실시간 키워드 열기' });
    expect(keyword).toHaveAttribute('href', '/sourcing-ai/market');
    const malls = screen.getByRole('link', { name: '11단계 쇼핑몰 등록 열기' });
    expect(malls).toHaveAttribute('href', '/mall-listings');
    expect(within(malls).getByText('데이터 없음')).toBeInTheDocument();
  });

  it('⭐ 같은 몰 로그인 막힘은 확인 필요에 한 장이고, 몰 연결 줄에도 같은 사실이 선다', () => {
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    const inbox = screen.getByRole('heading', { name: '확인 필요' }).closest('section')!;
    expect(within(inbox).getAllByRole('link')).toHaveLength(1);
    expect(within(inbox).getByText('GS샵 · 자동 멈춤, 직접 로그인')).toBeInTheDocument();
    expect(within(inbox).queryByText(/기록 \d+/)).toBeNull();
    expect(screen.getByText('몰 연결 2곳')).toBeInTheDocument();
  });

  it('⭐ 캔버스를 버튼으로 줄이고 키우고 원래 크기로 돌린다', async () => {
    const user = userEvent.setup();
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    const toolbar = screen.getByRole('toolbar', { name: '캔버스 크기' });
    const percent = () => Number(within(toolbar).getByRole('button', { name: '원래 크기로' }).textContent!.replace('%', ''));

    const start = percent();
    await user.click(within(toolbar).getByRole('button', { name: '확대' }));
    expect(percent()).toBeGreaterThan(start);
    await user.click(within(toolbar).getByRole('button', { name: '축소' }));
    await user.click(within(toolbar).getByRole('button', { name: '축소' }));
    expect(percent()).toBeLessThan(start);
    await user.click(within(toolbar).getByRole('button', { name: '원래 크기로' }));
    expect(percent()).toBe(100);
    expect(within(toolbar).getByRole('button', { name: '화면에 맞춤' })).toBeInTheDocument();
  });

  it('키보드로도 확대 · 축소한다', async () => {
    const user = userEvent.setup();
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    const toolbar = screen.getByRole('toolbar', { name: '캔버스 크기' });
    const percent = () => Number(within(toolbar).getByRole('button', { name: '원래 크기로' }).textContent!.replace('%', ''));
    const canvas = screen.getByRole('application');
    const start = percent();
    canvas.focus();
    await user.keyboard('+');
    expect(percent()).toBeGreaterThan(start);
    await user.keyboard('-');
    expect(percent()).toBe(start);
  });

  it('실시간 연결 상태를 그대로 말한다', () => {
    const { rerender } = render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    const activity = () => screen.getByRole('region', { name: '실시간 활동' });
    expect(within(activity()).getByText('LIVE')).toBeInTheDocument();
    rerender(<AgentOrgView snapshot={snapshot()} connection="disconnected" now={NOW} />);
    expect(within(activity()).getByText('OFFLINE')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('실시간 끊김')).toBeInTheDocument();
  });

  it('⭐ 옛 Agent OS 틀 — 가운데 파이프라인, 왼쪽 에이전트, 오른쪽 실시간 활동, 아래 운영 요약', () => {
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    expect(screen.getByRole('region', { name: 'Agent Org 파이프라인' })).toBeInTheDocument();
    const agents = screen.getByRole('region', { name: '에이전트 목록' });
    expect(within(agents).getAllByRole('button', { pressed: false })).toHaveLength(9);
    expect(within(screen.getByRole('region', { name: '실시간 활동' })).getByRole('heading', { name: '확인 필요' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '운영 요약' })).toBeInTheDocument();
  });

  it('⭐ 에이전트를 고르면 제목이 그 에이전트가 되고, 뒤로 가면 전체로 돌아온다', async () => {
    const user = userEvent.setup();
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    const agents = screen.getByRole('region', { name: '에이전트 목록' });
    await user.click(within(agents).getByRole('button', { name: /주문 에이전트/ }));

    expect(screen.getByRole('heading', { level: 1, name: '주문 에이전트' })).toBeInTheDocument();
    expect(within(agents).getByRole('button', { name: /주문 에이전트/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '전체 파이프라인 보기' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Org' })).toBeInTheDocument();
  });

  it('양옆 패널은 접었다 펼 수 있다', async () => {
    const user = userEvent.setup();
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    await user.click(screen.getByRole('button', { name: '에이전트 목록 접기' }));
    expect(screen.queryByRole('region', { name: '에이전트 목록' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '에이전트 목록 펼치기' }));
    expect(screen.getByRole('region', { name: '에이전트 목록' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '실시간 활동 접기' }));
    expect(screen.queryByRole('region', { name: '실시간 활동' })).toBeNull();
    expect(screen.getByRole('button', { name: '실시간 활동 펼치기' })).toHaveTextContent('LIVE · 1');
  });

  it('⭐ 아래 운영 요약은 이번 달 매출 · 영업이익 · ROAS · CTR 을 적고, 모르면 지어내지 않는다', () => {
    const business = {
      sales: {
        today: { revenue: 0, orders: 0, collectedOrders: 0, missingDateCount: 0 },
        monthly: { revenue: 94_400_000, profit: 9_320_000, adRate: 1.3, prevRevenue: 0, prevProfit: 1_000_000, revenueChange: 12.5, profitChange: -3.2, prevAdRate: 0 },
        topProducts: [],
        monthlyTrend: [],
      },
      ad: { monthly: { roas: 473.2, ctr: 0.29, adRevenue: 0, totalAdSpend: 1_230_000, prevRoas: 0, prevCtr: 0, prevAdRevenue: 0, prevTotalAdSpend: 0 } },
      salesFailed: false,
      adFailed: false,
    } as unknown as NonNullable<Parameters<typeof AgentOrgView>[0]['business']>;
    const { rerender } = render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} business={business} />);
    const summary = () => screen.getByRole('region', { name: '운영 요약' });
    expect(within(summary()).getByText('9,440만')).toBeInTheDocument();
    expect(within(summary()).getByText('+12.5%')).toBeInTheDocument();
    expect(within(summary()).getByText('932만')).toBeInTheDocument();
    expect(within(summary()).getByText('473%')).toBeInTheDocument();
    expect(within(summary()).getByText('0.29%')).toBeInTheDocument();

    rerender(
      <AgentOrgView
        snapshot={snapshot()}
        connection="connected"
        now={NOW}
        business={{ sales: null, ad: null, salesFailed: true, adFailed: false }}
      />,
    );
    expect(within(summary()).getAllByText('불러오지 못함')).toHaveLength(2);
    expect(within(summary()).getAllByText('—')).toHaveLength(2);
  });

  it('실시간 기록은 멈춰 두고 읽을 수 있다', async () => {
    const user = userEvent.setup();
    const first = snapshot();
    const { rerender } = render(<AgentOrgView snapshot={first} connection="connected" now={NOW} />);
    await user.click(screen.getByRole('button', { name: '멈춤' }));
    const feed = screen.getByRole('heading', { name: '실시간 기록' }).closest('section')!;
    const before = within(feed).getAllByRole('listitem').length;

    rerender(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    expect(within(feed).getAllByRole('listitem')).toHaveLength(before);
    expect(screen.getByRole('button', { name: '다시 흐르기' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('몰 목록을 못 받았으면 몰 연결 수를 지어내지 않는다', () => {
    render(<AgentOrgView snapshot={snapshot({ malls: { data: null, failed: true } })} connection="connected" now={NOW} />);
    expect(screen.getByText('몰 연결 데이터 없음')).toBeInTheDocument();
  });
});

function channel(status: Partial<ConfirmReportStatus> | null, overrides: Partial<PipeConfirmChannel> = {}): PipeConfirmChannel {
  return {
    status: status === null
      ? null
      : {
          channel: 'telegram',
          configured: true,
          chatConfigured: true,
          listening: true,
          botUsername: 'kiditem_confirm_bot',
          setupChatId: null,
          lastReport: { sentAt: ago(12), runId: 'run-1', itemCount: 8 },
          candidates: { runId: 'run-1', generatedAt: ago(90), total: 12, pending: 5, approved: 6, rejected: 1 },
          ...status,
        },
    failed: false,
    sending: false,
    send: vi.fn(),
    ...overrides,
  };
}

describe('사장님 컨펌 텔레그램 칸', () => {
  it('⭐ 다 이어졌으면 결정 수와 지금 보고 보내기를 두고, 누르면 보낸다', async () => {
    const confirm = channel({});
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} confirm={confirm} />);
    const box = screen.getByRole('region', { name: '텔레그램 컨펌 보고' });
    expect(within(box).getByText('@kiditem_confirm_bot')).toBeInTheDocument();
    expect(within(box).getByText('답장 받는 중')).toBeInTheDocument();
    expect(within(box).getByText('대기').nextSibling).toHaveTextContent('5');
    expect(within(box).getByText(/마지막 보고 .* · 8개/)).toBeInTheDocument();

    await userEvent.click(within(box).getByRole('button', { name: '지금 보고 보내기' }));
    expect(confirm.send).toHaveBeenCalledTimes(1);
  });

  it('기다리는 후보가 없거나 보내는 중이면 버튼이 잠긴다', () => {
    const { rerender } = render(
      <AgentOrgView
        snapshot={snapshot()}
        connection="connected"
        now={NOW}
        confirm={channel({ candidates: { runId: 'run-1', generatedAt: ago(90), total: 3, pending: 0, approved: 3, rejected: 0 } })}
      />,
    );
    expect(screen.getByRole('button', { name: '기다리는 후보 없음' })).toBeDisabled();

    rerender(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} confirm={channel({}, { sending: true })} />);
    expect(screen.getByRole('button', { name: '보내는 중…' })).toBeDisabled();
  });

  it('⭐ 연결 전에는 무엇을 설정해야 하는지 적고, 보내기 버튼을 두지 않는다', () => {
    const { rerender } = render(
      <AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} confirm={channel({ configured: false, chatConfigured: false, botUsername: null })} />,
    );
    let box = screen.getByRole('region', { name: '텔레그램 컨펌 보고' });
    expect(within(box).getByText('SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN')).toBeInTheDocument();
    expect(within(box).getByText('SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID')).toBeInTheDocument();
    expect(within(box).queryByRole('button')).toBeNull();

    rerender(
      <AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} confirm={channel({ chatConfigured: false, setupChatId: '424242' })} />,
    );
    box = screen.getByRole('region', { name: '텔레그램 컨펌 보고' });
    expect(within(box).getByText('채팅 설정 필요')).toBeInTheDocument();
    expect(within(box).getByText('424242')).toBeInTheDocument();
    expect(within(box).getByText('SOURCING_CONFIRM_TELEGRAM_CHAT_ID')).toBeInTheDocument();
  });

  it('상태를 아직 모르면 확인 중으로 선다', () => {
    render(<AgentOrgView snapshot={snapshot()} connection="connected" now={NOW} />);
    expect(within(screen.getByRole('region', { name: '텔레그램 컨펌 보고' })).getByText('확인 중')).toBeInTheDocument();
  });
});

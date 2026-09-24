import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_MALL_REGISTER_VALUES,
  mallRegisterReadiness,
  mallRegisterValuesWithDefaults,
  type MallReadiness,
} from '@/app/(channels)/_shared/mall-register-values';
import { MallQuickRegisterRows, QUICK_REGISTER_ADAPTERS, blockedRowMessage } from './MallQuickRegisterRows';
import type { MallRunOutcome } from '../lib/mall-quick-register-run';

/**
 * 수집상품 모달의 몰 등록 표.
 *
 * 생김새는 플레이오토 2.0 `쇼핑몰 전송` 에서 가져왔다. 지키는 것 —
 *  1. **줄마다 버튼을 두지 않는다.** 체크박스로 고르고 액션은 아래 하나다.
 *  2. **상태는 배지로 말한다.**
 *  3. **여기서 값을 묻지 않는다.** 값은 상품 상세에 있다.
 *  4. **막힌 몰은 고를 수 없고, 왜 막혔는지 그 줄에 적는다.**
 */
describe('MallQuickRegisterRows', () => {
  const item = { candidateId: 'c1', name: '할로윈 LED 거미줄', salePrice: 3500, thumbnailUrl: null };
  const values = (categoryPath?: string, teamPrice?: string) => {
    const filled = mallRegisterValuesWithDefaults(EMPTY_MALL_REGISTER_VALUES);
    if (categoryPath) filled.byMall['11st'] = { ...filled.byMall['11st'], categoryPath };
    if (teamPrice) filled.byMall.always = { ...filled.byMall.always, teamPrice };
    return filled;
  };
  /** 값이 다 찬 상태 — 폼 몰 전부가 준비됨. */
  const allReady = () => mallRegisterReadiness(item, values('문구>팬시', '1800'));

  /** 확인 창이 필요한 몰(쿠팡 WING) 줄 — 훅이 다른 몰 줄 앞에 세운다. */
  const confirmRow = (overrides: Partial<MallReadiness> = {}): MallReadiness => ({
    mallKey: 'coupang',
    mallName: '쿠팡 WING',
    ready: true,
    reasons: [],
    missingFieldLabels: [],
    summary: [],
    ...overrides,
  });
  const withConfirmRow = () => ({
    readiness: [confirmRow(), ...allReady()],
    confirmationMallKeys: ['coupang'],
  });

  function renderRows(overrides: Partial<Parameters<typeof MallQuickRegisterRows>[0]> = {}) {
    const props = {
      readiness: allReady(),
      results: {} as Record<string, MallRunOutcome>,
      runningMallKeys: [],
      isLoading: false,
      disabled: false,
      detailHref: '/product-pipeline/collected-products/c1',
      targetCount: 1,
      confirmationMallKeys: [] as string[],
      onRunSelected: vi.fn(),
      onRunOne: vi.fn(),
      ...overrides,
    };
    render(<MallQuickRegisterRows {...props} />);
    // 어떤 몰키가 넘어갔는지 보려면 mock 이어야 한다. overrides 로 덮어쓰지 않는 한 항상 mock 이다.
    const sentMallKeys = () =>
      (props.onRunSelected as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string[];
    return { ...props, sentMallKeys };
  }

  /** 그 몰의 줄. 체크박스에서 가장 가까운 div 가 줄 하나다. */
  const rowOf = (mallName: string) =>
    screen.getByLabelText(mallName).closest('div') as HTMLElement;

  it('폼 방식 몰마다 체크박스가 하나씩 선다', () => {
    renderRows();
    for (const adapter of QUICK_REGISTER_ADAPTERS) {
      expect(screen.getByLabelText(adapter.mallName)).toBeInTheDocument();
    }
  });

  it('폼 채우기라고만 말한다 — 등록은 등록 실행에서 한다(KID-322)', () => {
    renderRows();
    expect(screen.getByText(/폼만 채웁니다 · \[등록\]은 누르지 않습니다/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/직접 등록하세요|몰에 등록/);
  });

  it('주인공 버튼은 아래 하나다 — 줄 버튼은 보조다', () => {
    // 예전에는 같은 초록 버튼이 여덟 개 늘어서서, 어디를 누를지가 무엇을 고를지를 덮었다.
    renderRows();
    expect(screen.getAllByRole('button', { name: /^선택한 \d+개 몰 폼 채우기$/ })).toHaveLength(1);
    for (const adapter of QUICK_REGISTER_ADAPTERS) {
      expect(screen.getByRole('button', { name: `${adapter.mallName} 폼 채우기` }))
        .toBeInTheDocument();
    }
  });

  it('등록 실행 울타리가 이미 등록됐다고 거절한 몰은 그 줄에 "이미 등록됨"과 몰 상품을 적는다', () => {
    renderRows({
      readiness: withConfirmRow().readiness,
      confirmationMallKeys: ['coupang'],
      results: {
        coupang: { mallKey: 'coupang', mallName: '쿠팡 WING', status: 'already_registered', message: '이미 이 몰 계정에 등록된 상품입니다(몰 상품 kk-9).', manualSteps: [] },
      },
    });
    const row = rowOf('쿠팡 WING');
    expect(within(row).getByText('이미 등록됨')).toBeInTheDocument();
    expect(within(row).queryByText('실패')).not.toBeInTheDocument();
    expect(screen.getByText(/몰 상품 kk-9/)).toBeInTheDocument();
  });

  describe('몰 하나만 등록', () => {
    it('그 몰키만 넘긴다 — 선택과 무관하다', () => {
      const props = renderRows();
      fireEvent.click(screen.getByRole('button', { name: '도매꾹 폼 채우기' }));
      expect(props.onRunOne).toHaveBeenCalledWith('domeggook');
      expect(props.onRunSelected).not.toHaveBeenCalled();
    });

    it('체크를 풀어 둔 몰도 혼자서는 보낼 수 있다', () => {
      const props = renderRows();
      fireEvent.click(screen.getByLabelText('도매꾹'));
      fireEvent.click(screen.getByRole('button', { name: '도매꾹 폼 채우기' }));
      expect(props.onRunOne).toHaveBeenCalledWith('domeggook');
    });

    it('버튼을 눌러도 체크가 토글되지 않는다', () => {
      const props = renderRows();
      const ready = props.readiness.filter((row) => row.ready).length;
      fireEvent.click(screen.getByRole('button', { name: '도매꾹 폼 채우기' }));
      expect(screen.getByText(`${ready}/${ready}개 몰 선택`)).toBeInTheDocument();
    });

    it('막힌 몰은 혼자서도 못 보낸다', () => {
      renderRows({ readiness: mallRegisterReadiness(item, values()) });
      expect(screen.getByRole('button', { name: '11번가 폼 채우기' })).toBeDisabled();
    });

    it('한 몰이 도는 동안에는 다 잠근다 — 탭을 하나만 쓴다', () => {
      renderRows({ runningMallKeys: ['kidsnote'] });
      expect(screen.getByRole('button', { name: '도매꾹 폼 채우기' })).toBeDisabled();
    });

    it('이미 보낸 몰은 다시 로 바뀐다', () => {
      renderRows({
        results: {
          kidsnote: {
            mallKey: 'kidsnote', mallName: '키즈노트', status: 'filled',
            message: '폼을 채웠습니다.', manualSteps: [],
          },
        },
      });
      expect(screen.getByRole('button', { name: '키즈노트 폼 채우기' })).toHaveTextContent('다시');
      expect(screen.getByRole('button', { name: '도매꾹 폼 채우기' })).toHaveTextContent('폼 채우기');
    });

  });

  it('몰 줄마다 그 몰 계정의 등록 상태를 폼 채움 배지 옆에 보인다(KID-320)', () => {
    renderRows({
      registrationAccounts: [{
        channelAccountId: '00000000-0000-4000-8000-000000000001', channel: 'kidsnote', channelAccountName: '키즈노트',
        registrationTargetId: null, channelListingId: null, externalListingId: null, listingState: null, listingRawStatus: null, listingActive: false, state: 'registered',
        soldOut: false, changedSinceRegistration: true, selectedThumbnailAssetId: null,
        selectedDetailPageRevisionId: null, lastExecution: null,
      }],
    });
    const row = rowOf('키즈노트').parentElement as HTMLElement;
    expect(within(row).getByText('등록됨')).toBeInTheDocument();
    expect(within(row).getByText('변경됨 · 재전송 필요')).toBeInTheDocument();
    expect(within(row).getByText('대기')).toBeInTheDocument();
  });

  it('값을 묻는 칸이 없다 — 값은 상품 상세에 있다', () => {
    renderRows();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  it('준비된 몰은 처음부터 다 골라져 있다', () => {
    const props = renderRows();
    const ready = props.readiness.filter((row) => row.ready).length;
    expect(screen.getByText(`${ready}/${ready}개 몰 선택`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `선택한 ${ready}개 몰 폼 채우기` })).toBeEnabled();
  });

  it('체크를 풀면 개수와 버튼 글자가 함께 줄어든다', () => {
    const props = renderRows();
    const ready = props.readiness.filter((row) => row.ready).length;
    fireEvent.click(screen.getByLabelText('키즈노트'));
    expect(screen.getByText(`${ready - 1}/${ready}개 몰 선택`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `선택한 ${ready - 1}개 몰 폼 채우기` }))
      .toBeInTheDocument();
  });

  it('고른 몰만 보낸다 — 뺀 몰은 넘기지 않는다', () => {
    const props = renderRows();
    fireEvent.click(screen.getByLabelText('키즈노트'));
    fireEvent.click(screen.getByRole('button', { name: /^선택한 \d+개 몰 폼 채우기$/ }));
    expect(props.sentMallKeys()).not.toContain('kidsnote');
    expect(props.sentMallKeys()).toContain('domeggook');
  });

  it('전체 선택을 풀면 버튼이 잠긴다 — 0개는 보낼 것이 없다', () => {
    renderRows();
    fireEvent.click(screen.getByLabelText('전체 선택'));
    expect(screen.getByRole('button', { name: '선택한 0개 몰 폼 채우기' })).toBeDisabled();
  });

  describe('막힌 몰', () => {
    const blocked = () => mallRegisterReadiness(item, values());

    it('고를 수 없고 값 필요 배지가 붙는다', () => {
      renderRows({ readiness: blocked() });
      expect(screen.getByLabelText('11번가')).toBeDisabled();
      expect(within(rowOf('11번가')).getByText('값 필요')).toBeInTheDocument();
    });

    it('무엇이 빠졌는지 그 줄에 적는다', () => {
      renderRows({ readiness: blocked() });
      expect(screen.getByText(/11번가 분류 을\(를\) 상품 상세에서 채우세요/)).toBeInTheDocument();
    });

    it('⭐ 이유가 이미 부른 칸은 다시 적지 않고, 부르지 않은 칸만 덧붙인다', () => {
      expect(blockedRowMessage({
        reasons: ['올웨이즈 카테고리가 정해지지 않았습니다(올웨이즈 분류).', '팀구매가를 입력하세요.'],
        missingFieldLabels: ['팀구매가', '올웨이즈 분류'],
      })).toBe('올웨이즈 카테고리가 정해지지 않았습니다(올웨이즈 분류). 팀구매가를 입력하세요.');
      expect(blockedRowMessage({ reasons: [], missingFieldLabels: ['수량'] }))
        .toBe('수량 을(를) 상품 상세에서 채우세요.');
    });

    it('머리말에 값 필요 개수를, 아래에 상품 상세 링크를 준다', () => {
      const props = renderRows({ readiness: blocked() });
      const count = props.readiness.filter((row) => !row.ready).length;
      expect(screen.getByText(`값 필요 ${count}`)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /상품 상세에서 채우기/ }))
        .toHaveAttribute('href', '/product-pipeline/collected-products/c1');
    });

    it('선택 개수에서 빠진다', () => {
      const props = renderRows({ readiness: blocked() });
      const ready = props.readiness.filter((row) => row.ready).length;
      expect(screen.getByText(`${ready}/${ready}개 몰 선택`)).toBeInTheDocument();
    });
  });

  describe('상태 배지', () => {
    it('아직 안 돌렸으면 대기다', () => {
      renderRows();
      expect(within(rowOf('키즈노트')).getByText('대기')).toBeInTheDocument();
    });

    it('묶음으로 도는 몰은 모두 채우는 중이다 — 한 몰만 도는 것처럼 보이지 않는다', () => {
      renderRows({ runningMallKeys: ['kidsnote', 'domeggook'] });
      expect(within(rowOf('키즈노트')).getByText('채우는 중')).toBeInTheDocument();
      expect(within(rowOf('도매꾹')).getByText('채우는 중')).toBeInTheDocument();
    });

    it('도는 중에는 채우는 중이고 체크박스가 잠긴다', () => {
      renderRows({ runningMallKeys: ['kidsnote'] });
      expect(within(rowOf('키즈노트')).getByText('채우는 중')).toBeInTheDocument();
      // 묶음으로 동시에 도므로 여럿이 함께 `채우는 중` 이다.
      expect(within(rowOf('도매꾹')).getByText('대기')).toBeInTheDocument();
      expect(screen.getByLabelText('도매꾹')).toBeDisabled();
      expect(screen.getByRole('button', { name: '몰을 열어 채우는 중' })).toBeDisabled();
    });

    it('채운 몰은 채움, 실패한 몰은 실패와 사유를 남긴다', () => {
      renderRows({
        results: {
          kidsnote: {
            mallKey: 'kidsnote', mallName: '키즈노트', status: 'filled',
            message: '폼을 채웠습니다.', manualSteps: ['열린 탭에서 확인하세요.'],
          },
          domeggook: {
            mallKey: 'domeggook', mallName: '도매꾹', status: 'failed',
            message: 'Frame with ID 0 was removed.', manualSteps: [],
          },
        },
      });
      expect(within(rowOf('키즈노트')).getByText('채움')).toBeInTheDocument();
      expect(screen.getByText('열린 탭에서 확인하세요.')).toBeInTheDocument();
      expect(within(rowOf('도매꾹')).getByText('실패')).toBeInTheDocument();
      expect(screen.getByText('Frame with ID 0 was removed.')).toBeInTheDocument();
    });
  });

  describe('확인 창이 필요한 몰 줄', () => {
    it('다른 몰과 같은 줄로 서고, 훅이 준 순서대로 맨 위에 온다', () => {
      renderRows(withConfirmRow());
      const boxes = screen.getAllByRole('checkbox');
      // [0] 은 전체 선택이라 그 다음이 첫 줄이다.
      expect(boxes[1]).toHaveAttribute('aria-label', '쿠팡 WING');
    });

    it('이 몰만 다른 점(확인 창)을 줄 안에 적는다 — 몰 이름을 박지 않는다', () => {
      renderRows(withConfirmRow());
      expect(within(rowOf('쿠팡 WING')).getByText('확인 창에서 계정 · 값을 정한 뒤 보냅니다')).toBeInTheDocument();
      expect(screen.getByText(/확인 창이 필요한 몰은 맨 마지막에 확인 창이 뜹니다/)).toBeInTheDocument();
    });

    it('선택 개수에 포함되고 보낼 때 함께 넘어간다 — 확인 창은 화면이 연다', () => {
      const before = renderRows();
      const base = before.readiness.filter((row) => row.ready).length;
      cleanup();

      const props = renderRows(withConfirmRow());
      expect(screen.getByText(`${base + 1}/${base + 1}개 몰 선택`)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^선택한 \d+개 몰 폼 채우기$/ }));
      expect(props.sentMallKeys()).toContain('coupang');
    });

    it('빼고 보낼 수 있다 — 쿠팡만 나중에 하고 싶을 때', () => {
      const props = renderRows(withConfirmRow());
      fireEvent.click(screen.getByLabelText('쿠팡 WING'));
      fireEvent.click(screen.getByRole('button', { name: /^선택한 \d+개 몰 폼 채우기$/ }));
      expect(props.sentMallKeys()).not.toContain('coupang');
    });

    it('혼자 보낼 때는 확인 창을 연다 — 폼 채우기와 등록 실행은 확인 창에서 고른다', () => {
      const props = renderRows(withConfirmRow());
      fireEvent.click(screen.getByRole('button', { name: '쿠팡 WING 확인 창 열기' }));
      expect(props.onRunOne).toHaveBeenCalledWith('coupang');
    });
  });

  it('여러 개를 골랐으면 첫 상품만 연다고 알린다', () => {
    renderRows({ targetCount: 5 });
    expect(screen.getByText(/고른 5개 중 첫 상품만 엽니다/)).toBeInTheDocument();
  });

  it('저장된 값을 읽는 동안에는 표를 세우지 않는다', () => {
    renderRows({ isLoading: true });
    expect(screen.getByText(/저장된 몰 등록 정보를 읽는 중/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('제출하지 않는다고 항상 알린다', () => {
    renderRows();
    expect(screen.getByText(/폼만 채웁니다/)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MallListingsPage from './page';

/**
 * 화면이 몰을 모르는지 확인한다.
 *
 * 어댑터의 진짜 코드(입력칸 선언·미리보기·검증·batchSize)를 그대로 돌리고,
 * 몰에 닿는 마지막 한 단계만 막는다. 이 테스트가 통과한다는 것은 몰을 하나 더
 * 붙일 때 이 파일도 페이지도 고칠 필요가 없다는 뜻이다.
 */

const { fillKidsnoteMock, prepareKidsnoteMock, generateWingExcelMock, downloadWingExcelMock } =
  vi.hoisted(() => ({
    fillKidsnoteMock: vi.fn(),
    prepareKidsnoteMock: vi.fn(),
    generateWingExcelMock: vi.fn(),
    downloadWingExcelMock: vi.fn(),
  }));
const { resolveTargetMock, targetHistoryMock, executeTargetMock } = vi.hoisted(() => ({
  resolveTargetMock: vi.fn(),
  targetHistoryMock: vi.fn(),
  executeTargetMock: vi.fn(),
}));

// 등록현황은 쿠팡 칸의 지금 재고를 확장으로 읽는다. 몰에 닿는 그 한 단계만 막는다.
const { readMallAvailabilityManyMock } = vi.hoisted(() => ({ readMallAvailabilityManyMock: vi.fn() }));
vi.mock('../_shared/mall-availability-send', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_shared/mall-availability-send')>()),
  readMallAvailabilityMany: readMallAvailabilityManyMock,
}));

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: undefined,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey.includes('targets')) {
      return { data: publishTargets, isLoading: false, isSuccess: true, isError: false, error: null };
    }
    // 품절 송신 컨트롤이 읽는 후보. 이 표의 관심사가 아니라 비워 둔다 — 컨트롤은
    // 후보가 없으면 스스로 서지 않는다.
    if (queryKey.includes('availability-preview')) {
      return { data: { candidates: [] }, isLoading: false, isError: false, error: null };
    }
    if (queryKey.includes('registration-target-choices')) {
      return { data: [], isLoading: false, isSuccess: true, isError: false, error: null };
    }
    // 수집 상품 탭은 KID 를 아직 받지 않은 판매상품 초안 목록이다(KID-313).
    if (queryKey.includes('sales-products') && JSON.stringify(queryKey).includes('preparing')) {
      const draft = (id: string, name: string, salePrice: number | null) => ({
        id, code: null, ownCode: null, sourceRecordId: null, sourcePlatform: '1688', sourceUrl: null, name,
        status: 'draft', salePrice, imageUrl: null, optionAxes: [], optionCount: 1, sellingOptionCount: 1,
        unlinkedOptionCount: 1, channelListingCount: 0, updatedAt: '2026-09-19T00:00:00.000Z',
      });
      return {
        data: {
          items: [
            draft('sp-c1', '킬러볼 스피너 키링', 2280),
            draft('sp-c2', '공룡 물총', 3500),
            draft('sp-c3', '판매가 없는 상품', 0),
          ],
          total: 3,
          page: 1,
          limit: 25,
          summary: { total: 3, withOptions: 0, withUnlinkedOptions: 3, unregistered: 0, draft: 3 },
        },
        isLoading: false,
        isError: false,
        error: null,
      };
    }
    if (queryKey.includes('sales-products')) {
      return {
        data: {
          items: [
            {
              id: 's1', code: '100300', ownCode: null, name: '애니멀 만능패드', status: 'active', salePrice: 5900,
              imageUrl: null, optionAxes: ['색상'], optionCount: 3, sellingOptionCount: 3, unlinkedOptionCount: 0,
              channelListingCount: 0, updatedAt: '2026-09-19T00:00:00.000Z',
              registrationAccounts: [],
            },
            {
              id: 's2', code: '100017', ownCode: null, name: '투명우산 그리기', status: 'active', salePrice: 2880,
              imageUrl: null, optionAxes: [], optionCount: 1, sellingOptionCount: 1, unlinkedOptionCount: 0,
              channelListingCount: 0, updatedAt: '2026-09-19T00:00:00.000Z',
              registrationAccounts: [{
                channelAccountId: '11111111-1111-4111-8111-111111111111', channel: 'kidsnote', channelAccountName: '키즈노트',
                registrationTargetId: null, channelListingId: null, externalListingId: null,
                listingState: null, listingRawStatus: null, listingActive: false, state: 'registered',
                soldOut: false, changedSinceRegistration: false, selectedThumbnailAssetId: null,
                selectedDetailPageRevisionId: null, lastExecution: null,
              }],
            },
          ],
          total: 2,
          page: 1,
          limit: 25,
          summary: { total: 2, withOptions: 1, withUnlinkedOptions: 0, unregistered: 0 },
        },
        isLoading: false,
        isError: false,
        error: null,
      };
    }
    if (queryKey.includes('listing-matrix')) {
      return {
        data: matrixData,
        isLoading: false,
        isError: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    return {
      data: {
        items: [
          // 수집 시점부터 판매상품 초안이 있다(ADR-0022) — 목록 항목이 이미 그 id를 안다.
          { id: 'c1', name: '킬러볼 스피너 키링', price_krw: 2280, thumbnailUrl: null, salesProductId: 'sp-c1' },
          { id: 'c2', name: '공룡 물총', price_krw: 3500, thumbnailUrl: null, salesProductId: 'sp-c2' },
          { id: 'c3', name: '판매가 없는 상품', price_krw: 0, thumbnailUrl: null, salesProductId: 'sp-c3' },
        ],
        total: 3,
      },
      isLoading: false,
      isError: false,
      error: null,
    };
  },
}));

vi.mock('@/lib/registration-target-api', () => ({
  registrationTargetApi: { resolve: resolveTargetMock },
}));

vi.mock('../_shared/registration-execution-api', () => ({
  listRegistrationTargetExecutions: targetHistoryMock,
}));

vi.mock('../_shared/target-registration-execution', () => ({
  executeTargetRegistration: executeTargetMock,
  isActiveTargetExecution: (execution: { status: string }) => ['prepared', 'executing', 'reconciling'].includes(execution.status),
}));

vi.mock('../../(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api', () => ({
  productsApi: { list: vi.fn() },
}));

vi.mock('../../(product-pipeline)/product-pipeline/_shared/lib/kidsnote-registration-api', () => ({
  prepareKidsnoteRegistration: prepareKidsnoteMock,
  fillKidsnoteRegistrationForm: fillKidsnoteMock,
}));

vi.mock('../_shared/adapters/coupang-wing/wing-excel-export', () => ({
  generateWingExcelForSalesProducts: generateWingExcelMock,
  downloadWingExcel: downloadWingExcelMock,
}));

// 사방넷 가져오기 컨트롤의 동작은 컨트롤 쪽 스펙이 본다. 여기서는 안 가져온 몰 안내에 서는지만.
vi.mock('../_shared/SabangnetListingsImport', () => ({
  SabangnetListingsImport: () => <button type="button">사방넷에서 가져오기</button>,
}));

vi.mock('../_shared/MallAdminListingsImport', () => ({
  MallAdminListingsImport: ({ mallKey }: { mallKey: string }) => (
    <button type="button">{mallKey}에서 가져오기</button>
  ),
}));

let matrixData: unknown = { columns: [], rows: [], total: 0, page: 1, limit: 25 };

function publishTarget(key: string, name: string, channelAccountId: string | null) {
  return {
    manifest: {
      key,
      name,
      kind: key === 'coupang' ? 'extension_excel' : 'extension_form',
      difficulty: 'low',
      unverified: false,
      applicable: true,
      supports: {
        createListing: true, updateListing: false, setStock: null, setSaleStatus: null,
        soldOut: false, resume: false,
      },
      soldOutRoute: null,
      resumeRoute: null,
      hazards: {
        soldOutDeletesListing: false, suspendAutoDeletesAfterDays: null, irreversibleStates: [],
        updateResetsApproval: false, stockWriteOverwritesPrice: false, requiresOperatorApproval: false,
        fullPayloadOnUpdate: false, resumeRequiresAlternatePath: false,
      },
      limits: { maxPerRequest: null, ratePerSecond: null, maxOptionsPerListing: null, minStockValue: null },
      preflightRules: [],
      requiredProfileFields: [],
      note: '',
    },
    hasCredentials: Boolean(channelAccountId),
    channelAccountId,
    hasListingProfile: true,
    readiness: channelAccountId ? 'ready' : 'needs_account',
  };
}

const publishTargets = [
  publishTarget('coupang', '쿠팡(마켓플레이스)', '99999999-9999-4999-8999-999999999999'),
  publishTarget('kidsnote', '키즈노트', '11111111-1111-4111-8111-111111111111'),
];

/** 마법사는 '새 등록' 탭 뒤에 있다. 기본 화면은 등록 현황이다. 기본 출처는 판매상품이다. */
function goToWizard(source: 'candidate' | 'sales_product' = 'candidate') {
  fireEvent.click(screen.getByRole('button', { name: '새 등록' }));
  if (source === 'candidate') fireEvent.click(screen.getByRole('tab', { name: '수집 상품' }));
}

function selectProduct(name: string) {
  fireEvent.click(screen.getByRole('checkbox', { name: `${name} 선택` }));
}

/** 쿠팡 WING 은 카테고리를 골라야 보낼 수 있다 — 값 단계에서 그 몰을 열어 고른다. */
function pickWingCategory() {
  fireEvent.click(screen.getByRole('button', { name: /^쿠팡 WING/ }));
  fireEvent.change(screen.getByDisplayValue('카테고리를 선택하세요'), { target: { value: '64687' } });
}

function goNext() {
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  matrixData = { columns: [], rows: [], total: 0, page: 1, limit: 25 };
  prepareKidsnoteMock.mockResolvedValue({ draft: { displayName: '초안' }, detailImageUrl: 'x' });
  fillKidsnoteMock.mockResolvedValue({
    ok: true,
    submitted: false,
    steps: [],
    warnings: [],
    manualSteps: ['화면에서 등록 신청 버튼을 누르세요.'],
  });
  resolveTargetMock.mockResolvedValue({ id: 'target-id', version: 1 });
  targetHistoryMock.mockResolvedValue([]);
  executeTargetMock.mockResolvedValue({
    execution: { executionId: 'execution-id', status: 'reconciling', providerOutcome: 'uncertain' },
    outcome: {
      ok: false,
      confirmed: false,
      submitted: false,
      manualSteps: ['화면에서 등록 신청 버튼을 누르세요.'],
      warnings: ['몰 결과를 확인해야 합니다.'],
    },
    adapterCalled: true,
  });
  generateWingExcelMock.mockResolvedValue({ bytes: new Uint8Array([1]), productCount: 2 });
  // 기본은 읽는 중 그대로 둔다 — 창의 버튼을 세는 테스트가 읽기 결과에 흔들리지 않게.
  readMallAvailabilityManyMock.mockReturnValue(new Promise(() => {}));
});

describe('판매상품에서 등록 (ADR-0014)', () => {
  it('판매상품이 기본 출처이고, 옵션 상품은 옵션 채우기가 없는 몰에서 막힌다', () => {
    render(<MallListingsPage />);
    goToWizard('sales_product');
    expect(screen.getByRole('tab', { name: '판매상품' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('옵션 3')).toBeInTheDocument();
    selectProduct('애니멀 만능패드');
    selectProduct('투명우산 그리기');
    goNext();
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));
    goNext();
    expect(screen.getByText(/옵션 3개 상품입니다\. 키즈노트 옵션 채우기가 아직 없어 보내지 않습니다\./)).toBeInTheDocument();
  });
});

describe('새 등록 — 등록 상태(KID-320)', () => {
  it('상품 줄에 등록 상태 요약을 보이고, 이미 그 계정에 등록된 상품은 기본으로 보내지 않는다', () => {
    render(<MallListingsPage />);
    goToWizard('sales_product');
    expect(screen.getByText('1몰 등록')).toBeInTheDocument();
    selectProduct('애니멀 만능패드');
    selectProduct('투명우산 그리기');
    goNext();
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));
    goNext();
    expect(screen.getByText(/이 몰 계정에 이미 등록됨/)).toBeInTheDocument();
  });
});

describe('상품 등록 (N × M)', () => {
  it('상품을 고르기 전에는 다음으로 갈 수 없다', () => {
    render(<MallListingsPage />);
    goToWizard();
    expect(screen.getByRole('button', { name: /다음/ })).toBeDisabled();
  });

  it('상품 × 몰 = 건수를 아래 막대에 항상 보여준다', () => {
    render(<MallListingsPage />);
    goToWizard();
    selectProduct('킬러볼 스피너 키링');
    selectProduct('공룡 물총');
    goNext();

    fireEvent.click(screen.getByRole('checkbox', { name: '쿠팡 WING 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));

    expect(screen.getByText('상품 2')).toBeInTheDocument();
    expect(screen.getByText('몰 2')).toBeInTheDocument();
    expect(screen.getByText('4건')).toBeInTheDocument();
  });

  it('몰마다 다른 값과 그 출처를 3단계에서 보여준다', () => {
    render(<MallListingsPage />);
    goToWizard();
    selectProduct('킬러볼 스피너 키링');
    goNext();
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));
    goNext();

    // 키즈노트만의 값이 화면에 있다 — 코드 상수가 아니라 눈에 보이는 값으로.
    expect(screen.getByDisplayValue('거영I&D')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15.00')).toBeInTheDocument();
    expect(screen.getByText('기타(1100) · 26칸')).toBeInTheDocument();
    // 노출상품명은 이 몰의 조립 규칙이 적용된 모습으로 보인다.
    expect(screen.getByText(/\[키드아이템\] 킬러볼 스피너 키링 1p/)).toBeInTheDocument();
    // 출처 라벨.
    expect(screen.getAllByText('몰 고정').length).toBeGreaterThan(0);
  });

  it('판매가 없는 상품은 키즈노트에서 막히고 이유가 보인다', () => {
    render(<MallListingsPage />);
    goToWizard();
    selectProduct('킬러볼 스피너 키링');
    selectProduct('판매가 없는 상품');
    goNext();
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));
    goNext();

    expect(screen.getByText(/보낼 수 없는 상품 1건/)).toBeInTheDocument();
    expect(screen.getByText(/판매가가 0원입니다/)).toBeInTheDocument();
    // 2개를 골랐지만 실제로 나가는 건 1건이다.
    expect(screen.getByText('1건')).toBeInTheDocument();
  });

  it('몰마다 다른 단위로 쪼개 순차 송신한다', async () => {
    render(<MallListingsPage />);
    goToWizard();
    selectProduct('킬러볼 스피너 키링');
    selectProduct('공룡 물총');
    goNext();
    fireEvent.click(screen.getByRole('checkbox', { name: '쿠팡 WING 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));
    goNext();
    pickWingCategory();

    fireEvent.click(screen.getByRole('button', { name: /4건 등록 실행/ }));

    // 쿠팡 WING 도 폼 몰이다(KID-321) — 몰마다 상품 1건씩, 모두 등록 대상 실행을 지난다. 엑셀을 만들지 않는다.
    await waitFor(() => {
      expect(executeTargetMock).toHaveBeenCalledTimes(4);
    });
    expect(generateWingExcelMock).not.toHaveBeenCalled();
    expect(downloadWingExcelMock).not.toHaveBeenCalled();
    expect(resolveTargetMock).toHaveBeenCalledTimes(4);
  });

  it('보냈다고 등록됐다고 말하지 않는다', async () => {
    render(<MallListingsPage />);
    goToWizard();
    selectProduct('킬러볼 스피너 키링');
    goNext();
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));
    goNext();
    fireEvent.click(screen.getByRole('button', { name: /1건 등록 실행/ }));

    await waitFor(() => {
      expect(screen.getByText('결과 확인 필요')).toBeInTheDocument();
    });
    expect(screen.queryByText('끝남')).not.toBeInTheDocument();
    expect(screen.queryByText('끝났습니다. 몰에 올라간 것은 몰 상품을 다시 가져와 확인합니다.')).not.toBeInTheDocument();
    expect(screen.getByText('화면에서 등록 신청 버튼을 누르세요.')).toBeInTheDocument();
    const acceptedCard = screen.getByText('몰이 받음').parentElement as HTMLElement;
    expect(within(acceptedCard).getByText('0')).toBeInTheDocument();
    const personCard = screen.getByText('사람이 등록할 것').parentElement as HTMLElement;
    expect(within(personCard).getByText('0')).toBeInTheDocument();
  });

  it('한 몰이 실패해도 다음 몰을 계속 보낸다', async () => {
    executeTargetMock.mockRejectedValue(new Error('확장을 새로고침하세요'));
    render(<MallListingsPage />);
    goToWizard();
    selectProduct('킬러볼 스피너 키링');
    goNext();
    fireEvent.click(screen.getByRole('checkbox', { name: '쿠팡 WING 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));
    goNext();
    pickWingCategory();
    fireEvent.click(screen.getByRole('button', { name: /2건 등록 실행/ }));

    // 두 몰 모두 같은 실패를 보이고, 첫 몰의 실패가 둘째 몰을 멈추지 않는다.
    await waitFor(() => {
      expect(screen.getAllByText('확장을 새로고침하세요')).toHaveLength(2);
    });
    expect(executeTargetMock).toHaveBeenCalledTimes(2);
    // 요약 카드 라벨과 작업 줄의 상태, 둘 다 '실패' 로 나온다.
    expect(screen.getAllByText('실패').length).toBeGreaterThanOrEqual(2);
  });
});

describe('등록 현황 (상품 × 몰 매트릭스)', () => {
  function withMatrix() {
    matrixData = {
      total: 2,
      page: 1,
      limit: 25,
      columns: [
        {
          mallKey: 'coupang', mallName: '쿠팡(마켓플레이스)', channelAccountId: 'acc-1',
          hasAdapter: true, imported: true, listingCount: 1230,
          actions: {
            createListing: true, updateListing: true, soldOut: true, resume: true,
            setStock: true, soldOutDeletesListing: false, requiresOperatorApproval: false,
          },
        },
        {
          mallKey: 'kidsnote', mallName: '키즈노트', channelAccountId: null,
          hasAdapter: true, imported: false, listingCount: 0,
          actions: {
            createListing: true, updateListing: true, soldOut: true, resume: true,
            setStock: true, soldOutDeletesListing: false, requiresOperatorApproval: false,
          },
        },
      ],
      rows: [
        {
          masterProductId: 'mp-1',
          imageUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/abc.jpg',
          name: '3000샤이닝반짝이풀펜',
          code: 'INV-SELLPIA-ff15e698-aac9-4f5d-914e-dd16e6865651',
          category: '문구/사무용품',
          stock: 120,
          publishedCount: 1,
          updatedAt: '2026-09-05T00:00:00.000Z',
          cells: [
            {
              mallKey: 'coupang', state: 'published', rawStatus: '승인완료',
              externalId: '16290876620', warning: null, updatedAt: '2026-09-05T00:00:00.000Z',
            },
            {
              mallKey: 'kidsnote', state: 'unregistered', rawStatus: null,
              externalId: null, warning: null, updatedAt: null,
            },
          ],
        },
        {
          masterProductId: 'mp-2',
          imageUrl: null,
          name: '재고 연결 없는 상품',
          code: 'KID-2',
          category: null,
          stock: null,
          publishedCount: 0,
          updatedAt: '2026-09-04T00:00:00.000Z',
          cells: [
            {
              mallKey: 'coupang', state: 'unknown', rawStatus: 'observed',
              externalId: 'x', warning: '목록에서 존재만 확인했습니다.', updatedAt: null,
            },
            {
              mallKey: 'kidsnote', state: 'unregistered', rawStatus: null,
              externalId: null, warning: null, updatedAt: null,
            },
          ],
        },
      ],
    };
  }

  it('기본 화면이 등록 현황이다 — 마법사가 아니다', () => {
    withMatrix();
    render(<MallListingsPage />);
    expect(screen.getByRole('columnheader', { name: /상품 정보/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다음/ })).not.toBeInTheDocument();
  });

  it('몰마다 열이 하나씩 서고 칸이 상태를 말한다', () => {
    withMatrix();
    render(<MallListingsPage />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('등록')).toBeInTheDocument();
    expect(within(table).getByText('확인필요')).toBeInTheDocument();
    // 상품 2개 × 키즈노트 열 = 미등록 칸 2개. 필터 버튼의 '미등록'과 섞이지 않게
    // 표 안에서만 센다.
    expect(within(table).getAllByText('미등록')).toHaveLength(2);
  });

  it('판매상품이 있는 칸은 등록 상태 reader 의 계정 배지를, 없는 칸은 리스팅 상태를 보인다(KID-320)', () => {
    withMatrix();
    const rows = (matrixData as { rows: { cells: Record<string, unknown>[] }[] }).rows;
    rows[0]!.cells[0] = {
      ...rows[0]!.cells[0],
      registration: {
        channelAccountId: '99999999-9999-4999-8999-999999999999', channel: 'coupang', channelAccountName: '쿠팡',
        registrationTargetId: null, channelListingId: null, externalListingId: '16290876620',
        listingState: 'published', listingRawStatus: '승인완료', listingActive: true, state: 'registered',
        soldOut: true, changedSinceRegistration: true, selectedThumbnailAssetId: null,
        selectedDetailPageRevisionId: null, lastExecution: null,
      },
    };
    render(<MallListingsPage />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('등록됨')).toBeInTheDocument();
    expect(within(table).getByText('품절')).toBeInTheDocument();
    expect(within(table).queryByText(/변경됨/)).not.toBeInTheDocument();
    // 판매상품 없는 칸(두 번째 줄)은 리스팅 상태 그대로다.
    expect(within(table).getByText('확인필요')).toBeInTheDocument();
  });

  it('몰이 아직 승인하지 않은 리스팅은 등록됨 옆에 미승인을 그대로 보인다 — 초록 등록됨으로 덮지 않는다', () => {
    withMatrix();
    const rows = (matrixData as { rows: { cells: Record<string, unknown>[] }[] }).rows;
    rows[0]!.cells[0] = {
      ...rows[0]!.cells[0],
      state: 'reviewing',
      rawStatus: '승인대기',
      registration: {
        channelAccountId: '99999999-9999-4999-8999-999999999999', channel: 'coupang', channelAccountName: '쿠팡',
        registrationTargetId: null, channelListingId: null, externalListingId: '16290876620',
        listingState: 'reviewing', listingRawStatus: '승인대기', listingActive: true, state: 'registered',
        soldOut: false, changedSinceRegistration: false, selectedThumbnailAssetId: null,
        selectedDetailPageRevisionId: null, lastExecution: null,
      },
    };
    render(<MallListingsPage />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('등록됨')).toBeInTheDocument();
    expect(within(table).getByText('미승인')).toBeInTheDocument();
  });

  it('리스팅을 안 가져온 몰은 열에 미수집이 붙고 아래에 설명이 나온다', () => {
    withMatrix();
    render(<MallListingsPage />);
    expect(screen.getByText('미수집')).toBeInTheDocument();
    expect(
      screen.getByText(/키즈노트 은\(는\) 리스팅을 아직 가져오지 않았습니다/),
    ).toBeInTheDocument();
    expect(screen.getByText(/몰에 상품이 없다는 뜻이 아니라 우리가 모른다는 뜻/)).toBeInTheDocument();
    // 사방넷으로 올린 몰은 그 자리에서 한꺼번에 가져온다.
    expect(screen.getByRole('button', { name: '사방넷에서 가져오기' })).toBeInTheDocument();
  });

  it('재고 없음과 재고 0을 구별한다', () => {
    withMatrix();
    render(<MallListingsPage />);
    // 연결이 없으면 대시. 0 원이 아니라 모른다는 뜻이다.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('셀피아 합성 코드를 짧게 줄여 보여준다', () => {
    withMatrix();
    render(<MallListingsPage />);
    // 원본은 INV-SELLPIA-<uuid> 라 표에서 아무것도 알려주지 않는다.
    expect(screen.getByText(/SELLPIA-FF15E698 · 문구\/사무용품/)).toBeInTheDocument();
  });

  it('요약이 확인 필요 칸을 센다', () => {
    withMatrix();
    render(<MallListingsPage />);
    const card = screen.getByText('확인 필요').parentElement as HTMLElement;
    expect(within(card).getByText('1')).toBeInTheDocument();
  });

  it('기본 필터가 등록됨이다 — 전체는 대부분 빈 행이다', () => {
    withMatrix();
    render(<MallListingsPage />);
    const listed = screen.getByRole('button', { name: '등록됨' });
    // 선택된 필터만 primary 배경을 받는다.
    expect(listed.className).toContain('bg-primary');
    expect(screen.getByRole('button', { name: '전체' }).className).not.toContain('bg-primary');
  });

  it('미등록만 따로 볼 수 있다', () => {
    withMatrix();
    render(<MallListingsPage />);
    fireEvent.click(screen.getByRole('button', { name: '미등록' }));
    expect(screen.getByRole('button', { name: '미등록' }).className).toContain('bg-primary');
  });

it('상품 사진이 있으면 보여주고 없으면 머리글자 타일이다', () => {
    withMatrix();
    const { container } = render(<MallListingsPage />);
    // 몰 로고도 img 라서 본문(tbody)으로 좁힌다.
    const images = container.querySelectorAll('tbody img');
    // 사진이 있는 행만 img 를 그린다.
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute(
      'src',
      'https://image1.coupangcdn.com/image/vendor_inventory/abc.jpg',
    );
    // 사진 없는 행은 이름 머리글자로 대신한다.
    expect(within(screen.getByRole('table')).getByText('재')).toBeInTheDocument();
  });

  it('현황과 새 등록 사이를 오갈 수 있다', () => {
    withMatrix();
    render(<MallListingsPage />);
    goToWizard();
    expect(screen.getByRole('button', { name: /다음/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '등록 현황' }));
    expect(screen.getByRole('columnheader', { name: /상품 정보/ })).toBeInTheDocument();
  });
});

describe('표 배치', () => {
  function withMalls(count: number) {
    const columns = Array.from({ length: count }, (_, index) => ({
      mallKey: `mall-${index}`,
      mallName: `몰${index}`,
      channelAccountId: null,
      hasAdapter: false,
      imported: index === 0,
      listingCount: index === 0 ? 10 : 0,
      actions: {
        createListing: false, updateListing: false, soldOut: false, resume: false,
        setStock: false, soldOutDeletesListing: false, requiresOperatorApproval: false,
      },
    }));
    matrixData = {
      total: 1,
      page: 1,
      limit: 25,
      filter: 'listed',
      columns,
      rows: [
        {
          masterProductId: 'mp-1',
          imageUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/abc.jpg',
          name: '3000샤이닝반짝이풀펜',
          code: 'INV-SELLPIA-ff15e698-aaaa-bbbb-cccc-dddddddddddd',
          category: null,
          stock: 12,
          publishedCount: 0,
          updatedAt: '2026-09-05T00:00:00.000Z',
          cells: columns.map((column) => ({
            mallKey: column.mallKey,
            state: 'unregistered',
            rawStatus: null,
            externalId: null,
            warning: null,
            updatedAt: null,
          })),
        },
      ],
    };
  }

  /**
   * 몰이 스무 곳 넘어 표는 늘 가로로 넘치는데 스크롤바가 맨 아래에만 있으면,
   * 오른쪽 끝 몰을 보려고 먼저 세로로 한참 내려가야 한다. 같은 스크롤을 위에도 둔다.
   */
  it('⭐ 가로 스크롤을 표 위에도 둔다 — 아래 스크롤바를 찾아 내려가지 않게', () => {
    withMalls(20);
    const { container } = render(<MallListingsPage />);
    const bars = container.querySelectorAll('.overflow-x-auto');
    // 위쪽 한 줄 + 표 본체. 위쪽은 macOS 오버레이 스크롤바에 가려지지 않게 직접 그린다.
    expect(bars.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.scrollbar-x-visible')).not.toBeNull();
  });

  it('액션 열은 액션 버튼이 들어갈 폭을 고정한다', () => {
    withMalls(3);
    render(<MallListingsPage />);
    const action = screen
      .getAllByRole('columnheader')
      .find((cell) => (cell.textContent ?? '').includes('액션'));
    // 폭이 내용에 밀리면 헤더와 본문이 어긋난다.
    expect(action?.className).toContain('w-[120px]');
  });

  it('상품 정보를 누르면 상품 상세로 간다 — 따로 상세보기 글자를 두지 않는다', () => {
    withMalls(3);
    render(<MallListingsPage />);
    const productLinks = screen
      .getAllByRole('link')
      .filter((link) => (link.getAttribute('href') ?? '').startsWith('/product-hub/'));
    expect(productLinks.length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: '상세보기' })).not.toBeInTheDocument();
  });

  it('재고와 액션이 몰보다 앞에 온다', () => {
    withMalls(3);
    render(<MallListingsPage />);
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    const stock = headers.findIndex((text) => text.includes('재고'));
    const action = headers.findIndex((text) => text.includes('액션'));
    const firstMall = headers.findIndex((text) => text.includes('몰0'));
    expect(stock).toBeLessThan(firstMall);
    expect(action).toBeLessThan(firstMall);
  });

  it('몰이 많아도 열을 전부 세운다', () => {
    withMalls(25);
    render(<MallListingsPage />);
    const headers = screen.getAllByRole('columnheader');
    // 고정 4열 + 몰 25열
    expect(headers).toHaveLength(29);
  });

});

describe('액션 UI (화면만, 실행 없음)', () => {
  function withActions(overrides: Record<string, boolean> = {}) {
    const base = {
      createListing: true, updateListing: true, soldOut: true, resume: true,
      setStock: true, soldOutDeletesListing: false, requiresOperatorApproval: false,
      ...overrides,
    };
    matrixData = {
      total: 1, page: 1, limit: 25, filter: 'listed',
      columns: [{
        mallKey: 'coupang', mallName: '쿠팡(마켓플레이스)', channelAccountId: 'acc-1',
        hasAdapter: true, imported: true, listingCount: 10, actions: base,
      }],
      rows: [{
        masterProductId: 'mp-1', imageUrl: null, name: '3000심쿵!뽑기왕',
        code: 'KID-1', category: null, stock: 15, publishedCount: 1,
        updatedAt: '2026-09-05T00:00:00.000Z',
        cells: [{
          mallKey: 'coupang', state: 'published', rawStatus: '승인완료',
          externalId: '16290876620', warning: null, updatedAt: null,
        }],
      }],
    };
  }

  it('칸을 누르면 그 몰에서 가능한 작업이 나온다', () => {
    withActions();
    render(<MallListingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /쿠팡\(마켓플레이스\) 작업/ }));
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('이 몰에 등록')).toBeInTheDocument();
    expect(within(panel).getByText('품절 처리')).toBeInTheDocument();
    expect(within(panel).getByText('판매 재개')).toBeInTheDocument();
    expect(within(panel).getByText('몰 상품번호 16290876620')).toBeInTheDocument();
  });

  // 쿠팡 윙은 품절 · 재개 송신 경로가 있다(2026-09-18). 경로가 없는 작업은 여전히 누를 수 없다.
  it('경로가 있는 품절 처리 · 판매 재개만 누를 수 있고 나머지는 비활성이다', () => {
    withActions();
    render(<MallListingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /쿠팡\(마켓플레이스\) 작업/ }));
    const panel = screen.getByRole('dialog');
    const enabled = within(panel).getAllByRole('button').filter((button) => !(button as HTMLButtonElement).disabled);
    expect(enabled).toHaveLength(2);
    expect(enabled[0]).toHaveTextContent('품절 처리');
    expect(enabled[1]).toHaveTextContent('판매 재개');
  });

  // 쿠팡 윙은 품절이어도 판매상태가 판매중(ON_SALE)이다. 표가 페이지째 윙 지금 재고를 읽어 품절이면 칸을 빨간 '품절'로
  // 보인다(사장님 2026-09-18: "실시간으로 품절이면 품절로 나오게 해줘야지 … 품절은 빨간색으로").
  it('⭐ 쿠팡 칸은 윙 지금 재고를 읽어 품절이면 빨간 품절로 보이고, 창에도 같은 값이 보인다', async () => {
    withActions();
    readMallAvailabilityManyMock.mockResolvedValue(
      new Map([['16290876620', [{ optionCode: '95903875495', stock: 0, rocket: false }]]]),
    );
    render(<MallListingsPage />);
    const pill = await screen.findByText('품절');
    // 품절은 꽉 찬 빨강에 흰 글씨(쇼핑몰 현황 스위치처럼, 사장님 2026-09-19).
    expect(pill).toHaveClass('bg-rose-600', 'text-white');
    expect(readMallAvailabilityManyMock).toHaveBeenCalledWith('coupang', ['16290876620']);
    fireEvent.click(screen.getByRole('button', { name: /쿠팡\(마켓플레이스\) 작업/ }));
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('지금 품절 · 재고 0')).toBeInTheDocument();
    expect(readMallAvailabilityManyMock).toHaveBeenCalledTimes(1);
  });

  it('재고가 있으면 칸은 그대로 등록이다', async () => {
    withActions();
    readMallAvailabilityManyMock.mockResolvedValue(
      new Map([['16290876620', [{ optionCode: '95903875495', stock: 999, rocket: false }]]]),
    );
    render(<MallListingsPage />);
    await waitFor(() => expect(readMallAvailabilityManyMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /쿠팡\(마켓플레이스\) 작업/ }));
    const panel = screen.getByRole('dialog');
    expect(await within(panel).findByText('지금 판매 가능 · 재고 999')).toBeInTheDocument();
    expect(screen.queryByText('품절')).not.toBeInTheDocument();
  });

  it('지금 재고를 못 읽으면 이유와 다시 읽기를 보인다', async () => {
    withActions();
    readMallAvailabilityManyMock.mockRejectedValueOnce(new Error('쿠팡 윙에 로그인되어 있지 않습니다. 로그인한 뒤 다시 시도하세요.'));
    render(<MallListingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /쿠팡\(마켓플레이스\) 작업/ }));
    const panel = screen.getByRole('dialog');
    expect(await within(panel).findByText(/쿠팡 윙에 로그인되어 있지 않습니다/)).toBeInTheDocument();
    readMallAvailabilityManyMock.mockResolvedValue(
      new Map([['16290876620', [{ optionCode: '95903875495', stock: 999, rocket: false }]]]),
    );
    fireEvent.click(within(panel).getByRole('button', { name: '다시' }));
    expect(await within(panel).findByText('지금 판매 가능 · 재고 999')).toBeInTheDocument();
  });

  it('몰이 못 하는 작업은 불가로 표시한다', () => {
    withActions({ soldOut: false, resume: false });
    render(<MallListingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /쿠팡\(마켓플레이스\) 작업/ }));
    const panel = screen.getByRole('dialog');
    expect(within(panel).getAllByText('불가')).toHaveLength(2);
  });

  it('완전품절이 삭제인 몰은 누르기 전에 경고한다', () => {
    withActions({ soldOutDeletesListing: true });
    render(<MallListingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /쿠팡\(마켓플레이스\) 작업/ }));
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText(/완전품절이 리스팅 삭제입니다/)).toBeInTheDocument();
    expect(within(panel).getByText('품절 처리 (삭제됨)')).toBeInTheDocument();
  });

  it('승인제 몰은 등록이 아니라 신청이라고 말한다', () => {
    withActions({ requiresOperatorApproval: true });
    render(<MallListingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /쿠팡\(마켓플레이스\) 작업/ }));
    expect(screen.getByText(/등록이 아니라 승인 신청입니다/)).toBeInTheDocument();
  });

  it('행 더보기는 몰 수와 함께 일괄 작업을 보여준다', () => {
    withActions();
    render(<MallListingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /액션$/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('전 몰 품절 처리')).toBeInTheDocument();
    expect(within(menu).getAllByText('1개 몰')).toHaveLength(4);
    expect(within(menu).getByText(/아직 화면만 있습니다/)).toBeInTheDocument();
  });

  it('칸 팝오버와 행 메뉴는 동시에 열리지 않는다', () => {
    withActions();
    render(<MallListingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /쿠팡\(마켓플레이스\) 작업/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /액션$/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('공식 로고가 있는 몰은 로고를 단다', () => {
    withActions();
    const { container } = render(<MallListingsPage />);
    const logo = container.querySelector('thead img');
    expect(logo).toHaveAttribute('src', '/mall-logos/coupang.ico');
  });
});

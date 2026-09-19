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
      return { data: [], isLoading: false, isError: false, error: null };
    }
    // 품절 송신 컨트롤이 읽는 후보. 이 표의 관심사가 아니라 비워 둔다 — 컨트롤은
    // 후보가 없으면 스스로 서지 않는다.
    if (queryKey.includes('availability-preview')) {
      return { data: { candidates: [] }, isLoading: false, isError: false, error: null };
    }
    if (queryKey.includes('sales-products')) {
      return {
        data: {
          items: [
            {
              id: 's1', code: '100300', ownCode: null, name: '애니멀 만능패드', status: 'active', salePrice: 5900,
              imageUrl: null, optionAxes: ['색상'], optionCount: 3, sellingOptionCount: 3, unlinkedOptionCount: 0,
              channelListingCount: 0, channelOverrideCount: 0, updatedAt: '2026-09-19T00:00:00.000Z',
            },
            {
              id: 's2', code: '100017', ownCode: null, name: '투명우산 그리기', status: 'active', salePrice: 2880,
              imageUrl: null, optionAxes: [], optionCount: 1, sellingOptionCount: 1, unlinkedOptionCount: 0,
              channelListingCount: 0, channelOverrideCount: 0, updatedAt: '2026-09-19T00:00:00.000Z',
            },
          ],
          total: 2,
          page: 1,
          limit: 25,
          summary: { total: 2, withOptions: 1, withUnlinkedOptions: 0 },
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
          { id: 'c1', name: '킬러볼 스피너 키링', price_krw: 2280, thumbnailUrl: null },
          { id: 'c2', name: '공룡 물총', price_krw: 3500, thumbnailUrl: null },
          { id: 'c3', name: '판매가 없는 상품', price_krw: 0, thumbnailUrl: null },
        ],
        total: 3,
      },
      isLoading: false,
      isError: false,
      error: null,
    };
  },
}));

vi.mock('../../(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api', () => ({
  productsApi: { list: vi.fn() },
}));

vi.mock('../../(product-pipeline)/product-pipeline/_shared/lib/kidsnote-registration-api', () => ({
  prepareKidsnoteRegistration: prepareKidsnoteMock,
  fillKidsnoteRegistrationForm: fillKidsnoteMock,
}));

vi.mock('../../(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow', () => ({
  generateWingExcelForCandidates: generateWingExcelMock,
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

/** 마법사는 '새 등록' 탭 뒤에 있다. 기본 화면은 등록 현황이다. 기본 출처는 판매상품이다. */
function goToWizard(source: 'candidate' | 'sales_product' = 'candidate') {
  fireEvent.click(screen.getByRole('button', { name: '새 등록' }));
  if (source === 'candidate') fireEvent.click(screen.getByRole('tab', { name: '수집 상품' }));
}

function selectProduct(name: string) {
  fireEvent.click(screen.getByRole('checkbox', { name: `${name} 선택` }));
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
  generateWingExcelMock.mockResolvedValue({ bytes: new Uint8Array([1]), productCount: 2 });
  // 기본은 읽는 중 그대로 둔다 — 창의 버튼을 세는 테스트가 읽기 결과에 흔들리지 않게.
  readMallAvailabilityManyMock.mockReturnValue(new Promise(() => {}));
});

describe('판매상품에서 등록 (ADR-0013)', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /4건 보내기/ }));

    await waitFor(() => {
      expect(fillKidsnoteMock).toHaveBeenCalledTimes(2);
    });
    // 엑셀은 파일 하나에 2건, 폼은 1건씩 2번. 작업은 3개다.
    expect(generateWingExcelMock).toHaveBeenCalledTimes(1);
    expect(generateWingExcelMock).toHaveBeenCalledWith(['c1', 'c2'], expect.anything());
    expect(downloadWingExcelMock).toHaveBeenCalledTimes(1);
  });

  it('보냈다고 등록됐다고 말하지 않는다', async () => {
    render(<MallListingsPage />);
    goToWizard();
    selectProduct('킬러볼 스피너 키링');
    goNext();
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));
    goNext();
    fireEvent.click(screen.getByRole('button', { name: /1건 보내기/ }));

    await waitFor(() => {
      expect(screen.getByText('전송 완료')).toBeInTheDocument();
    });
    expect(screen.getByText('전송까지 끝났습니다. 아직 등록은 아닙니다.')).toBeInTheDocument();
    expect(screen.getByText('화면에서 등록 신청 버튼을 누르세요.')).toBeInTheDocument();

    // '등록 확인됨' 은 0 이어야 한다 — 폼을 채운 것은 등록이 아니다.
    const confirmedCard = screen.getByText('등록 확인됨').parentElement as HTMLElement;
    expect(within(confirmedCard).getByText('0')).toBeInTheDocument();
  });

  it('한 몰이 실패해도 다음 몰을 계속 보낸다', async () => {
    fillKidsnoteMock.mockRejectedValue(new Error('확장을 새로고침하세요'));
    render(<MallListingsPage />);
    goToWizard();
    selectProduct('킬러볼 스피너 키링');
    goNext();
    fireEvent.click(screen.getByRole('checkbox', { name: '쿠팡 WING 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '키즈노트 선택' }));
    goNext();
    fireEvent.click(screen.getByRole('button', { name: /2건 보내기/ }));

    await waitFor(() => {
      expect(screen.getByText('확장을 새로고침하세요')).toBeInTheDocument();
    });
    expect(generateWingExcelMock).toHaveBeenCalledTimes(1);
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

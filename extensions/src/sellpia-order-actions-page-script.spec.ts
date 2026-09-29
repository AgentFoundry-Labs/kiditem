import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/sellpia-order-actions.js?raw';

// 셀피아 주문 작업 페이지 스크립트(MAIN world 파일, 옛 worker.js `injectSellpiaOrderFile`과 옛 셀피아
// 후처리 모듈의 `driveStep` 이식)를 실제 파일 그대로 돌린다. 가짜는 페이지 경계(window 전역·document·시계)뿐이다. 시계는 기다리는 만큼
// 바로 흘러가 옛 대기 상한이 그대로 걸린다. 사례는 옛 order-collector-sellpia-* 테스트의 기록 그대로다.

type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
type Element = Record<string, unknown>;

interface Page {
  window: Record<string, unknown>;
  elements: Record<string, Element | null>;
  prompts: Array<{ message: string; buttons: string[] }>;
  clicked: string[];
  dialogs: string[];
  pager: string | null;
  now: number;
}

function load(setup: (page: Page) => void = () => undefined) {
  const page: Page = { window: { __kiditemPageCalls: {}, location: { pathname: '/order_collect.html' } }, elements: {}, prompts: [], clicked: [], dialogs: [], pager: null, now: 0 };
  setup(page);
  const button = (label: string): Element => ({
    textContent: label,
    click: () => {
      page.clicked.push(label);
      page.prompts.pop();
    },
  });
  const document = {
    getElementById: (id: string) => page.elements[id] ?? null,
    querySelector: (selector: string) => {
      if (selector === '#pager .slick-pager-status') return page.pager === null ? null : { textContent: page.pager };
      if (selector.includes('password')) return page.window.passwordInput ? {} : null;
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector === '.jqibuttons button') return (page.prompts.at(-1)?.buttons ?? []).map(button);
      if (selector === '.jqimessage') return page.prompts.map((prompt) => ({ textContent: prompt.message }));
      if (selector.includes('.jconfirm')) return page.dialogs.map((text) => ({ hidden: false, textContent: text }));
      return [];
    },
    createElement: () => {
      let html = '';
      return {
        set innerHTML(value: string) { html = value; },
        get textContent() { return html.replace(/<[^>]*>/g, ''); },
      };
    },
  };
  const setTimeout = (resolve: () => void, ms: number) => {
    page.now += ms;
    resolve();
  };
  const clock = { now: () => page.now };
  class FakeDataTransfer {
    files: unknown[] = [];
    items = { add: (file: unknown) => this.files.push(file) };
  }
  class FakeFile {
    constructor(readonly parts: unknown[], readonly name: string) {}
  }
  new Function('window', 'document', 'setTimeout', 'Date', 'File', 'DataTransfer', 'Event', 'atob', source)(
    page.window,
    document,
    setTimeout,
    clock,
    FakeFile,
    FakeDataTransfer,
    class FakeEvent {},
    (value: string) => atob(value),
  );
  const calls = page.window.__kiditemPageCalls as Record<string, Handler>;
  return { page, inject: calls['sellpia.injectOrderFile']!, step: calls['sellpia.orderStep']! };
}

/** 주문접수 화면: 판매처 선택·파일 칸·[주문접수]. 누르면 `onSubmit`이 대기 행을 바꾼다. */
function uploadScreen(page: Page, options: { items?: Element[]; onSubmit?: (items: Element[]) => Element[]; shops?: string[] } = {}) {
  let items = options.items ?? [];
  const select: Element = { options: [{ value: '', textContent: '' }, ...(options.shops ?? ['키드키즈']).map((shop, index) => ({ value: `shop-${index}`, textContent: shop }))], value: '' };
  Object.setPrototypeOf(select, { dispatchEvent() {} });
  page.elements.search_om_shop = select;
  page.elements.userfile = { files: [], dispatchEvent() {} };
  page.elements.btn_om_upload = { click: () => { items = options.onSubmit ? options.onSubmit(items) : [...items, { group_no: 'p_NEW-1' }, { group_no: 'p_NEW-2' }]; } };
  page.elements.om_excelformed = null;
  page.window.jQuery = { active: 0 };
  page.window.dataView = { getLength: () => items.length, getItems: () => items };
  return select;
}

const FILE = { shopName: null, fileName: 'orders.xlsx', fileBase64: btoa('orders'), targetOrderNumbers: ['NEW-1', 'NEW-2'] };

describe('sellpia order actions page script — 주문 파일 주입(옛 injectSellpiaOrderFile)', () => {
  it('기준 행이 안정된 뒤 [주문접수]를 누르고, 행이 늘면 submitted와 이번에 새로 받아들여진 대상 주문번호만 돌려준다', async () => {
    const { inject } = load((page) => uploadScreen(page, { items: [{ group_no: 'provider_OLDER-1' }], onSubmit: (items) => [...items, { group_no: 'provider_NEW-1' }, { group_no: 'provider_NEW-1' }] }));
    const result = await inject({ ...FILE, targetOrderNumbers: ['OLDER-1', 'NEW-1'] });
    expect(result).toMatchObject({ success: true, outcome: 'submitted', acceptedRows: 2, pendingRows: 3, pendingRowsBefore: 1, acceptedTargetOrderNumbers: ['NEW-1'] });
  });

  it('누르기 전 실패(디코딩·버튼 없음·대기 목록 못 읽음)는 모두 not_submitted이고 누르지 않는다', async () => {
    const decoded = load((page) => uploadScreen(page));
    await expect(decoded.inject({ ...FILE, fileBase64: '%%%' })).resolves.toMatchObject({ outcome: 'not_submitted' });

    const missing = load((page) => {
      uploadScreen(page);
      page.elements.btn_om_upload = null;
    });
    await expect(missing.inject(FILE)).resolves.toMatchObject({ outcome: 'not_submitted' });

    let clicked = false;
    const noGrid = load((page) => {
      uploadScreen(page);
      page.window.dataView = null;
      page.elements.btn_om_upload = { click: () => { clicked = true; } };
    });
    await expect(noGrid.inject(FILE)).resolves.toMatchObject({ outcome: 'not_submitted' });
    expect(clicked).toBe(false);
  });

  it('판매처는 별칭 표로 찾고(쿠팡직배송 → 쿠팡-직배송), 목록에 없으면 not_submitted', async () => {
    const aliased = load((page) => uploadScreen(page, { shops: ['(주)키즈노트(외부몰)', '쿠팡-직배송'] }));
    await expect(aliased.inject({ ...FILE, shopName: '쿠팡 직배송' })).resolves.toMatchObject({ outcome: 'submitted', shop: '쿠팡-직배송' });

    const unknown = load((page) => uploadScreen(page));
    await expect(unknown.inject({ ...FILE, shopName: '없는몰' })).resolves.toMatchObject({
      outcome: 'not_submitted',
      error: "셀피아 판매처 목록에서 '없는몰' 을(를) 찾지 못했습니다. 셀피아 거래처 등록을 확인해주세요.",
    });
  });

  it('dataView가 없으면 화면 pager "전체 N 개"로 행 수를 읽는다', async () => {
    const { page, inject } = load((page) => {
      uploadScreen(page);
      page.window.dataView = null;
      page.pager = '전체 0 개';
      page.elements.btn_om_upload = { click: () => { page.pager = '전체 1,234 개'; } };
    });
    const result = await inject(FILE);
    expect(page.pager).toBe('전체 1,234 개');
    expect(result).toMatchObject({ outcome: 'submitted', acceptedRows: 1_234, pendingRows: 1_234 });
  });

  it('행이 늘었으면 같은 결과 창의 중복 경고가 있어도 submitted, 행이 그대로인데 실패 문구면 unknown(확인 필요)', async () => {
    const partial = load((page) => {
      uploadScreen(page);
      page.dialogs.push('일부 주문접수에 실패했습니다. 이미 수집된 주문');
    });
    await expect(partial.inject(FILE)).resolves.toMatchObject({ outcome: 'submitted', acceptedRows: 2 });

    const rejected = load((page) => {
      uploadScreen(page, { onSubmit: (items) => items });
      page.dialogs.push('엑셀 업로드에 실패했습니다');
    });
    await expect(rejected.inject(FILE)).resolves.toMatchObject({ outcome: 'unknown', error: '셀피아 주문접수 결과 확인 필요: 엑셀 업로드에 실패했습니다' });

    const silent = load((page) => uploadScreen(page, { onSubmit: (items) => items }));
    await expect(silent.inject(FILE)).resolves.toMatchObject({ outcome: 'unknown' });
  });

  it('로그인 화면이면 누르지 않고 login_required', async () => {
    const { inject } = load((page) => {
      uploadScreen(page);
      page.window.location = { pathname: '/login.html' };
    });
    await expect(inject(FILE)).resolves.toEqual({ success: false, loginRequired: true, outcome: 'not_submitted' });
  });
});

/** 셀피아 그리드 화면(dataView·grid·$.prompt). `onClick`이 버튼마다 뜨는 확인창·바뀌는 행을 정한다. */
function gridScreen(page: Page, items: Element[], buttons: Record<string, () => void> = {}) {
  page.window.jQuery = { active: 0 };
  page.window.dataView = { getLength: () => items.length, getItems: () => items };
  page.window.grid = { setSelectedRows: (rows: number[]) => { page.window.selected = rows; } };
  for (const [id, onClick] of Object.entries(buttons)) {
    page.elements[id] = { click: () => { page.clicked.push(id); onClick(); } };
  }
}

describe('sellpia order actions page script — 단계(옛 driveStep)', () => {
  it('verify는 재고매칭 화면이면 [조회] 뒤 대상 주문번호를 접두어(_:|/ -)까지 맞춰 찾고, 없는 번호를 따로 돌려준다', async () => {
    const { page, step } = load((page) => gridScreen(page, [
      { c_group_no: 'om_ORDER-1', c_receiver: '홍길동', c_provider_name: '키드키즈' },
      { ord_no: 'XORDER-2' },
    ], { btn_search: () => page.prompts.push({ message: '조회 조건을 초기화할까요?', buttons: ['예'] }) }));
    const result = await step({ step: 'verify', targetOrderNumbers: ['ORDER-1', 'ORDER-2'] });
    expect(page.clicked).toEqual(['btn_search', '예']);
    expect(result).toMatchObject({ success: true, foundCount: 1, missing: ['ORDER-2'], found: [{ orderNo: 'ORDER-1', receiver: '홍길동', provider: '키드키즈' }] });
  });

  it('orderSnapshot은 화면 행을 주문번호로 한 번씩 읽는다(누르는 것은 [조회]뿐)', async () => {
    const { page, step } = load((page) => gridScreen(page, [
      { c_group_no: 'A-1', c_receiver: '<b>홍</b>', c_provider_name: '몰' },
      { group_no: 'A-1' },
      { ord_no: 'B-2', receiver: '김', provider_name: '몰2' },
    ]));
    await expect(step({ step: 'orderSnapshot', targetOrderNumbers: [] })).resolves.toEqual({
      success: true,
      rowCount: 3,
      orderCount: 2,
      rows: [{ orderNo: 'A-1', receiver: '홍', provider: '몰' }, { orderNo: 'B-2', receiver: '김', provider: '몰2' }],
    });
    expect(page.clicked).toEqual([]);
  });

  it('그리드·jQuery가 없으면 unreadable로 답한다(화면을 못 읽음)', async () => {
    const noJquery = load();
    await expect(noJquery.step({ step: 'orderSnapshot', targetOrderNumbers: [] })).resolves.toMatchObject({ success: false, unreadable: true });
    const noGrid = load((page) => { page.window.jQuery = { active: 0 }; });
    await expect(noGrid.step({ step: 'register', targetOrderNumbers: [] })).resolves.toMatchObject({ success: false, unreadable: true });
  });

  it('register는 [등록] → "기 등록된 내용 유지"로 답하고 결과 문장을 돌려준다', async () => {
    const { page, step } = load((page) => gridScreen(page, [{ group_no: '1' }, { group_no: '2' }], {
      save_b: () => {
        page.prompts.push({ message: '정리된 내용을 등록합니다', buttons: ['기 등록된 내용 유지', '취소'] });
        page.window.afterConfirm = true;
      },
    }));
    // 확인에 답하면 결과 창이 뜬다.
    const original = page.window.jQuery as { active: number };
    Object.defineProperty(original, 'active', { get: () => { if (page.window.afterConfirm && page.clicked.includes('기 등록된 내용 유지') && page.prompts.length === 0) page.prompts.push({ message: '2건이 등록되었습니다', buttons: ['Ok'] }); return 0; } });
    await expect(step({ step: 'register', targetOrderNumbers: [] })).resolves.toEqual({ success: true, registered: 2, message: '2건이 등록되었습니다' });
    expect(page.clicked).toEqual(['save_b', '기 등록된 내용 유지', 'Ok']);
  });

  it('register는 대기 행이 없으면 누르지 않고 empty로 답한다', async () => {
    const { page, step } = load((page) => gridScreen(page, [], { save_b: () => undefined }));
    await expect(step({ step: 'register', targetOrderNumbers: [] })).resolves.toMatchObject({ success: false, empty: true });
    expect(page.clicked).toEqual([]);
  });

  it('stockmatch는 [조회] → 자동합포 → 자동재고매칭 뒤 택배비 행을 뺀 미매칭 행을 보고한다', async () => {
    const { page, step } = load((page) => gridScreen(page, [
      { c_group_no: 'G-1', c_prd_name: '색종이', c_result: '재고매칭' },
      { c_group_no: 'G-2', c_prd_name: '크레파스', c_result: '', c_receiver: '김', c_provider_name: '몰' },
      { c_group_no: 'G-3', c_prd_name: '택배비', c_result: '' },
    ], {
      btn_search: () => undefined,
      btn_tie: () => page.prompts.push({ message: '자동합포 하시겠습니까', buttons: ['자동합포 리스트'] }),
      btn_smatch: () => page.prompts.push({ message: '자동재고매칭을 계속할까요', buttons: ['예'] }),
    }));
    const result = await step({ step: 'stockmatch', targetOrderNumbers: [] });
    expect(page.clicked).toEqual(['btn_search', 'btn_tie', '자동합포 리스트', 'btn_smatch', '예']);
    expect(result).toMatchObject({ success: true, listCount: 3, productRows: 2, matched: 1, unmatchedCount: 1, unmatched: [{ groupNo: 'G-2', receiver: '김', provider: '몰', product: '크레파스', option: '', result: '미매칭' }] });
  });

  it('invoice는 대상 주문번호 행만 골라 [송장번호채번]을 누르고 발급 행을 돌려준다(택배사 1136 고정)', async () => {
    const items: Element[] = [
      { group_no: 'shop_T-1', provider_name: '몰', receiver: '홍(몰)' },
      { group_no: 'OTHER-9' },
      { ord_no: 'T-2' },
    ];
    const { page, step } = load((page) => gridScreen(page, items, {
      btn_get_auto_delinum: () => {
        page.prompts.push({ message: '송장번호를 채번합니다. 진행할까요', buttons: ['예'] });
        items[0]!.delinum = 'INV-1';
        items[2]!.delinum = 'INV-2';
      },
    }));
    const result = await step({ step: 'invoice', targetOrderNumbers: ['T-1', 'T-2', 'T-3'] });
    expect(page.window.selected).toEqual([0, 2]);
    // [송장번호채번]은 정확히 한 번, 확인창에 "예" 한 번(비가역 — 두 번 누르면 이중 채번).
    expect(page.clicked).toEqual(['btn_get_auto_delinum', '예']);
    expect(result).toMatchObject({
      success: true,
      pressed: true,
      selectedTargetOrderNumbers: ['T-1', 'T-2'],
      missingTargetCount: 1,
      rows: [
        { ordNo: 'T-1', invNo: 'INV-1', courier: '1136', provider: '몰', receiver: '홍' },
        { ordNo: 'T-2', invNo: 'INV-2', courier: '1136' },
      ],
    });
  });

  it('invoice는 [송장번호채번]을 누른 뒤 확인창이 안 뜨거나 처리기가 던지면 pressed:true로 답한다(다시 실행하면 이중 채번 — 확인 대기로 간다)', async () => {
    const noConfirm = load((page) => gridScreen(page, [{ group_no: 'T-1' }], { btn_get_auto_delinum: () => undefined }));
    await expect(noConfirm.step({ step: 'invoice', targetOrderNumbers: ['T-1'] })).resolves.toMatchObject({ success: false, pressed: true, error: '송장채번 확인창이 표시되지 않았습니다.' });
    expect(noConfirm.page.clicked).toEqual(['btn_get_auto_delinum']);

    const thrown = load((page) => gridScreen(page, [{ group_no: 'T-1' }], {
      btn_get_auto_delinum: () => {
        throw new Error('page blew up');
      },
    }));
    await expect(thrown.step({ step: 'invoice', targetOrderNumbers: ['T-1'] })).resolves.toMatchObject({ success: false, pressed: true });
  });

  it('invoice는 일치 행이 0이거나 대기 행이 없으면 누르지 않고 pressed:false로 답한다(대기 행 전체 채번 금지)', async () => {
    const noMatch = load((page) => gridScreen(page, [{ group_no: 'OTHER-1' }], { btn_get_auto_delinum: () => undefined }));
    await expect(noMatch.step({ step: 'invoice', targetOrderNumbers: ['T-1'] })).resolves.toMatchObject({ success: true, pressed: false, selectedTargetOrderNumbers: [], missingTargetCount: 1 });
    expect(noMatch.page.clicked).toEqual([]);

    const empty = load((page) => gridScreen(page, [], { btn_get_auto_delinum: () => undefined }));
    await expect(empty.step({ step: 'invoice', targetOrderNumbers: ['T-1'] })).resolves.toMatchObject({ success: true, pressed: false });
    expect(empty.page.clicked).toEqual([]);
  });

  it('로그인 화면이면 어느 단계도 누르지 않고 login_required', async () => {
    const { page, step } = load((page) => {
      gridScreen(page, [{ group_no: '1' }], { save_b: () => undefined });
      page.window.passwordInput = true;
    });
    await expect(step({ step: 'register', targetOrderNumbers: [] })).resolves.toEqual({ success: false, loginRequired: true });
    expect(page.clicked).toEqual([]);
  });
});

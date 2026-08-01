import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRocketPurchaseWorkflow } from "@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow";
import type {
  RocketPurchasePreviewReason,
  RocketPurchasePreviewResponse,
} from "@kiditem/shared/rocket-purchase-preview";
import { RocketConfirmPanel } from "./RocketConfirmPanel";

vi.mock(
  "@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow")
    >()),
    useRocketPurchaseWorkflow: vi.fn(),
  }),
);
vi.mock("./RocketMatchStatusModal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./RocketMatchStatusModal")>()),
  RocketMatchStatusModal: () => null,
}));
vi.mock("./RocketInlineRecipeEditor", () => ({
  RocketInlineRecipeEditor: ({
    productName,
    onCancel,
    onSaved,
  }: {
    productName: string;
    onCancel: () => void;
    onSaved: () => Promise<void>;
  }) => (
    <section aria-label={`${productName} Sellpia 재고 연결`}>
      <button type="button" onClick={onCancel}>
        인라인 닫기
      </button>
      <button type="button" onClick={() => void onSaved()}>
        인라인 저장
      </button>
    </section>
  ),
}));

const setReviewedQuantity = vi.fn();
const setPreviewDirty = vi.fn();
const setShortageReasons = vi.fn();
const basePreview: RocketPurchasePreviewResponse = {
  collectionRunId: "22222222-2222-4222-8222-222222222222",
  catalog: null,
  inventoryGeneration: "1",
  rows: [
    {
      poLineId: "PO-1:PRODUCT-1:1",
      poNumber: "PO-1",
      productNo: "PRODUCT-1",
      productName: "상품 1",
      plannedDeliveryDate: "2026-07-20",
      orderQuantity: 3,
      recommendedQuantity: 3,
      maxQuantity: 3,
      editedQuantity: null,
      reason: null,
      channelSkuId: "33333333-3333-4333-8333-333333333333",
      masterProductId: "44444444-4444-4444-8444-444444444444",
      productVariantId: "55555555-5555-4555-8555-555555555555",
      components: [
        {
          sellpiaInventorySkuId: "66666666-6666-4666-8666-666666666666",
          code: "SP-100",
          name: "Sellpia 연결 상품",
          optionName: "랜덤",
          quantity: 1,
          currentStock: 3,
          isActive: true,
        },
      ],
    },
  ],
};

const baseWorkflow = {
  editedQuantities: {},
  setReviewedQuantity,
  preview: basePreview,
  displayPreview: basePreview,
  sourceRows: [
    {
      poLineId: "PO-1:PRODUCT-1:1",
      poNumber: "PO-1",
      vendorId: "VENDOR-1",
      productNo: "PRODUCT-1",
      barcode: "8800000000001",
      productName: "상품 1",
      orderQty: 3,
      plannedDeliveryDate: "2026-07-20",
    },
  ],
  previewDirty: false,
  setPreviewDirty,
  shortageReasons: {},
  setShortageReasons,
  exporting: false,
  setTemplateFile: vi.fn(),
  loading: false,
  collecting: false,
  error: null as string | null,
  collectionWarning: null,
  canExport: false,
  recalculate: vi.fn(),
  revalidateEditedQuantities: vi.fn(),
  exportAndDownload: vi.fn(),
};

function renderPanel(options?: {
  preview?: RocketPurchasePreviewResponse | null;
  workflow?: Partial<typeof baseWorkflow>;
  // 날짜 상태는 워크스페이스가 소유하므로 props 로 주입한다(클릭 없이 복원되는 경로까지 포함).
  selectedDate?: string | null;
  selectedDateSourceRunCount?: number;
  selectedSourceImportRunId?: string | null;
}) {
  const sourceRunCount = options?.selectedDateSourceRunCount ?? 0;
  vi.mocked(useRocketPurchaseWorkflow).mockReturnValue({
    ...baseWorkflow,
    ...options?.workflow,
    preview: options?.preview === undefined ? basePreview : options.preview,
    // 표는 displayPreview 를 그리므로 preview 오버라이드를 그대로 따라가게 한다.
    // 표시 전용 행(이번 확인 대상이 아닌 과거 발주)을 검증할 때만 따로 지정한다.
    displayPreview:
      options?.workflow?.displayPreview !== undefined
        ? options.workflow.displayPreview
        : options?.preview === undefined
          ? basePreview
          : options.preview,
  } as ReturnType<typeof useRocketPurchaseWorkflow>);
  return render(
    <RocketConfirmPanel
      onSaved={vi.fn()}
      activeMonth="2026-07"
      channelAccountId="11111111-1111-4111-8111-111111111111"
      channelAccountName="로켓 1호점"
      hasConfiguredVendorId
      from="2026-07-01"
      to="2026-07-31"
      selectedSourceImportRunId={options?.selectedSourceImportRunId ?? null}
      selectedDate={options?.selectedDate ?? null}
      selectedDateSourceRunCount={sourceRunCount}
      onActivity={vi.fn()}
      onOrdersChanged={vi.fn()}
      renderOrderExplorer={({ onSelectDate }) => (
        <>
          <button type="button" onClick={() => onSelectDate("2026-07-21", 0)}>
            빈 날짜
          </button>
          <button type="button" onClick={() => onSelectDate("2026-07-22", 2)}>
            여러 수집본 날짜
          </button>
        </>
      )}
    />,
  );
}

describe("<RocketConfirmPanel />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("labels saved-date loading separately from a fresh Coupang collection", () => {
    renderPanel({ workflow: { loading: true, collecting: false } });

    expect(
      screen.getByRole("button", { name: "저장본 계산 중…" }),
    ).toBeDisabled();
  });

  it("runs the shared Rocket collection workflow used by the dashboard", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "이 달 쿠팡 PO 수집·보관" }));

    await waitFor(() => {
      expect(baseWorkflow.recalculate).toHaveBeenCalledTimes(1);
    });
  });

  it("passes the selected delivery date to the preview workflow", () => {
    renderPanel({ selectedDate: "2026-07-21" });

    expect(useRocketPurchaseWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ selectedDeliveryDate: "2026-07-21" }),
    );
  });

  it("defaults a newly shortened row to the inventory-shortage reason", () => {
    renderPanel();
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "PO-1 확정재고" }),
      {
        target: { value: "2" },
      },
    );

    const updateReasons = setShortageReasons.mock.calls.at(-1)?.[0] as (
      current: Record<string, string>,
    ) => Record<string, string>;
    expect(updateReasons({})).toEqual({
      "PO-1:PRODUCT-1:1": "협력사 재고부족 - 수요예측 오류",
    });
    expect(setReviewedQuantity).toHaveBeenCalledWith("PO-1:PRODUCT-1:1", 2);
    expect(
      screen.getByRole("button", { name: "쿠팡 엑셀 다운로드" }),
    ).toBeDisabled();
  });

  it("renders one preview heading and one current-preview matching action", () => {
    renderPanel();
    const heading = screen.getByText(/미리보기 · 편집/);
    expect(heading.textContent?.match(/미리보기 · 편집/g)).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /매칭 현황/ })).toHaveLength(
      1,
    );
  });

  it("does not render the account-wide product and stock matching status panel", () => {
    renderPanel({
      preview: {
        ...basePreview,
        catalog: { recipeAutomation: {} } as never,
      },
    });

    expect(screen.queryByText("상품·재고 매칭 상태")).not.toBeInTheDocument();
  });

  it.each([["mapping_required", "상품 연결 필요"]] as const)(
    "blocks quantity review for %s and routes the operator to matching",
    (reason, label) => {
      renderPanel({ preview: previewWithReason(reason) });

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(
        screen.getByRole("spinbutton", { name: "PO-1 확정재고" }),
      ).toBeDisabled();
      // 사유를 고를 수 없는 행은 select 자체를 그리지 않는다(옵션 수천 개 렌더 방지).
      expect(
        screen.queryByRole("combobox", { name: "PO-1 납품부족사유" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: `${label} 해결` }),
      ).toHaveAttribute(
        "href",
        "/product-hub/matching?channelAccountId=11111111-1111-4111-8111-111111111111&search=PRODUCT-1&focusOptionId=33333333-3333-4333-8333-333333333333",
      );
    },
  );

  it("repairs a configuration-required recipe in the Rocket row and recalculates the saved source", async () => {
    const revalidateEditedQuantities = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      preview: previewWithReason("configuration_required"),
      workflow: { revalidateEditedQuantities },
    });

    expect(screen.getByText("재고 구성 필요")).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "PO-1 확정재고" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: "재고 구성 필요 해결" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "상품 1 Sellpia 재고 연결" }),
    );
    const editor = screen.getByRole("region", {
      name: "상품 1 Sellpia 재고 연결",
    });
    expect(editor).toBeInTheDocument();

    fireEvent.click(within(editor).getByRole("button", { name: "인라인 저장" }));
    await waitFor(() =>
      expect(revalidateEditedQuantities).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.queryByRole("region", { name: "상품 1 Sellpia 재고 연결" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["collection_incomplete", "수집 검증 필요"],
    ["vendor_mismatch", "공급사 검증 필요"],
  ] as const)(
    "blocks quantity and shortage editing for %s",
    (reason, label) => {
      renderPanel({ preview: previewWithReason(reason) });

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(
        screen.getByRole("spinbutton", { name: "PO-1 확정재고" }),
      ).toBeDisabled();
      // 사유를 고를 수 없는 행은 select 자체를 그리지 않는다(옵션 수천 개 렌더 방지).
      expect(
        screen.queryByRole("combobox", { name: "PO-1 납품부족사유" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: `${label} 해결` }),
      ).not.toBeInTheDocument();
    },
  );

  it("fixes an insufficient-capacity row quantity at zero", () => {
    renderPanel({ preview: previewWithReason("insufficient_capacity") });

    expect(screen.getByText("구성 완료")).toBeInTheDocument();
    const quantity = screen.getByRole("spinbutton", {
      name: "PO-1 확정재고",
    });
    expect(quantity).toHaveValue(0);
    expect(quantity).toHaveAttribute("max", "0");
    expect(quantity).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "PO-1 납품부족사유" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("columnheader", { name: "Sellpia 원재고" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "납품가능" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "확정재고" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "약정" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "가용재고" }),
    ).not.toBeInTheDocument();
  });

  it("shows the linked Sellpia product and opens inline correction for a configured recipe", () => {
    renderPanel({ preview: previewWithReason("insufficient_capacity") });

    // 매칭된 Sellpia 상품명은 쿠팡 상품명 바로 밑에 붙는다.
    expect(screen.getByText("SP-100 · Sellpia 연결 상품")).toBeInTheDocument();
    // 원재고 칸은 재고 숫자와 옵션만, 구성 배수는 자체 열에 있다.
    expect(screen.getByText("랜덤").parentElement).toHaveTextContent("3랜덤");
    expect(
      screen.getByRole("columnheader", { name: "구성" }),
    ).toBeInTheDocument();
    expect(screen.getByText("×1")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "상품 1 Sellpia 재고 수정" }),
    );
    expect(
      screen.getByRole("region", { name: "상품 1 Sellpia 재고 연결" }),
    ).toBeInTheDocument();
  });

  it("distinguishes Sellpia physical stock from the per-line deliverable limit", () => {
    const preview = previewWithReason("insufficient_capacity");
    renderPanel({
      preview: {
        ...preview,
        rows: preview.rows.map((row) => ({
          ...row,
          orderQuantity: 18,
          recommendedQuantity: 0,
          maxQuantity: 0,
          components: row.components.map((component) => ({
            ...component,
            currentStock: 307,
            quantity: 4,
          })),
        })),
      },
    });

    expect(
      screen.getByRole("columnheader", { name: "Sellpia 원재고" }),
    ).toBeInTheDocument();
    expect(screen.getByText("307")).toBeInTheDocument();
    expect(screen.getByText("×4")).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "PO-1 납품가능 0개" }),
    ).toBeInTheDocument();
  });

  it("marks a row with no Sellpia component as unmatched in red", () => {
    const preview = previewWithReason("configuration_required");
    renderPanel({ preview });

    const unmatched = screen.getByText("Sellpia 미매칭");
    expect(unmatched).toBeInTheDocument();
    expect(unmatched.className).toContain("text-rose-600");
  });

  it("narrows the table to unmatched rows and to zero-confirmed rows", () => {
    const preview = previewWithReason("configuration_required"); // 재고 구성 없음 → 미매칭
    const matched = {
      ...basePreview.rows[0]!,
      poLineId: "PO-3:PRODUCT-3:1",
      poNumber: "PO-3",
      productNo: "PRODUCT-3",
      productName: "상품 3",
    };
    renderPanel({
      preview,
      workflow: {
        displayPreview: { ...preview, rows: [...preview.rows, matched] },
        sourceRows: [],
      },
    });

    // 기본은 전체가 보인다.
    expect(screen.getByText("상품 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^재고 불일치 \d/ }));
    expect(screen.queryByText("상품 3")).not.toBeInTheDocument();
    expect(screen.getByText("Sellpia 미매칭")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^확정재고 0 \d/ }));
    // 상품 3 은 재고 3 · 구성 ×1 · 발주 3 이라 확정이 3 이므로 0 필터에서 빠진다.
    expect(screen.queryByText("상품 3")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^전체 \d/ }));
    expect(screen.getByText("상품 3")).toBeInTheDocument();
  });

  it("zeroes the confirmed quantity when stock cannot cover the whole order", () => {
    // 전량 아니면 0. 47/48 같은 부분 확정을 기본값으로 만들지 않는다.
    const preview = previewWithReason("insufficient_capacity");
    const partial = {
      ...preview.rows[0]!,
      poLineId: "PO-7:PRODUCT-7:1",
      poNumber: "PO-7",
      productNo: "PRODUCT-7",
      productName: "상품 7",
      orderQuantity: 48,
      maxQuantity: 0,
      recommendedQuantity: 0,
      reason: null,
      components: preview.rows[0]!.components.map((component) => ({
        ...component,
        currentStock: 47,
        quantity: 1,
      })),
    };
    renderPanel({
      preview,
      workflow: {
        displayPreview: { ...preview, rows: [...preview.rows, partial] },
      },
    });

    expect(
      screen.getByRole("spinbutton", { name: "PO-7 확정재고" }),
    ).toHaveValue(0);
    // 근거는 계속 보여준다: 발주 48 중 47 만 댈 수 있다.
    expect(
      screen.getByRole("cell", { name: "PO-7 납품가능 참고 47개" }),
    ).toBeInTheDocument();
  });

  it("prefills the confirmed quantity when stock covers the order", () => {
    // 재고가 충분하면 조작자가 숫자를 다시 타이핑하지 않아도 되게 미리 채운다.
    const preview = previewWithReason("insufficient_capacity");
    const plentiful = {
      ...preview.rows[0]!,
      poLineId: "PO-8:PRODUCT-8:1",
      poNumber: "PO-8",
      productNo: "PRODUCT-8",
      productName: "상품 8",
      orderQuantity: 24,
      maxQuantity: 0,
      recommendedQuantity: 0,
      reason: null,
      components: preview.rows[0]!.components.map((component) => ({
        ...component,
        currentStock: 63,
        quantity: 1,
      })),
    };
    renderPanel({
      preview,
      workflow: {
        displayPreview: { ...preview, rows: [...preview.rows, plentiful] },
      },
    });

    expect(
      screen.getByRole("spinbutton", { name: "PO-8 확정재고" }),
    ).toHaveValue(24);
  });

  it("keeps an insufficient-capacity row at zero even with stock on hand", () => {
    // 부분 확정이 금지된 상태라 재고가 남아 있어도 0 이어야 한다.
    renderPanel({ preview: previewWithReason("insufficient_capacity") });

    expect(
      screen.getByRole("spinbutton", { name: "PO-1 확정재고" }),
    ).toHaveValue(0);
  });

  it("shows standalone stock capacity for rows outside this confirmation round", () => {
    // 표시용 스코프는 이미 지나간 발주까지 담고, 서버는 그 행들에도 재고를 순서대로 배분해
    // maxQuantity 를 0 으로 만든다. 참고 행은 배분이 아니라 현재 재고 단독으로 계산해야
    // 날짜별 목록이 전부 0 으로 보이지 않는다.
    const preview = previewWithReason("insufficient_capacity");
    const starved = {
      ...preview.rows[0]!,
      poLineId: "PO-9:PRODUCT-9:1",
      poNumber: "PO-9",
      productNo: "PRODUCT-9",
      productName: "상품 9",
      orderQuantity: 18,
      maxQuantity: 0,
      recommendedQuantity: 0,
      components: preview.rows[0]!.components.map((component) => ({
        ...component,
        currentStock: 307,
        quantity: 4,
      })),
    };
    renderPanel({
      preview,
      workflow: { displayPreview: { ...preview, rows: [...preview.rows, starved] } },
    });

    // 18 = min(발주 18, floor(307 / 4)). 배분값 0 이 아니라 단독 여력이 나와야 한다.
    expect(
      screen.getByRole("cell", { name: "PO-9 납품가능 참고 18개" }),
    ).toBeInTheDocument();
  });

  it("seeds every short row with the default shortage reason", () => {
    const secondRow = {
      ...previewWithReason("insufficient_capacity").rows[0]!,
      poLineId: "PO-2:PRODUCT-2:1",
      poNumber: "PO-2",
      productNo: "PRODUCT-2",
      productName: "상품 2",
      channelSkuId: "77777777-7777-4777-8777-777777777777",
    };
    renderPanel({
      preview: {
        ...previewWithReason("insufficient_capacity"),
        rows: [previewWithReason("insufficient_capacity").rows[0]!, secondRow],
      },
      // 납품부족사유는 엑셀에 실리는 거래처확인요청 행에만 의미가 있으므로 둘 다 검토 대상으로 둔다.
      workflow: {
        sourceRows: [
          baseWorkflow.sourceRows[0]!,
          { ...baseWorkflow.sourceRows[0]!, poLineId: "PO-2:PRODUCT-2:1", poNumber: "PO-2" },
        ],
      },
    });

    // 일괄 적용 UI 는 없앴다. 부족 행은 기본 사유가 자동으로 채워진다.
    expect(
      screen.queryByRole("combobox", { name: "전체 납품부족사유" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "부족 행 전체 적용" }),
    ).not.toBeInTheDocument();

    const updateReasons = setShortageReasons.mock.calls.at(-1)?.[0] as (
      current: Record<string, string>,
    ) => Record<string, string>;
    expect(updateReasons({ existing: "기존 사유" })).toEqual({
      existing: "기존 사유",
      "PO-1:PRODUCT-1:1": "협력사 재고부족 - 수요예측 오류",
      "PO-2:PRODUCT-2:1": "협력사 재고부족 - 수요예측 오류",
    });
  });

  it("recalculates the same saved preview after mapping is reflected", () => {
    const revalidateEditedQuantities = vi.fn();
    renderPanel({
      preview: previewWithReason("mapping_required"),
      workflow: { revalidateEditedQuantities },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "매핑 반영해 다시 계산" }),
    );
    expect(revalidateEditedQuantities).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an empty selected day without introducing a source picker", () => {
    // 클릭 없이 props 만으로 렌더한다 = URL 로 직접 들어오거나 새로고침한 경로.
    const empty = renderPanel({
      preview: null,
      selectedDate: "2026-07-21",
      selectedDateSourceRunCount: 0,
    });
    expect(
      screen.getByText(
        "선택한 날짜에 저장된 발주가 없습니다. 쿠팡에서 새로 수집해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/자동으로 정해지지 않습니다/)).toBeNull();
    empty.unmount();

    renderPanel({
      preview: null,
      selectedDate: "2026-07-22",
      selectedDateSourceRunCount: 2,
    });
    expect(
      screen.queryByText(/자동으로 정해지지 않습니다/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("납품 판단을 시작할 수집본이 없습니다."),
    ).toBeInTheDocument();
  });

  it("explains the empty decision area instead of rendering nothing when the preview failed", () => {
    renderPanel({
      preview: null,
      selectedDate: "2026-07-28",
      selectedDateSourceRunCount: 1,
      workflow: {
        error:
          "셀피아 재고 스냅샷이 최신이 아니어서 납품 수량을 계산할 수 없습니다.",
      },
    });
    expect(
      screen.getByText("납품 판단 영역을 불러오지 못했습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/셀피아 재고 스냅샷이 최신이 아니어서/),
    ).toBeInTheDocument();
  });

  it("explains that saved confirmed POs are not workbook review targets", () => {
    renderPanel({
      preview: { ...basePreview, rows: [] },
      selectedDate: "2026-07-29",
      selectedDateSourceRunCount: 1,
    });

    expect(
      screen.getByText(
        "선택한 날짜의 PO는 저장되어 있지만 모두 발주확정 상태라 엑셀 검토 대상이 아닙니다.",
      ),
    ).toBeInTheDocument();
  });

  it("does not ask the operator to choose a historical collection", () => {
    renderPanel({
      preview: null,
      selectedDate: "2026-07-28",
      selectedDateSourceRunCount: 3,
      selectedSourceImportRunId: null,
    });
    expect(
      screen.queryByText(/자동으로 정해지지|사용할 수집본을 하나/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^수집 2026-07-2/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps every row in the selected PO preview visible", () => {
    const twoRows: RocketPurchasePreviewResponse = {
      ...basePreview,
      rows: [
        basePreview.rows[0]!,
        {
          ...basePreview.rows[0]!,
          poLineId: "PO-2:PRODUCT-2:1",
          poNumber: "PO-2",
        },
      ],
    };
    renderPanel({ preview: twoRows });

    expect(
      screen.getByRole("spinbutton", { name: "PO-1 확정재고" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "PO-2 확정재고" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("이미 제출")).toBeNull();
  });

  it("orders preview rows by unmatched, shortage review, then confirmed", () => {
    const confirmed = {
      ...basePreview.rows[0]!,
      poLineId: "PO-CONFIRMED:PRODUCT-1:1",
      poNumber: "PO-CONFIRMED",
      productName: "확정 상품",
    };
    const shortage = {
      ...basePreview.rows[0]!,
      poLineId: "PO-SHORTAGE:PRODUCT-2:1",
      poNumber: "PO-SHORTAGE",
      productNo: "PRODUCT-2",
      productName: "재고 부족 상품",
      recommendedQuantity: 0,
      maxQuantity: 0,
      reason: "insufficient_capacity" as const,
      components: basePreview.rows[0]!.components.map((component) => ({
        ...component,
        currentStock: 1,
      })),
    };
    const unmatched = {
      ...basePreview.rows[0]!,
      poLineId: "PO-UNMATCHED:PRODUCT-3:1",
      poNumber: "PO-UNMATCHED",
      productNo: "PRODUCT-3",
      productName: "재고 연결 필요 상품",
      recommendedQuantity: 0,
      maxQuantity: 0,
      reason: "configuration_required" as const,
      components: [],
    };

    renderPanel({
      preview: {
        ...basePreview,
        rows: [confirmed, shortage, unmatched],
      },
      workflow: { sourceRows: [] },
    });

    expect(
      screen
        .getAllByRole("spinbutton")
        .map((input) => input.getAttribute("aria-label")),
    ).toEqual([
      "PO-UNMATCHED 확정재고",
      "PO-SHORTAGE 확정재고",
      "PO-CONFIRMED 확정재고",
    ]);
  });

  it("hides the candidate picker once a collection is chosen", () => {
    renderPanel({
      preview: null,
      selectedDate: "2026-07-28",
      selectedDateSourceRunCount: 3,
      selectedSourceImportRunId: "run-3",
    });

    expect(screen.queryByText(/자동으로 정해지지 않습니다/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^수집 2026-07-2/ }),
    ).toBeNull();
  });

  it("does not expose post-download workbook workflow controls", () => {
    renderPanel();

    expect(
      screen.getByRole("spinbutton", { name: "PO-1 확정재고" }),
    ).toBeEnabled();
    expect(screen.queryByText(/쿠팡 업로드·발주확정 대기/)).toBeNull();
    expect(screen.queryByRole("button", { name: "동일 파일 다시 다운로드" })).toBeNull();
    expect(screen.queryByRole("button", { name: "워크북 사용 안 함" })).toBeNull();
  });
});

function previewWithReason(
  reason: RocketPurchasePreviewReason,
): RocketPurchasePreviewResponse {
  return {
    ...basePreview,
    rows: basePreview.rows.map((row) => ({
      ...row,
      reason,
      recommendedQuantity: reason === "insufficient_capacity" ? 2 : 0,
      maxQuantity: reason === "insufficient_capacity" ? 2 : 0,
      masterProductId:
        reason === "mapping_required" ? null : row.masterProductId,
      productVariantId:
        reason === "mapping_required" ? null : row.productVariantId,
      components: reason === "insufficient_capacity" ? row.components : [],
    })),
  };
}

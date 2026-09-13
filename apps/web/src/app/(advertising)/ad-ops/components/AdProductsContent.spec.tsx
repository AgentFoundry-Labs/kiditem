import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdProductRow } from "../hooks/useAdOpsData";
import AdProductsContent from "./AdProductsContent";

const mockUseAdProducts = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useAdOpsData", () => ({
  useAdProducts: mockUseAdProducts,
  useAdsConfig: () => ({ excellent: 300, warning: 200, poor: 100 }),
}));

function productRow(overrides: Partial<AdProductRow>): AdProductRow {
  return {
    vendorItemId: "V1",
    productName: "상품",
    keyword: null,
    onOff: "ON",
    imageUrl: null,
    adSpend: 1000,
    adRevenue: 5000,
    impressions: 100,
    clicks: 10,
    ctr: 10,
    adConversions: 1,
    conversionRate: 10,
    roas: 500,
    campaignName: "캠페인",
    ...overrides,
  };
}

function mockProducts(products: AdProductRow[]) {
  mockUseAdProducts.mockReturnValue({
    products,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

function productNamesInOrder(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]!.textContent ?? "");
}

describe("AdProductsContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a request failure separately from an empty product list", () => {
    mockUseAdProducts.mockReturnValue({
      products: [],
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error("product request failed"),
      refetch: vi.fn(),
    });

    render(<AdProductsContent period="14d" />);

    expect(
      screen.getByText("광고상품 데이터를 불러오지 못했습니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("표시할 광고상품이 없습니다."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("product request failed")).not.toBeInTheDocument();
    expect(
      screen.getByText("광고상품 0건이 아니라 조회 요청이 실패한 상태입니다."),
    ).toBeInTheDocument();
  });

  it("renders the empty state only after a successful zero-row response", () => {
    mockProducts([]);

    render(<AdProductsContent period="month" />);

    expect(screen.getByText("표시할 광고상품이 없습니다.")).toBeInTheDocument();
    expect(
      screen.queryByText("광고상품 데이터를 불러오지 못했습니다."),
    ).not.toBeInTheDocument();
  });

  it("roas null → '-' 렌더, no red badge", () => {
    mockProducts([
      productRow({
        productName: "비율 미수집 상품",
        adSpend: 0,
        adRevenue: 0,
        impressions: 0,
        clicks: 0,
        adConversions: 0,
        ctr: null,
        conversionRate: null,
        roas: null,
      }),
    ]);

    const { container } = render(<AdProductsContent period="14d" />);

    const row = screen.getByRole("row", { name: /비율 미수집 상품/ });
    const cells = within(row).getAllByRole("cell");
    expect(cells[4]).toHaveTextContent(/^0$/);
    expect(cells[8]).toHaveTextContent(/^-$/);
    expect(cells[10]).toHaveTextContent(/^-$/);
    expect(cells[11]).toHaveTextContent(/^-$/);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
    expect(container.querySelector(".text-red-600")).toBeNull();
  });

  it("null ROAS is excluded from ROAS sort (listed after measured rows)", () => {
    mockProducts([
      productRow({ vendorItemId: "A", productName: "ROAS 미측정", roas: null }),
      productRow({ vendorItemId: "B", productName: "ROAS 0", roas: 0 }),
      productRow({ vendorItemId: "C", productName: "ROAS 낮음", roas: 50 }),
      productRow({ vendorItemId: "D", productName: "ROAS 높음", roas: 400 }),
    ]);

    render(<AdProductsContent period="14d" />);
    fireEvent.click(screen.getByRole("button", { name: "ROAS순" }));

    expect(productNamesInOrder()).toEqual([
      "ROAS 높음",
      "ROAS 낮음",
      "ROAS 0",
      "ROAS 미측정",
    ]);
  });
});

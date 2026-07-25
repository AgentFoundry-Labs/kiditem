import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdProductsContent from "./AdProductsContent";

const mockUseAdProducts = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useAdOpsData", () => ({
  useAdProducts: mockUseAdProducts,
  useAdsConfig: () => ({ excellent: 300, warning: 200, poor: 100 }),
}));

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
    mockUseAdProducts.mockReturnValue({
      products: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdProductsContent period="month" />);

    expect(screen.getByText("표시할 광고상품이 없습니다.")).toBeInTheDocument();
    expect(
      screen.queryByText("광고상품 데이터를 불러오지 못했습니다."),
    ).not.toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { RocketInlineRecipeEditor } from "./RocketInlineRecipeEditor";

vi.mock("@/lib/api-client", () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn() },
}));

const candidate = {
  sellpiaInventorySkuId: "66666666-6666-4666-8666-666666666666",
  code: "9633-1",
  name: "큐티 점핑볼 인형 세트",
  optionName: "랜덤",
  barcode: "8800000000001",
  currentStock: 168,
};

function renderEditor(options?: {
  onSaved?: () => Promise<void>;
  onCancel?: () => void;
}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <RocketInlineRecipeEditor
        productVariantId="55555555-5555-4555-8555-555555555555"
        productName="상품 1"
        onSaved={options?.onSaved ?? vi.fn().mockResolvedValue(undefined)}
        onCancel={options?.onCancel ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe("<RocketInlineRecipeEditor />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getParsed).mockResolvedValue({ items: [candidate] });
  });

  it("searches Sellpia inventory by product code or product name without a Rocket barcode default", async () => {
    renderEditor();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const searchbox = screen.getByRole("searchbox", {
      name: "Sellpia 상품 코드 또는 상품명 검색",
    });
    expect(searchbox).toHaveValue("");
    expect(searchbox).toHaveAttribute(
      "placeholder",
      "Sellpia 상품 코드 또는 상품명",
    );
    expect(apiClient.getParsed).not.toHaveBeenCalled();

    fireEvent.change(searchbox, { target: { value: "9633-1" } });

    expect(
      await screen.findByText("9633-1 · 큐티 점핑볼 인형 세트"),
    ).toBeInTheDocument();
    expect(screen.getByText("랜덤 · 현재고 168")).toBeInTheDocument();
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      "/api/products/recipe-component-candidates?search=9633-1&limit=20",
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: "9633-1 재고 추가" }));
    expect(
      screen.getByRole("spinbutton", { name: "9633-1 구성 수량" }),
    ).toHaveValue(1);
    expect(
      screen.getByRole("button", { name: "재고 연결하고 다시 계산" }),
    ).toBeEnabled();
  });

  it("closes immediately on pointer input before async search rerenders the editor", () => {
    const onCancel = vi.fn();
    renderEditor({ onCancel });

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "재고 연결 닫기" }),
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("also closes on the mouse fallback used by browser automation", () => {
    const onCancel = vi.fn();
    renderEditor({ onCancel });

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "재고 연결 닫기" }),
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("creates the empty variant recipe and asks the Rocket preview to recalculate", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    vi.mocked(apiClient.post).mockResolvedValue({
      appliedProductVariantIds: ["55555555-5555-4555-8555-555555555555"],
      unchangedProductVariantIds: [],
    });
    const { invalidate } = renderEditor({ onSaved });

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Sellpia 상품 코드 또는 상품명 검색",
      }),
      { target: { value: "9633-1" } },
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "9633-1 재고 추가" }),
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "9633-1 구성 수량" }),
      {
        target: { value: "12" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "재고 연결하고 다시 계산" }),
    );

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/products/variant-recipes/create-if-empty",
        {
          recipes: [
            {
              productVariantId: "55555555-5555-4555-8555-555555555555",
              components: [
                {
                  sellpiaInventorySkuId: "66666666-6666-4666-8666-666666666666",
                  quantity: 12,
                },
              ],
            },
          ],
        },
      ),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["products", "operations"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["channelProductMappings"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["channelSkuAvailability"],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["inventory"] });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

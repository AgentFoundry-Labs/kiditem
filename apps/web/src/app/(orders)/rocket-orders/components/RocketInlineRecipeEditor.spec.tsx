import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { RocketInlineRecipeEditor } from "./RocketInlineRecipeEditor";

vi.mock("@/lib/api-client", () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const candidate = {
  masterProductId: "66666666-6666-4666-8666-666666666666",
  code: "9633-1",
  name: "큐티 점핑볼 인형 세트",
  optionName: "랜덤",
  barcode: "8800000000001",
  currentStock: 168,
};

function renderEditor(options?: {
  onSaved?: () => Promise<void>;
  onCancel?: () => void;
  existingComponents?: Array<{
    masterProductId: string;
    code: string;
    name: string;
    optionName: string | null;
    currentStock: number;
    quantity: number;
    isActive: boolean;
  }>;
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
        masterProductId="44444444-4444-4444-8444-444444444444"
        channelListingOptionId="55555555-5555-4555-8555-555555555555"
        productName="상품 1"
        existingComponents={options?.existingComponents ?? []}
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
      "/api/products/recipe-component-candidates?search=9633-1&limit=20&stockStatus=in_stock",
      expect.anything(),
    );

    const includeOutOfStock = screen.getByRole("checkbox", {
      name: "품절상품 포함",
    });
    expect(includeOutOfStock).not.toBeChecked();
    fireEvent.click(includeOutOfStock);
    await waitFor(() =>
      expect(apiClient.getParsed).toHaveBeenLastCalledWith(
        "/api/products/recipe-component-candidates?search=9633-1&limit=20&stockStatus=all",
        expect.anything(),
      ),
    );

    fireEvent.click(await screen.findByRole("button", { name: "9633-1 재고 추가" }));
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

  it("keeps the quantity field empty while the operator replaces its value", async () => {
    renderEditor();
    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Sellpia 상품 코드 또는 상품명 검색",
      }),
      { target: { value: "9633-1" } },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "9633-1 재고 추가" }),
    );
    const quantity = screen.getByRole("spinbutton", {
      name: "9633-1 구성 수량",
    });

    fireEvent.change(quantity, { target: { value: "" } });

    expect(quantity).toHaveValue(null);
    expect(
      screen.getByRole("button", { name: "재고 연결하고 다시 계산" }),
    ).toBeDisabled();

    fireEvent.change(quantity, { target: { value: "4" } });

    expect(quantity).toHaveValue(4);
    expect(
      screen.getByRole("button", { name: "재고 연결하고 다시 계산" }),
    ).toBeEnabled();
  });

  it("creates the empty channel option inventory recipe and asks the Rocket preview to recalculate", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    vi.mocked(apiClient.put).mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" });
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
      expect(apiClient.put).toHaveBeenCalledWith(
        "/api/channels/options/55555555-5555-4555-8555-555555555555/inventory-components",
        {
          components: [
            {
              masterProductId: "66666666-6666-4666-8666-666666666666",
              quantity: 12,
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

  it("replaces an existing channel option inventory recipe", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    vi.mocked(apiClient.getParsed).mockImplementation(async (url) => {
      if (String(url).includes("/api/products/masters/")) {
        return {
          channelListings: [{
            options: [{
              id: "55555555-5555-4555-8555-555555555555",
              inventoryComponents: [{
                id: "77777777-7777-4777-8777-777777777777",
                masterProductId: "88888888-8888-4888-8888-888888888888",
                code: "SP-OLD",
                name: "잘못 연결된 상품",
                optionName: null,
                currentStock: 5,
                availableStock: 5,
                isActive: true,
                quantity: 2,
              }],
            }],
          }],
        } as never;
      }
      return { items: [candidate] } as never;
    });
    vi.mocked(apiClient.put).mockResolvedValue({ id: "variant" });
    renderEditor({
      onSaved,
      existingComponents: [{
        masterProductId: "88888888-8888-4888-8888-888888888888",
        code: "SP-OLD",
        name: "잘못 연결된 상품",
        optionName: null,
        currentStock: 5,
        quantity: 2,
        isActive: true,
      }],
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "SP-OLD 재고 제거" }),
    );
    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Sellpia 상품 코드 또는 상품명 검색",
      }),
      { target: { value: "9633-1" } },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "9633-1 재고 추가" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "재고 수정하고 다시 계산" }),
    );

    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith(
      "/api/channels/options/55555555-5555-4555-8555-555555555555/inventory-components",
      {
        components: [{
          masterProductId: candidate.masterProductId,
          quantity: 1,
        }],
      },
    ));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

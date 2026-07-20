import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as ProductKeywordRankOverviewModule from "./ProductKeywordRankOverview";

describe("ProductKeywordRankOverview ABC grades", () => {
  it("renders every returned grade while keeping a single grade as one badge", () => {
    const AbcGradeBadges = (
      ProductKeywordRankOverviewModule as unknown as {
        AbcGradeBadges?: (props: { grades: Array<"A" | "B" | "C"> }) => React.ReactNode;
      }
    ).AbcGradeBadges;

    expect(AbcGradeBadges).toBeTypeOf("function");
    const { rerender } = render(<AbcGradeBadges grades={["A", "C"]} />);
    expect(screen.getByTitle("재고분석 ABC 등급: A")).toHaveTextContent("A");
    expect(screen.getByTitle("재고분석 ABC 등급: C")).toHaveTextContent("C");

    rerender(<AbcGradeBadges grades={["B"]} />);
    expect(screen.getAllByTitle(/재고분석 ABC 등급:/)).toHaveLength(1);
    expect(screen.getByTitle("재고분석 ABC 등급: B")).toHaveTextContent("B");
  });
});

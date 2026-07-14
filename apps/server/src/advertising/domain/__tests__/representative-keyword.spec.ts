import { describe, expect, it } from "vitest";
import {
  buildRepresentativeKeywordAssignments,
  buildRepresentativeKeywordCandidates,
  buildRepresentativeKeywordSearchAssignments,
  deriveKeywordFromName,
} from "../representative-keyword";

describe("representative keyword", () => {
  it.each([
    ["해피프렌즈ind 빅 생수통 치즈 슬라임, 랜덤발송, 564g, 4개", "슬라임"],
    ["집에서 재밌게 전략게임 보드게임 퍼즐 DIY 만들기 모음", "보드게임"],
    ["스폰지점핑인형(12개입) 스프링인형", "인형"],
    ["1000깃털(대)", "깃털"],
    ["캐릭터 연필세트 12자루", "연필"],
    ["12000 2in1라켓볼세트", "라켓볼"],
  ])("derives %s → %s", (productName, expected) => {
    expect(deriveKeywordFromName(productName)).toBe(expected);
  });

  it("builds candidates from the Coupang category leaf and product name", () => {
    const candidates = buildRepresentativeKeywordCandidates({
      vendorItemId: "V1",
      productName: "12000 2in1라켓볼세트",
      category: "완구 > 스포츠완구 > 라켓놀이",
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        { keyword: "라켓놀이", origin: "coupang_category" },
        { keyword: "라켓볼", origin: "product_name" },
      ]),
    );
    expect(candidates.some((candidate) => candidate.keyword === "in")).toBe(
      false,
    );
  });

  it("selects the Wing candidate using sales 50%, views 30%, conversion 20%", () => {
    const result = buildRepresentativeKeywordAssignments(
      [
        {
          vendorItemId: "V1",
          productName: "12000 2in1라켓볼세트",
          category: "완구 > 스포츠완구 > 라켓놀이",
        },
      ],
      new Map(),
      [
        {
          vendorItemId: "V1",
          keyword: "라켓놀이",
          salesRank: 7,
          keywordSalesLast28d: 100,
          keywordViewsLast28d: 1_000,
          keywordConversionRate28d: 0.1,
        },
        {
          vendorItemId: "V1",
          keyword: "라켓볼",
          salesRank: 2,
          keywordSalesLast28d: 300,
          keywordViewsLast28d: 1_500,
          keywordConversionRate28d: 0.2,
        },
      ],
    );

    expect(result[0]).toMatchObject({
      keyword: "라켓볼",
      source: "wing_performance",
      score: 100,
      automaticKeyword: "라켓볼",
    });
  });

  it("uses a manually assigned keyword and searches only that keyword", () => {
    const products = [
      {
        vendorItemId: "V1",
        productName: "투명 슬라임 6개",
        category: "완구 > 촉감완구 > 슬라임",
      },
    ];
    const manual = new Map([["V1", "클리어 슬라임"]]);
    const result = buildRepresentativeKeywordAssignments(products, manual);
    const searches = buildRepresentativeKeywordSearchAssignments(
      products,
      manual,
    );

    expect(result[0]).toMatchObject({
      keyword: "클리어 슬라임",
      source: "manual_override",
      automaticKeyword: "슬라임",
    });
    expect(searches).toEqual([
      expect.objectContaining({ keyword: "클리어 슬라임", candidateIndex: 0 }),
    ]);
  });

  it("marks the automatic representative candidate as the primary search", () => {
    const searches = buildRepresentativeKeywordSearchAssignments([
      {
        vendorItemId: "V1",
        productName: "12000 2in1라켓볼세트",
        category: "완구 > 스포츠완구 > 라켓놀이",
      },
    ]);

    expect(searches[0]).toMatchObject({
      keyword: "라켓놀이",
      candidateIndex: 0,
    });
    expect(searches.slice(1).every((search) => search.candidateIndex > 0)).toBe(
      true,
    );
  });

  it("does not label legacy snapshots without keyword aggregates as a Wing score", () => {
    const result = buildRepresentativeKeywordAssignments(
      [
        {
          vendorItemId: "V1",
          productName: "캐치볼",
          category: null,
        },
      ],
      new Map(),
      [
        {
          vendorItemId: "V1",
          keyword: "캐치볼",
          salesRank: 2,
          keywordSalesLast28d: null,
          keywordViewsLast28d: null,
          keywordConversionRate28d: null,
        },
      ],
    );

    expect(result[0]).toMatchObject({
      keyword: "캐치볼",
      source: "product_name",
      score: null,
    });
  });
});

import type { AdStrategyAction } from "@kiditem/shared";

export function exportCampaignXlsx(grade: string, actions: AdStrategyAction[], budget: number) {
  import("xlsx").then((XLSX) => {
    const gradeMap: Record<string, { campaignType: string; targetRoas: string; bidMain: string; bidSub: string; bidLongtail: string }> = {
      A: { campaignType: "매출최적화 + 수동 병행", targetRoas: "300~500%", bidMain: "800~1,000", bidSub: "500~700", bidLongtail: "200~400" },
      B: { campaignType: "수동 성과형", targetRoas: "300~480%", bidMain: "500~700", bidSub: "300~500", bidLongtail: "100~300" },
      C: { campaignType: "최소 테스트 or OFF", targetRoas: "500%+", bidMain: "OFF", bidSub: "200~300", bidLongtail: "100~200" },
    };

    const grades = grade === "all" ? ["A", "B", "C"] : [grade];
    const wb = XLSX.utils.book_new();

    for (const g of grades) {
      const cfg = gradeMap[g] || gradeMap.A;
      const gradeActions = grade === "all" ? actions.filter((a) => a.grade === g) : actions;
      const gradeBudget = grade === "all" ? Math.round(budget * (g === "A" ? 0.65 : g === "B" ? 0.25 : 0.1)) : budget;

      const rows = gradeActions.map((a, i) => {
        const productBudget = gradeActions.length > 0 ? Math.round(gradeBudget / gradeActions.length) : 0;
        const recBudget = a.recommendedDailyBudget > 0 ? a.recommendedDailyBudget : productBudget;
        const campType = g === "A" ? (a.tier ? "매출최적화+수동" : "매출최적화") : g === "B" ? "수동 성과형" : (a.currentRoas < 100 ? "OFF" : "최소 테스트");
        return {
          "No": i + 1,
          "캠페인명": `${g}등급_캠페인`,
          "상품명": a.name,
          "상품ID": a.productId,
          "등급": g,
          "현재 ROAS(%)": a.currentRoas || 0,
          "추천 일예산(원)": recBudget,
          "목표 ROAS(%)": a.targetRoas || cfg.targetRoas,
          "최대 입찰가(원)": a.maxBidPrice || 0,
          "캠페인 유형": campType,
          "메인 키워드 입찰가": cfg.bidMain + "원",
          "서브 키워드 입찰가": cfg.bidSub + "원",
          "롱테일 키워드 입찰가": cfg.bidLongtail + "원",
          "현재 CTR(%)": a.currentCtr || 0,
          "현재 CVR(%)": a.currentCvr || 0,
          "현재 ACoS(%)": a.currentAcos || 0,
          "키워드": (a.keywords || []).join(", "),
          "추천 액션": a.recommendedAction,
          "우선순위": a.actionPriority === "urgent" ? "긴급" : a.actionPriority === "high" ? "높음" : a.actionPriority === "medium" ? "보통" : "낮음",
          "사유": a.reason || "",
        };
      });

      if (rows.length === 0) {
        rows.push({
          "No": 1, "캠페인명": `${g}등급_캠페인`, "상품명": "(해당 상품 없음)", "상품ID": "",
          "등급": g, "현재 ROAS(%)": 0, "추천 일예산(원)": 0, "목표 ROAS(%)": cfg.targetRoas,
          "최대 입찰가(원)": 0, "캠페인 유형": cfg.campaignType,
          "메인 키워드 입찰가": cfg.bidMain + "원", "서브 키워드 입찰가": cfg.bidSub + "원",
          "롱테일 키워드 입찰가": cfg.bidLongtail + "원",
          "현재 CTR(%)": 0, "현재 CVR(%)": 0, "현재 ACoS(%)": 0,
          "키워드": "",
          "추천 액션": "", "우선순위": "", "사유": "",
        });
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 4 }, { wch: 16 }, { wch: 35 }, { wch: 12 }, { wch: 5 },
        { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 18 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, `${g}등급 캠페인`);
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = grade === "all" ? `광고캠페인_ABC_${dateStr}.xlsx` : `광고캠페인_${grade}등급_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
  });
}

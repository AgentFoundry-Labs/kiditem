import type { AdStrategyAction } from "@kiditem/shared";

function productName(action: AdStrategyAction): string {
  return action.listing.channelName ?? action.listing.masterProduct.name;
}

function priorityLabel(priority: AdStrategyAction["priority"]): string {
  if (priority === "urgent") return "긴급";
  if (priority === "high") return "높음";
  if (priority === "medium") return "보통";
  return "낮음";
}

function actionLabel(actionType: string): string {
  if (actionType === "increase") return "확대";
  if (actionType === "stop") return "중단";
  if (actionType === "decrease") return "축소";
  if (actionType === "maintain") return "유지";
  return actionType;
}

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
      const productBudget = gradeActions.length > 0 ? Math.round(gradeBudget / gradeActions.length) : 0;

      const rows: Array<Record<string, string | number>> = gradeActions.map((a, i) => ({
        "No": i + 1,
        "캠페인명": `${g}등급_캠페인`,
        "상품명": productName(a),
        "등록상품ID": a.listing.externalId,
        "등급": g,
        "현재값": a.currentValue ?? "",
        "제안값": a.proposedValue ?? productBudget,
        "추천 일예산(원)": a.proposedValue && a.proposedValue > 1000 ? a.proposedValue : productBudget,
        "목표 ROAS(%)": cfg.targetRoas,
        "캠페인 유형": cfg.campaignType,
        "메인 키워드 입찰가": `${cfg.bidMain}원`,
        "서브 키워드 입찰가": `${cfg.bidSub}원`,
        "롱테일 키워드 입찰가": `${cfg.bidLongtail}원`,
        "추천 액션": actionLabel(a.actionType),
        "우선순위": priorityLabel(a.priority),
        "사유": a.reason,
        "채널상태일": a.channelState?.businessDate ?? "",
        "아이템위너": a.channelState?.isOfferWinner == null ? "" : a.channelState.isOfferWinner ? "Y" : "N",
      }));

      if (rows.length === 0) {
        rows.push({
          "No": 1,
          "캠페인명": `${g}등급_캠페인`,
          "상품명": "(해당 상품 없음)",
          "등록상품ID": "",
          "등급": g,
          "현재값": "",
          "제안값": "",
          "추천 일예산(원)": 0,
          "목표 ROAS(%)": cfg.targetRoas,
          "캠페인 유형": cfg.campaignType,
          "메인 키워드 입찰가": `${cfg.bidMain}원`,
          "서브 키워드 입찰가": `${cfg.bidSub}원`,
          "롱테일 키워드 입찰가": `${cfg.bidLongtail}원`,
          "추천 액션": "",
          "우선순위": "",
          "사유": "",
          "채널상태일": "",
          "아이템위너": "",
        });
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 4 }, { wch: 16 }, { wch: 35 }, { wch: 14 }, { wch: 5 },
        { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 18 },
        { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 8 },
        { wch: 48 }, { wch: 12 }, { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, `${g}등급 캠페인`);
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = grade === "all" ? `광고캠페인_ABC_${dateStr}.xlsx` : `광고캠페인_${grade}등급_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
  });
}

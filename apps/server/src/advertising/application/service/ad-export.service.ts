import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  AdStrategyActionSchema,
  type AdStrategyAction,
} from '@kiditem/shared/advertising';
import type {
  AdCampaignExportDto,
  AdTrendExportDto,
} from '../../adapter/in/http/dto/ad-export.dto';

export const AD_EXPORT_XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type AdSpreadsheetExportResult = {
  buffer: Buffer;
  fileName: string;
  contentType: typeof AD_EXPORT_XLSX_CONTENT_TYPE;
};

const GRADE_CONFIG: Record<
  'A' | 'B' | 'C',
  {
    campaignType: string;
    targetRoas: string;
    bidMain: string;
    bidSub: string;
    bidLongtail: string;
  }
> = {
  A: {
    campaignType: '매출최적화 + 수동 병행',
    targetRoas: '300~500%',
    bidMain: '800~1,000',
    bidSub: '500~700',
    bidLongtail: '200~400',
  },
  B: {
    campaignType: '수동 성과형',
    targetRoas: '300~480%',
    bidMain: '500~700',
    bidSub: '300~500',
    bidLongtail: '100~300',
  },
  C: {
    campaignType: '최소 테스트 or OFF',
    targetRoas: '500%+',
    bidMain: 'OFF',
    bidSub: '200~300',
    bidLongtail: '100~200',
  },
};

/**
 * Transient Advertising workbook conversion. The request carries already
 * authorized read data from the UI; this service creates bytes only and does
 * not persist an export record or artifact.
 */
@Injectable()
export class AdExportService {
  exportCampaign(
    input: AdCampaignExportDto,
    now: Date = new Date(),
  ): AdSpreadsheetExportResult {
    const actions = parseActions(input.actions);
    const grades: Array<'A' | 'B' | 'C'> =
      input.grade === 'all' ? ['A', 'B', 'C'] : [input.grade];
    const workbook = XLSX.utils.book_new();

    for (const grade of grades) {
      const config = GRADE_CONFIG[grade];
      const gradeActions = input.grade === 'all'
        ? actions.filter((action) => action.grade === grade)
        : actions;
      const gradeBudget = input.grade === 'all'
        ? Math.round(input.budget * (grade === 'A' ? 0.65 : grade === 'B' ? 0.25 : 0.1))
        : input.budget;
      const productBudget = gradeActions.length > 0
        ? Math.round(gradeBudget / gradeActions.length)
        : 0;
      const rows = gradeActions.length > 0
        ? gradeActions.map((action, index) => campaignRow(action, grade, config, productBudget, index))
        : [emptyCampaignRow(grade, config)];

      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet['!cols'] = [
        { wch: 4 }, { wch: 16 }, { wch: 35 }, { wch: 14 }, { wch: 5 },
        { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 18 },
        { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 8 },
        { wch: 48 }, { wch: 12 }, { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(workbook, sheet, `${grade}등급 캠페인`);
    }

    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = input.grade === 'all'
      ? `광고캠페인_ABC_${dateStr}.xlsx`
      : `광고캠페인_${input.grade}등급_${dateStr}.xlsx`;
    return workbookResult(workbook, fileName);
  }

  exportTrend(input: AdTrendExportDto): AdSpreadsheetExportResult {
    const rows = input.points.map((point) => ({
      일자: point.businessDate,
      요일: point.axisLabel.slice(-3, -1),
      [input.leftLabel]: point.leftValue,
      [input.rightLabel]: point.rightValue,
    }));
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, '성과 그래프');
    return workbookResult(workbook, `광고-성과그래프-${input.period}.xlsx`);
  }
}

function parseActions(values: unknown[]): AdStrategyAction[] {
  const parsed = AdStrategyActionSchema.array().safeParse(values);
  if (parsed.success) return parsed.data;
  throw new BadRequestException('광고 캠페인 내보내기 데이터가 유효하지 않습니다.');
}

function campaignRow(
  action: AdStrategyAction,
  grade: 'A' | 'B' | 'C',
  config: (typeof GRADE_CONFIG)['A'],
  productBudget: number,
  index: number,
): Record<string, string | number> {
  return {
    No: index + 1,
    캠페인명: `${grade}등급_캠페인`,
    상품명: action.listing.channelName ?? action.listing.masterProduct.name,
    등록상품ID: action.listing.externalId,
    등급: grade,
    현재값: action.currentValue ?? '',
    제안값: action.proposedValue ?? productBudget,
    '추천 일예산(원)': action.proposedValue && action.proposedValue > 1000
      ? action.proposedValue
      : productBudget,
    '목표 ROAS(%)': config.targetRoas,
    '캠페인 유형': config.campaignType,
    '메인 키워드 입찰가': `${config.bidMain}원`,
    '서브 키워드 입찰가': `${config.bidSub}원`,
    '롱테일 키워드 입찰가': `${config.bidLongtail}원`,
    '추천 액션': actionLabel(action.actionType),
    우선순위: priorityLabel(action.priority),
    사유: action.reason,
    채널상태일: action.channelState?.businessDate ?? '',
    아이템위너: action.channelState?.isOfferWinner == null
      ? ''
      : action.channelState.isOfferWinner
        ? 'Y'
        : 'N',
  };
}

function emptyCampaignRow(
  grade: 'A' | 'B' | 'C',
  config: (typeof GRADE_CONFIG)['A'],
): Record<string, string | number> {
  return {
    No: 1,
    캠페인명: `${grade}등급_캠페인`,
    상품명: '(해당 상품 없음)',
    등록상품ID: '',
    등급: grade,
    현재값: '',
    제안값: '',
    '추천 일예산(원)': 0,
    '목표 ROAS(%)': config.targetRoas,
    '캠페인 유형': config.campaignType,
    '메인 키워드 입찰가': `${config.bidMain}원`,
    '서브 키워드 입찰가': `${config.bidSub}원`,
    '롱테일 키워드 입찰가': `${config.bidLongtail}원`,
    '추천 액션': '',
    우선순위: '',
    사유: '',
    채널상태일: '',
    아이템위너: '',
  };
}

function priorityLabel(priority: AdStrategyAction['priority']): string {
  if (priority === 'urgent') return '긴급';
  if (priority === 'high') return '높음';
  if (priority === 'medium') return '보통';
  return '낮음';
}

function actionLabel(actionType: string): string {
  if (actionType === 'increase') return '확대';
  if (actionType === 'stop') return '중단';
  if (actionType === 'decrease') return '축소';
  if (actionType === 'maintain') return '유지';
  return actionType;
}

function workbookResult(
  workbook: XLSX.WorkBook,
  fileName: string,
): AdSpreadsheetExportResult {
  return {
    buffer: Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })),
    fileName,
    contentType: AD_EXPORT_XLSX_CONTENT_TYPE,
  };
}

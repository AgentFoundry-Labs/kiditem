import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ===== 업계 평균 벤치마크 (2025~2026 쿠팡 기준) =====
export const INDUSTRY_BENCHMARK = {
  roas: { avg: 350, good: 500, excellent: 700, poor: 200, breakeven: 300, label: 'ROAS' },
  ctr: { avg: 0.3, good: 0.5, excellent: 1.0, poor: 0.15, label: 'CTR' },
  cvr: { avg: 8, good: 12, excellent: 15, poor: 5, label: 'CVR' },
  cpc: { avg: 250, good: 150, excellent: 100, poor: 500, label: 'CPC' },
  adRate: { avg: 15, good: 10, excellent: 5, poor: 25, label: '광고비율' },
  acos: { avg: 25, good: 15, excellent: 10, poor: 40, label: 'ACoS' },
} as const;

type BenchmarkKey = keyof typeof INDUSTRY_BENCHMARK;

export interface BenchmarkComparison {
  metric: string;
  label: string;
  myValue: number;
  industryAvg: number;
  industryGood: number;
  industryExcellent: number;
  industryPoor: number;
  status: 'excellent' | 'good' | 'average' | 'below' | 'poor';
  gap: number;
  gapPercent: number;
  strategy: string;
  actions: string[];
}

function getBenchmarkStrategy(
  metric: BenchmarkKey,
  status: BenchmarkComparison['status'],
  myValue: number,
  avg: number,
): { strategy: string; actions: string[] } {
  const strategies: Record<BenchmarkKey, Record<string, { strategy: string; actions: string[] }>> = {
    roas: {
      excellent: { strategy: 'ROAS 최상위권 — 적극 스케일업', actions: ['일예산 30~50% 증액하여 매출 극대화', 'ROAS 높은 캠페인 복제 → 유사 키워드로 확장', '매출최적화 광고 추가 개설로 신규 키워드 발굴', '시즌·프로모션 기간에 입찰가 추가 인상 (15~20%)'] },
      good: { strategy: 'ROAS 업계 평균 이상 — 안정 성장', actions: ['현재 예산 유지하며 키워드 효율 최적화', '저성과 키워드 OFF → 고성과 키워드에 예산 집중', '매출최적화에서 발굴된 키워드를 수동 캠페인에 이전', 'A등급 상품 중심 예산 증액 (10~20%)'] },
      average: { strategy: `ROAS ${Math.round(myValue)}% — 업계 평균 수준, 개선 여지 있음`, actions: ['전환 0 키워드 즉시 OFF + 제외 키워드 등록', '입찰가 10~15% 하향 조정으로 효율 개선', '아이템위너 여부 확인 — 미보유 시 가격 조정 우선', '상세페이지 개선으로 전환율 끌어올리기'] },
      below: { strategy: `ROAS ${Math.round(myValue)}% — 업계 평균 미달, 구조 개선 필요`, actions: ['C등급 상품 광고 전면 중단 검토', '입찰가 15~20% 하향 + 롱테일 키워드(100~300원)로 전환', '광고비율 높은 상품 TOP 5 집중 점검', '매입가 재협상 또는 판매가 인상으로 마진 확보'] },
      poor: { strategy: `ROAS ${Math.round(myValue)}% — 업계 평균 대폭 미달, 긴급 조치`, actions: ['전체 캠페인 일시 중단 후 구조 재설계', '아이템위너 미보유 상품 광고 즉시 OFF', 'A등급 상품만 남기고 나머지 전면 OFF', '상세페이지·가격·리뷰 경쟁력 전면 재검토', '2주간 최소 예산(3,000원/일)으로 테스트 후 재개'] },
    },
    ctr: {
      excellent: { strategy: 'CTR 최상위 — 썸네일·상품명 매우 우수', actions: ['현재 크리에이티브 유지, 다른 상품에도 적용', 'CTR 높은 상품의 썸네일 스타일을 전 상품 표준화', '전환율(CVR)이 따라오는지 확인 — CTR만 높고 CVR 낮으면 상세페이지 문제'] },
      good: { strategy: 'CTR 업계 평균 이상 — 양호', actions: ['현재 썸네일 유지, A/B 테스트로 추가 개선', '상품명에 주요 키워드 포함 여부 점검', '경쟁사 상위 3개 상품 썸네일 벤치마킹'] },
      average: { strategy: `CTR ${myValue.toFixed(2)}% — 업계 평균 수준`, actions: ['메인 이미지 교체 (밝은 배경 + 사용 장면 추가)', '상품명 최적화 (핵심 키워드 앞배치 + 혜택 강조)', '가격 경쟁력 확인 — 클릭 안 되면 가격이 높을 수 있음'] },
      below: { strategy: `CTR ${myValue.toFixed(2)}% — 업계 평균 미달, 소재 개선 시급`, actions: ['썸네일 전면 교체 — 경쟁사 상위 5개 벤치마킹', '상품명 재작성 (불필요한 단어 제거, 혜택 키워드 추가)', '가격 할인 태그·쿠폰 활용으로 클릭 유도', '쿠팡 로켓배송 뱃지 유무 확인'] },
      poor: { strategy: `CTR ${myValue.toFixed(2)}% — 매우 낮음, 노출 자체에 문제`, actions: ['썸네일 전면 리뉴얼 (전문 디자이너 투입 권장)', '키워드 관련성 점검 — 엉뚱한 키워드에 노출되고 있을 수 있음', '제외 키워드 대량 등록으로 관련 없는 노출 제거', '상품 카테고리 재설정 확인', '가격이 경쟁사 대비 현저히 높은지 확인'] },
    },
    cvr: {
      excellent: { strategy: 'CVR 최상위 — 상세페이지·가격 경쟁력 우수', actions: ['광고 예산 적극 증액 — 트래픽만 늘리면 매출 성장', '키워드 확장으로 유입량 극대화', '이 상품의 상세페이지 포맷을 다른 상품에도 적용'] },
      good: { strategy: 'CVR 업계 평균 이상 — 양호', actions: ['현재 상세페이지 유지, 리뷰 관리에 집중', '리뷰 수 확보 (50개 이상 목표) → 전환율 추가 상승', '묶음 상품·추가 구성으로 객단가 높이기'] },
      average: { strategy: `CVR ${myValue.toFixed(1)}% — 업계 평균 수준, 개선 여지 있음`, actions: ['상세페이지 상단 3초 구간 강화 (핵심 혜택 먼저)', '리뷰 포토·동영상 리뷰 확보 → 신뢰도 향상', '가격 경쟁력 점검 — 아이템위너 유지 중인지 확인', '배송 옵션(로켓배송) 적용 여부 확인'] },
      below: { strategy: `CVR ${myValue.toFixed(1)}% — 업계 평균 미달, 상세페이지 개선 필요`, actions: ['상세페이지 전면 리뉴얼 — 사용 장면 + 비교 이미지 추가', '가격 재설정 — 경쟁 상품 대비 5% 이내로 맞추기', '리뷰 품질 관리 — 부정 리뷰 원인 파악 및 개선', '쿠폰·프로모션으로 구매 전환 유도', '아이템위너 상실 시 가격 조정 후 재확보'] },
      poor: { strategy: `CVR ${myValue.toFixed(1)}% — 매우 낮음, 구매 결정 단계 심각한 문제`, actions: ['광고 즉시 축소 — 트래픽 보내도 전환 안 됨', '상세페이지 전면 재작업 (전문가 투입)', '가격을 아이템위너 가격으로 맞추기', '리뷰 3점 미만이면 상품 품질 자체 개선 필요', '경쟁 상품 대비 차별화 포인트 명확히 하기'] },
    },
    cpc: {
      excellent: { strategy: 'CPC 매우 낮음 — 광고비 효율 최고', actions: ['현재 키워드 구조 유지', '추가 롱테일 키워드 발굴로 저비용 유입 확대', '예산 여유분으로 신규 상품 테스트'] },
      good: { strategy: 'CPC 업계 평균 이하 — 효율적', actions: ['롱테일 키워드 비중 유지', '고비용 메인 키워드는 ROAS 확인 후 유지/제거 결정'] },
      average: { strategy: `CPC ${Math.round(myValue)}원 — 업계 평균 수준`, actions: ['입찰가 10% 하향 테스트 (노출 감소 체크)', '경쟁 과열 키워드 → 롱테일(100~300원)로 분산', '비검색 영역 입찰 비율 조정 (수동 캠페인)'] },
      below: { strategy: `CPC ${Math.round(myValue)}원 — 업계 평균 초과, 비용 관리 필요`, actions: ['고비용 키워드 TOP 10 점검 → ROAS 낮으면 OFF', '입찰가 15% 하향 조정', '롱테일 키워드(세부 키워드) 비중 60% 이상으로 확대', '매출최적화 광고의 자동 입찰 설정 ROAS 목표 상향'] },
      poor: { strategy: `CPC ${Math.round(myValue)}원 — 매우 높음, 광고비 과다`, actions: ['메인 키워드 입찰 대폭 축소 → 롱테일로 전면 전환', '매출최적화 광고 ROAS 목표 500% 이상으로 설정', '1차 키워드 → 2차/3차로 등급 하향 검토', '경쟁 과열 카테고리면 시간대별 입찰 조정 고려', '비검색 영역 입찰 OFF 또는 최소화'] },
    },
    adRate: {
      excellent: { strategy: '광고비율 매우 낮음 — 자연매출 강세', actions: ['광고 예산 증액 여력 충분 — A등급 상품 공격적 확장', '신규 상품 런칭 시 광고 테스트 적극 활용', '자연 검색 강점을 유지하며 광고로 추가 성장'] },
      good: { strategy: '광고비율 양호 — 건강한 구조', actions: ['현재 비율 유지하며 ROAS 개선에 집중', '자연매출 비중이 높은 상품 → 광고 OFF 검토 (자연으로 충분)', '광고 매출 의존도 모니터링'] },
      average: { strategy: `광고비율 ${myValue.toFixed(1)}% — 업계 평균 수준`, actions: ['C등급 상품 광고비 축소로 비율 개선', 'ROAS 200% 미만 캠페인 OFF', '자연매출 늘리기 — SEO 최적화(상품명·카테고리·키워드)', '리뷰 확보로 자연 전환율 향상'] },
      below: { strategy: `광고비율 ${myValue.toFixed(1)}% — 업계 평균 초과, 광고 의존도 높음`, actions: ['전환 0 캠페인 즉시 OFF', 'C등급 상품 광고 전면 중단', '입찰가 전체 15% 하향 조정', '자연매출 강화 — 리뷰 확보 + 상세페이지 SEO', '광고비 한도를 순이익의 30% 이내로 제한'] },
      poor: { strategy: `광고비율 ${myValue.toFixed(1)}% — 매우 높음, 적자 구조 위험`, actions: ['광고 전면 구조조정 — A등급만 남기고 나머지 OFF', '일예산 전체 50% 감축', '광고 없이 매출이 나오는 상품 파악 → 광고 불필요 상품 OFF', '매입가 재협상 + 판매가 인상으로 마진 확보 우선', '2주간 최소 예산 운영 후 수익 구조 재평가'] },
    },
    acos: {
      excellent: { strategy: 'ACoS 매우 낮음 — 광고 수익성 최고', actions: ['예산 증액으로 매출 스케일업', '현재 키워드 구조 다른 상품에도 적용', '입찰가 소폭 인상(10%)해도 수익성 유지 가능'] },
      good: { strategy: 'ACoS 양호 — 수익 구간', actions: ['현재 효율 유지하며 키워드 확장', '저성과 키워드 OFF로 추가 개선'] },
      average: { strategy: `ACoS ${myValue.toFixed(1)}% — 업계 평균 수준`, actions: ['전환 0 키워드 제거', '입찰가 미세 조정 (10% 하향 테스트)', '상세페이지 개선으로 CVR 올리기 → ACoS 자동 개선'] },
      below: { strategy: `ACoS ${myValue.toFixed(1)}% — 업계 평균 초과, 수익 압박`, actions: ['고비용 키워드 TOP 10 OFF', '입찰가 15% 하향', '매출최적화 광고 ROAS 목표 상향', '전환율 개선으로 근본적 ACoS 개선'] },
      poor: { strategy: `ACoS ${myValue.toFixed(1)}% — 매우 높음, 광고할수록 적자`, actions: ['ROAS 200% 미만 전 캠페인 중단', '키워드 구조 전면 재설계 — 롱테일 중심으로', '상품 경쟁력(가격·리뷰·상세페이지) 먼저 확보 후 광고 재개', '아이템위너 미보유 상품 광고 즉시 OFF'] },
    },
  };

  return strategies[metric]?.[status] || { strategy: '데이터 확인 필요', actions: ['추가 데이터 수집 후 판단'] };
}

function compareToBenchmark(metrics: {
  roas: number; ctr: number; cvr: number; cpc: number; adRate: number; acos: number;
}): BenchmarkComparison[] {
  const results: BenchmarkComparison[] = [];

  for (const [key, bench] of Object.entries(INDUSTRY_BENCHMARK)) {
    const myValue = metrics[key as BenchmarkKey] ?? 0;
    const isLowerBetter = key === 'cpc' || key === 'adRate' || key === 'acos';

    let status: BenchmarkComparison['status'];
    if (isLowerBetter) {
      if (myValue <= bench.excellent) status = 'excellent';
      else if (myValue <= bench.good) status = 'good';
      else if (myValue <= bench.avg) status = 'average';
      else if (myValue <= bench.poor) status = 'below';
      else status = 'poor';
    } else {
      if (myValue >= bench.excellent) status = 'excellent';
      else if (myValue >= bench.good) status = 'good';
      else if (myValue >= bench.avg) status = 'average';
      else if (myValue >= bench.poor) status = 'below';
      else status = 'poor';
    }

    const gap = isLowerBetter ? bench.avg - myValue : myValue - bench.avg;
    const gapPercent = bench.avg > 0 ? Math.round((gap / bench.avg) * 100) : 0;

    const { strategy, actions } = getBenchmarkStrategy(key as BenchmarkKey, status, myValue, bench.avg);

    results.push({
      metric: key,
      label: bench.label,
      myValue: Math.round(myValue * 10) / 10,
      industryAvg: bench.avg,
      industryGood: bench.good,
      industryExcellent: bench.excellent,
      industryPoor: bench.poor,
      status,
      gap: Math.round(gap * 10) / 10,
      gapPercent,
      strategy,
      actions,
    });
  }

  return results;
}

@Injectable()
export class AdBenchmarkService {
  constructor(private readonly prisma: PrismaService) {}

  private async getDefaultCompanyId(): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!company) throw new InternalServerErrorException('회사 정보를 찾을 수 없습니다');
    return company.id;
  }

  async getDiagnosis() {
    try {
      const companyId = await this.getDefaultCompanyId();

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const ads = await this.prisma.ad.findMany({
        where: { companyId, date: { gte: thirtyDaysAgo } },
        select: { spend: true, revenue: true, clicks: true, impressions: true, conversions: true },
      });

      const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
      const totalRevenue = ads.reduce((s, a) => s + a.revenue, 0);
      const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
      const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
      const totalConversions = ads.reduce((s, a) => s + a.conversions, 0);

      // 전체 매출
      const products = await this.prisma.product.findMany({
        where: { companyId, status: 'active', isDeleted: false },
        include: { profitLoss: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      const overallRevenue = products.reduce((s, p) => s + (p.profitLoss?.[0]?.revenue || 0), 0);

      // 핵심 지표
      const myMetrics = {
        roas: totalSpend > 0 ? (totalRevenue / totalSpend) * 100 : 0,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        cvr: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
        cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        adRate: overallRevenue > 0 ? (totalSpend / overallRevenue) * 100 : 0,
        acos: totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : 0,
      };

      const comparisons = compareToBenchmark(myMetrics);

      // 종합 진단
      const statusCounts = { excellent: 0, good: 0, average: 0, below: 0, poor: 0 };
      comparisons.forEach((c) => { statusCounts[c.status]++; });

      let overallGrade: string;
      let overallMessage: string;
      if (statusCounts.excellent + statusCounts.good >= 4) {
        overallGrade = 'A';
        overallMessage = '업계 평균 대비 우수한 광고 효율입니다. 적극 스케일업을 추천합니다.';
      } else if (statusCounts.poor + statusCounts.below >= 3) {
        overallGrade = 'D';
        overallMessage = '대부분 지표가 업계 평균 미달입니다. 광고 구조 전면 재검토가 필요합니다.';
      } else if (statusCounts.poor >= 2) {
        overallGrade = 'C';
        overallMessage = '일부 지표가 심각하게 미달합니다. 해당 영역 집중 개선이 시급합니다.';
      } else if (statusCounts.below >= 2) {
        overallGrade = 'B-';
        overallMessage = '평균 수준이나 개선 여지가 있습니다. 미달 지표 위주로 최적화하세요.';
      } else {
        overallGrade = 'B+';
        overallMessage = '전반적으로 양호합니다. 세부 항목별 미세 조정으로 효율을 높이세요.';
      }

      const priorityImprovements = comparisons
        .filter((c) => c.status === 'poor' || c.status === 'below')
        .sort((a, b) => a.gapPercent - b.gapPercent);

      const strengths = comparisons
        .filter((c) => c.status === 'excellent' || c.status === 'good');

      return {
        myMetrics: {
          roas: Math.round(myMetrics.roas),
          ctr: Math.round(myMetrics.ctr * 100) / 100,
          cvr: Math.round(myMetrics.cvr * 10) / 10,
          cpc: Math.round(myMetrics.cpc),
          adRate: Math.round(myMetrics.adRate * 10) / 10,
          acos: Math.round(myMetrics.acos * 10) / 10,
        },
        industryBenchmark: INDUSTRY_BENCHMARK,
        comparisons,
        diagnosis: {
          overallGrade,
          overallMessage,
          statusCounts,
          priorityImprovements,
          strengths,
        },
        dataInfo: {
          period: '30일',
          adRecords: ads.length,
          totalSpend: Math.round(totalSpend),
          totalAdRevenue: Math.round(totalRevenue),
          totalRevenue: Math.round(overallRevenue),
        },
      };
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('업계 평균 비교 분석 실패');
    }
  }
}

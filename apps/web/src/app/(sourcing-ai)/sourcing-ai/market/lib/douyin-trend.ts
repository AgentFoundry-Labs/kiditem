// 도우인(중국 SNS) 트렌드 큐레이션 키워드의 中文 미러.
// 백엔드 `DOUYIN_TREND_TOY_STATIONERY_SEEDS`(sourcing/domain/stationery-toy-trend.ts)와 동일하게 유지한다.
// 1688 핫셀링 offer 의 sourceKeyword 가 이 목록이면 "도우인 트렌드" 유래로 표시한다.
// ⚠️ 라이브 도우인 피드가 아니라 수동 유지 목록(도우인 원본 데이터는 유료/차단) — 백엔드 목록과 함께 갱신할 것.
const DOUYIN_TREND_SOURCE_KEYWORDS = new Set<string>([
  '谷子',
  '咕卡',
  '盲盒',
  '数字油画',
  '起泡胶',
  '磁力片',
  '拼豆',
  '微缩模型',
]);

export function isDouyinTrendSourceKeyword(sourceKeyword: string | null | undefined): boolean {
  return typeof sourceKeyword === 'string' && DOUYIN_TREND_SOURCE_KEYWORDS.has(sourceKeyword.trim());
}

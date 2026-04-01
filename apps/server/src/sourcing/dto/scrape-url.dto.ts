import { IsUrl, Matches } from 'class-validator';

export class ScrapeUrlBodyDto {
  @IsUrl()
  @Matches(/1688\.com|alibaba\.com/, { message: '1688.com 또는 alibaba.com URL만 지원합니다' })
  url: string;
}

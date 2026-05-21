import { ValidateBy, type ValidationOptions } from 'class-validator';
import { isSupportedSourcingScrapeUrl } from '../../../../domain/sourcing-url';

function IsSourcingScrapeUrl(validationOptions?: ValidationOptions) {
  return ValidateBy({
    name: 'isSourcingScrapeUrl',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && isSupportedSourcingScrapeUrl(value),
      defaultMessage: () => '1688.com 또는 alibaba.com 상품 URL만 지원합니다',
    },
  }, validationOptions);
}

export class ScrapeUrlBodyDto {
  @IsSourcingScrapeUrl()
  url: string;
}

export class ScrapeUrlStatusQueryDto {
  @IsSourcingScrapeUrl()
  url: string;
}

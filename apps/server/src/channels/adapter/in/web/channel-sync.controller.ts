import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import { Controller, Get, NotImplementedException, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

const COUPANG_OPEN_API_UNSUPPORTED_MESSAGE =
  '쿠팡 Open API 동기화는 지원하지 않습니다. WING 브라우저 또는 승인된 내부 소스를 사용하세요.';

@UseFilters(ChannelBusinessExceptionFilter)
@Controller('coupang-sync')
export class ChannelSyncController {
  @Get('health')
  checkHealth(@CurrentOrganization() _organizationId: string): never {
    throw new NotImplementedException(COUPANG_OPEN_API_UNSUPPORTED_MESSAGE);
  }

  @Post('products')
  syncProducts(@CurrentOrganization() _organizationId: string): never {
    throw new NotImplementedException(COUPANG_OPEN_API_UNSUPPORTED_MESSAGE);
  }

  @Post('orders')
  syncOrders(@CurrentOrganization() _organizationId: string): never {
    throw new NotImplementedException(COUPANG_OPEN_API_UNSUPPORTED_MESSAGE);
  }

  @Post('inventory')
  syncInventory(@CurrentOrganization() _organizationId: string): never {
    throw new NotImplementedException(COUPANG_OPEN_API_UNSUPPORTED_MESSAGE);
  }
}

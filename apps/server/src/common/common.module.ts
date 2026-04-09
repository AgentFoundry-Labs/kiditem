import { Global, Module } from '@nestjs/common';
import { CompanyResolverService } from './company-resolver.service';

@Global()
@Module({
  providers: [CompanyResolverService],
  exports: [CompanyResolverService],
})
export class CommonModule {}

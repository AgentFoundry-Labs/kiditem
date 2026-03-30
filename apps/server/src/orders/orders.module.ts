import { Module } from '@nestjs/common';
import { OrdersController } from './controllers/orders.controller';
import { OrdersService } from './services/orders.service';
import { ReturnsController } from './controllers/returns.controller';
import { ReturnsService } from './services/returns.service';
import { CsController } from './controllers/cs.controller';
import { CsService } from './services/cs.service';

@Module({
  controllers: [OrdersController, ReturnsController, CsController],
  providers: [OrdersService, ReturnsService, CsService],
})
export class OrdersModule {}

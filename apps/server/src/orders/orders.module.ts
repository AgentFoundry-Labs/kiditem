import { Module } from '@nestjs/common';
import { OrdersController } from './controllers/orders.controller';
import { OrdersService } from './services/orders.service';
import { ReturnsController } from './controllers/returns.controller';
import { ReturnsService } from './services/returns.service';
import { CsController } from './controllers/cs.controller';
import { CsService } from './services/cs.service';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsService } from './services/reviews.service';
import { ReturnTransfersController } from './return-transfers/return-transfers.controller';
import { ReturnTransfersService } from './return-transfers/return-transfers.service';

@Module({
  controllers: [
    OrdersController,
    ReturnsController,
    CsController,
    ReviewsController,
    ReturnTransfersController,
  ],
  providers: [
    OrdersService,
    ReturnsService,
    CsService,
    ReviewsService,
    ReturnTransfersService,
  ],
})
export class OrdersModule {}

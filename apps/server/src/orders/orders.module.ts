import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { OrdersController } from './controllers/orders.controller';
import { OrdersService } from './services/orders.service';
import { ReturnsController } from './controllers/returns.controller';
import { ReturnsService } from './services/returns.service';
import { CsController } from './controllers/cs.controller';
import { CsService } from './services/cs.service';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsService } from './services/reviews.service';
import { OrderCollectionController } from './controllers/order-collection.controller';
import { OrderCollectionMallAccountController } from './controllers/order-collection-mall-account.controller';
import { OrderCollectionService } from './services/order-collection.service';
import { OrderCollectionMallAccountService } from './services/order-collection-mall-account.service';
import { CoupangDirectshipService } from './coupang-directship/coupang-directship.service';
import { ReturnTransfersController } from './return-transfers/return-transfers.controller';
import { ReturnTransfersService } from './return-transfers/return-transfers.service';

@Module({
  imports: [ChannelsModule],
  controllers: [
    OrdersController,
    OrderCollectionController,
    OrderCollectionMallAccountController,
    ReturnsController,
    CsController,
    ReviewsController,
    ReturnTransfersController,
  ],
  providers: [
    OrdersService,
    OrderCollectionService,
    OrderCollectionMallAccountService,
    CoupangDirectshipService,
    ReturnsService,
    CsService,
    ReviewsService,
    ReturnTransfersService,
  ],
})
export class OrdersModule {}

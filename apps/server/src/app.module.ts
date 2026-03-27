import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { ProfitLossModule } from './profit-loss/profit-loss.module';
import { AdsModule } from './ads/ads.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ThumbnailsModule } from './thumbnails/thumbnails.module';
import { ReturnsModule } from './returns/returns.module';
import { CompaniesModule } from './companies/companies.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AlertsModule } from './alerts/alerts.module';
import { AgentTasksModule } from './agent-tasks/agent-tasks.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ActivityEventsModule } from './activity-events/activity-events.module';
import { CoupangDashboardModule } from './coupang-dashboard/coupang-dashboard.module';
import { TextAiModule } from './text-ai/text-ai.module';
import { ImageAiModule } from './image-ai/image-ai.module';
import { RenderImageModule } from './render-image/render-image.module';

@Module({
  imports: [
    PrismaModule,
    ProductsModule,
    OrdersModule,
    InventoryModule,
    ProfitLossModule,
    AdsModule,
    ReviewsModule,
    ThumbnailsModule,
    ReturnsModule,
    CompaniesModule,
    DashboardModule,
    AlertsModule,
    AgentTasksModule,
    SourcingModule,
    WorkflowsModule,
    ActivityEventsModule,
    CoupangDashboardModule,
    TextAiModule,
    ImageAiModule,
    RenderImageModule,
  ],
})
export class AppModule {}

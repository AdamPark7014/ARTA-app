import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { CsrfMiddleware } from './common/csrf.middleware';
import { RequestIdMiddleware } from './common/logging/request-id.middleware';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { StudioModule } from './studio/studio.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { FinanceModule } from './finance/finance.module';
import { UsersModule } from './users/users.module';
import { UploadsModule } from './uploads/uploads.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { TicketingModule } from './ticketing/ticketing.module';
import { TasksModule } from './tasks/tasks.module';
import { SponsorsModule } from './sponsors/sponsors.module';
import { FoldersModule } from './folders/folders.module';
import { VendorModule } from './vendor/vendor.module';
import { AuditModule } from './audit/audit.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AutomationsModule } from './automations/automations.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { DigestsModule } from './digests/digests.module';
import { JobsModule } from './jobs/jobs.module';
import { BillingModule } from './billing/billing.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 240 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    EventsModule,
    ChecklistsModule,
    StudioModule,
    PurchaseOrdersModule,
    FinanceModule,
    UsersModule,
    UploadsModule,
    CampaignsModule,
    TicketingModule,
    TasksModule,
    SponsorsModule,
    FoldersModule,
    VendorModule,
    AuditModule,
    AnalyticsModule,
    WebhooksModule,
    AutomationsModule,
    OrganizationsModule,
    DigestsModule,
    JobsModule,
    BillingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, CsrfMiddleware).forRoutes('*');
  }
}

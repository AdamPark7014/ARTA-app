import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
  ],
})
export class AppModule {}

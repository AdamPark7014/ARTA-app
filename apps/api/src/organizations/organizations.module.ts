import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DigestsModule } from '../digests/digests.module';
import { OrganizationsController } from './organizations.controller';
import { OrgInvitesController } from './org-invites.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, DigestsModule, NotificationsModule],
  controllers: [OrganizationsController, OrgInvitesController],
})
export class OrganizationsModule {}

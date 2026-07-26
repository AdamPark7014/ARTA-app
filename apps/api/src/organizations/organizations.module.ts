import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DigestsModule } from '../digests/digests.module';
import { OrganizationsController } from './organizations.controller';
import { OrgInvitesController } from './org-invites.controller';

@Module({
  imports: [AuthModule, DigestsModule],
  controllers: [OrganizationsController, OrgInvitesController],
})
export class OrganizationsModule {}

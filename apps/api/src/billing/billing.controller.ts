import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';
import { tenantIdOf, type TenantUser } from '../common/tenant';
import { BillingService } from './billing.service';

class CheckoutDto {
  @IsString()
  @IsIn(['OPS', 'ENTERPRISE'])
  plan!: 'OPS' | 'ENTERPRISE';
}

@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService) {}

  private assertBillingAdmin(user: TenantUser & { permissions: string[] }) {
    if (
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Solo dirección gestiona billing');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  status(@Req() req: { user: TenantUser & { permissions: string[] } }) {
    this.assertBillingAdmin(req.user);
    return this.billing.status(tenantIdOf(req.user));
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  checkout(
    @Req() req: { user: TenantUser & { permissions: string[]; email?: string } },
    @Body() body: CheckoutDto,
  ) {
    this.assertBillingAdmin(req.user);
    return this.billing.createCheckoutSession({
      organizationId: tenantIdOf(req.user),
      plan: body.plan,
      email: req.user.email,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('portal')
  portal(@Req() req: { user: TenantUser & { permissions: string[] } }) {
    this.assertBillingAdmin(req.user);
    return this.billing.createPortalSession(tenantIdOf(req.user));
  }

  /** Stripe signed webhook — no JWT / CSRF (exempt). Requires raw body. */
  @Post('webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const raw = req.rawBody;
    if (!raw || !signature) {
      throw new ForbiddenException('Webhook inválido');
    }
    return this.billing.handleWebhook(raw, signature);
  }
}

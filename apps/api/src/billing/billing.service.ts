import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrgPlan } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  isStripeConfigured,
  planFromPriceId,
  priceIdForPlan,
  webOrigin,
} from './billing.util';

@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);
  private stripe: Stripe | null = null;

  constructor(private prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) {
      this.stripe = new Stripe(key);
    }
  }

  private client(): Stripe {
    if (!this.stripe || !isStripeConfigured()) {
      throw new ServiceUnavailableException(
        'Stripe no configurado (STRIPE_SECRET_KEY + STRIPE_PRICE_OPS + STRIPE_PRICE_ENTERPRISE)',
      );
    }
    return this.stripe;
  }

  async status(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new BadRequestException('Organización no encontrada');
    return {
      configured: isStripeConfigured(),
      plan: org.plan,
      billingStatus: org.billingStatus || (org.plan === 'TRIAL' ? 'trialing' : 'none'),
      stripeCustomerId: org.stripeCustomerId,
      stripeSubscriptionId: org.stripeSubscriptionId,
      prices: {
        OPS: !!process.env.STRIPE_PRICE_OPS,
        ENTERPRISE: !!process.env.STRIPE_PRICE_ENTERPRISE,
      },
    };
  }

  private async ensureCustomer(orgId: string, email?: string | null) {
    const stripe = this.client();
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Organización no encontrada');
    if (org.stripeCustomerId) {
      return { org, customerId: org.stripeCustomerId };
    }

    const customer = await stripe.customers.create({
      name: org.name,
      email: email || undefined,
      metadata: { organizationId: org.id, slug: org.slug },
    });
    const updated = await this.prisma.organization.update({
      where: { id: org.id },
      data: { stripeCustomerId: customer.id },
    });
    return { org: updated, customerId: customer.id };
  }

  async createCheckoutSession(opts: {
    organizationId: string;
    plan: 'OPS' | 'ENTERPRISE';
    email?: string | null;
  }) {
    const stripe = this.client();
    const priceId = priceIdForPlan(opts.plan);
    if (!priceId) throw new BadRequestException(`Price ID no configurado para ${opts.plan}`);

    const { customerId } = await this.ensureCustomer(opts.organizationId, opts.email);
    const origin = webOrigin();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/organizations?billing=success`,
      cancel_url: `${origin}/organizations?billing=cancel`,
      client_reference_id: opts.organizationId,
      metadata: { organizationId: opts.organizationId, plan: opts.plan },
      subscription_data: {
        metadata: { organizationId: opts.organizationId, plan: opts.plan },
      },
      allow_promotion_codes: true,
    });

    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(organizationId: string) {
    const stripe = this.client();
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org?.stripeCustomerId) {
      throw new BadRequestException('La organización aún no tiene cliente Stripe');
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${webOrigin()}/organizations`,
    });
    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const stripe = this.client();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException('STRIPE_WEBHOOK_SECRET no configurado');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (e) {
      this.log.warn(`Webhook signature failed: ${e instanceof Error ? e.message : e}`);
      throw new BadRequestException('Firma webhook inválida');
    }

    return this.processStripeEvent(event);
  }

  /** Apply a verified Stripe event (unit-tested without live Stripe). */
  async processStripeEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await this.onSubscriptionChanged(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        this.log.debug(`Unhandled Stripe event ${event.type}`);
    }

    return { received: true, type: event.type };
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const orgId =
      session.metadata?.organizationId ||
      session.client_reference_id ||
      undefined;
    if (!orgId) return;

    const subId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;

    let plan = (session.metadata?.plan as OrgPlan | undefined) || null;
    let priceId: string | null = null;

    if (subId) {
      const sub = await this.client().subscriptions.retrieve(subId);
      priceId = sub.items.data[0]?.price?.id || null;
      plan = planFromPriceId(priceId) || plan;
      await this.applySubscription(orgId, {
        customerId: customerId || undefined,
        subscriptionId: subId,
        priceId,
        plan: plan || 'OPS',
        status: sub.status,
      });
      return;
    }

    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        ...(plan ? { plan } : {}),
        billingStatus: 'active',
      },
    });
  }

  private async onSubscriptionChanged(sub: Stripe.Subscription) {
    const orgId =
      sub.metadata?.organizationId ||
      (await this.orgIdFromCustomer(
        typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      ));
    if (!orgId) return;

    const priceId = sub.items.data[0]?.price?.id || null;
    const plan = planFromPriceId(priceId) || (sub.metadata?.plan as OrgPlan | undefined) || 'OPS';
    await this.applySubscription(orgId, {
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      subscriptionId: sub.id,
      priceId,
      plan,
      status: sub.status,
    });
  }

  private async onSubscriptionDeleted(sub: Stripe.Subscription) {
    const orgId =
      sub.metadata?.organizationId ||
      (await this.orgIdFromCustomer(
        typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      ));
    if (!orgId) return;
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        plan: 'TRIAL',
        billingStatus: 'canceled',
        stripeSubscriptionId: null,
        stripePriceId: null,
      },
    });
  }

  private async onPaymentFailed(invoice: Stripe.Invoice) {
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    const orgId = await this.orgIdFromCustomer(customerId);
    if (!orgId) return;
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { billingStatus: 'past_due' },
    });
  }

  private async orgIdFromCustomer(customerId?: string | null) {
    if (!customerId) return null;
    const org = await this.prisma.organization.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    return org?.id || null;
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): string {
    switch (status) {
      case 'active':
        return 'active';
      case 'trialing':
        return 'trialing';
      case 'past_due':
      case 'unpaid':
        return 'past_due';
      case 'canceled':
      case 'incomplete_expired':
        return 'canceled';
      default:
        return status;
    }
  }

  private async applySubscription(
    orgId: string,
    data: {
      customerId?: string;
      subscriptionId: string;
      priceId: string | null;
      plan: OrgPlan;
      status: Stripe.Subscription.Status;
    },
  ) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        plan: data.plan,
        stripeCustomerId: data.customerId || undefined,
        stripeSubscriptionId: data.subscriptionId,
        stripePriceId: data.priceId,
        billingStatus: this.mapStripeStatus(data.status),
        active: data.status !== 'canceled' && data.status !== 'incomplete_expired',
      },
    });
    this.log.log(`Billing sync org=${orgId} plan=${data.plan} status=${data.status}`);
  }
}

import { BillingService } from './billing.service';
import type Stripe from 'stripe';

describe('BillingService.processStripeEvent', () => {
  const prev = { ...process.env };
  let prisma: {
    organization: {
      update: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let billing: BillingService;

  beforeEach(() => {
    process.env.STRIPE_PRICE_OPS = 'price_ops';
    process.env.STRIPE_PRICE_ENTERPRISE = 'price_ent';
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    prisma = {
      organization: {
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
    };
    billing = new BillingService(prisma as never);
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('upgrades org plan on subscription.updated with mapped price', async () => {
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          customer: 'cus_1',
          metadata: { organizationId: 'org_a' },
          items: { data: [{ price: { id: 'price_ent' } }] },
        },
      },
    } as unknown as Stripe.Event;

    const result = await billing.processStripeEvent(event);
    expect(result).toEqual({ received: true, type: 'customer.subscription.updated' });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_a' },
      data: expect.objectContaining({
        plan: 'ENTERPRISE',
        stripeSubscriptionId: 'sub_1',
        stripePriceId: 'price_ent',
        billingStatus: 'active',
      }),
    });
  });

  it('downgrades to TRIAL on subscription.deleted', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          metadata: { organizationId: 'org_a' },
        },
      },
    } as unknown as Stripe.Event;

    await billing.processStripeEvent(event);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_a' },
      data: expect.objectContaining({
        plan: 'TRIAL',
        billingStatus: 'canceled',
        stripeSubscriptionId: null,
      }),
    });
  });

  it('marks past_due on invoice.payment_failed', async () => {
    prisma.organization.findFirst.mockResolvedValue({ id: 'org_b' });
    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_b',
        },
      },
    } as unknown as Stripe.Event;

    await billing.processStripeEvent(event);
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_b' },
      select: { id: true },
    });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_b' },
      data: { billingStatus: 'past_due' },
    });
  });

  it('applies plan from checkout.session.completed without subscription retrieve when no sub', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { organizationId: 'org_c', plan: 'OPS' },
          client_reference_id: 'org_c',
          customer: 'cus_c',
          subscription: null,
        },
      },
    } as unknown as Stripe.Event;

    await billing.processStripeEvent(event);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_c' },
      data: expect.objectContaining({
        plan: 'OPS',
        stripeCustomerId: 'cus_c',
        billingStatus: 'active',
      }),
    });
  });
});

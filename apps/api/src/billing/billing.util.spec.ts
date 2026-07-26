import { planFromPriceId, priceIdForPlan, isStripeConfigured } from './billing.util';

describe('billing.util', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('maps price ids from env to OrgPlan', () => {
    process.env.STRIPE_PRICE_OPS = 'price_ops';
    process.env.STRIPE_PRICE_ENTERPRISE = 'price_ent';
    expect(planFromPriceId('price_ops')).toBe('OPS');
    expect(planFromPriceId('price_ent')).toBe('ENTERPRISE');
    expect(planFromPriceId('price_other')).toBeNull();
  });

  it('resolves price id for checkout plan', () => {
    process.env.STRIPE_PRICE_OPS = 'price_ops';
    process.env.STRIPE_PRICE_ENTERPRISE = 'price_ent';
    expect(priceIdForPlan('OPS')).toBe('price_ops');
    expect(priceIdForPlan('ENTERPRISE')).toBe('price_ent');
  });

  it('isStripeConfigured requires secret + both prices', () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_OPS;
    delete process.env.STRIPE_PRICE_ENTERPRISE;
    expect(isStripeConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_OPS = 'price_ops';
    process.env.STRIPE_PRICE_ENTERPRISE = 'price_ent';
    expect(isStripeConfigured()).toBe(true);
  });
});

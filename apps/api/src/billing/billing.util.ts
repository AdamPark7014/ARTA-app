import { OrgPlan } from '@prisma/client';

/** Map Stripe Price IDs (env) → ARTA OrgPlan. */
export function planFromPriceId(priceId: string | null | undefined): OrgPlan | null {
  if (!priceId) return null;
  const ops = process.env.STRIPE_PRICE_OPS;
  const enterprise = process.env.STRIPE_PRICE_ENTERPRISE;
  if (ops && priceId === ops) return 'OPS';
  if (enterprise && priceId === enterprise) return 'ENTERPRISE';
  return null;
}

export function priceIdForPlan(plan: 'OPS' | 'ENTERPRISE'): string | null {
  if (plan === 'OPS') return process.env.STRIPE_PRICE_OPS || null;
  if (plan === 'ENTERPRISE') return process.env.STRIPE_PRICE_ENTERPRISE || null;
  return null;
}

export function isStripeConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRICE_OPS &&
    process.env.STRIPE_PRICE_ENTERPRISE
  );
}

/** WEB_ORIGIN may be a comma-separated CORS allowlist (see main.ts corsOrigins) — use the first entry as the canonical link target. */
export function webOrigin(): string {
  const raw =
    process.env.WEB_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_WEB_URL ||
    'http://localhost:3000';
  return raw.split(',')[0].trim().replace(/\/$/, '');
}

import { buildClickSignString, mapPaymentResultStatus, normalizePaymentProvider } from '../../../functions/src/payment-core';

describe('provider-agnostic subscription payments', () => {
  it('keeps Stripe optional by defaulting unknown providers to manual', () => {
    expect(normalizePaymentProvider(undefined, 'manual')).toBe('manual');
    expect(normalizePaymentProvider('stripe', 'manual')).toBe('stripe');
    expect(normalizePaymentProvider('unsupported', 'manual')).toBe('manual');
  });

  it('maps successful provider results to active subscription access', () => {
    expect(mapPaymentResultStatus('confirmed')).toEqual({
      isPaid: true,
      subscriptionStatus: 'active',
      administrativeLock: false,
      subscriptionAccessLocked: false,
    });
  });

  it('maps failed or canceled provider results to locked subscription access', () => {
    expect(mapPaymentResultStatus('past_due')).toMatchObject({
      isPaid: false,
      subscriptionStatus: 'past_due',
      subscriptionAccessLocked: true,
    });
    expect(mapPaymentResultStatus('canceled')).toMatchObject({
      isPaid: false,
      subscriptionStatus: 'canceled',
      subscriptionAccessLocked: true,
    });
  });

  it('builds Click prepare and complete signatures deterministically', () => {
    const prepare = buildClickSignString({
      clickTransId: '123',
      serviceId: '456',
      secretKey: 'secret',
      merchantTransId: 'intent-1',
      amount: '10000',
      action: '0',
      signTime: '2026-05-20 10:00:00',
    });
    const complete = buildClickSignString({
      clickTransId: '123',
      serviceId: '456',
      secretKey: 'secret',
      merchantTransId: 'intent-1',
      merchantPrepareId: 'prep-1',
      amount: '10000',
      action: '1',
      signTime: '2026-05-20 10:00:00',
    });
    expect(prepare).toHaveLength(32);
    expect(complete).toHaveLength(32);
    expect(prepare).not.toBe(complete);
  });
});

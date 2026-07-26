import { LiveHttpTicketingProvider, AremaStubProvider, resolveProvider } from './arema.provider';

describe('ticketing providers', () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env = { ...prev };
  });

  it('resolveProvider uses stub by default', () => {
    delete process.env.TICKETING_SYNC_MODE;
    expect(resolveProvider('arema')).toBeInstanceOf(AremaStubProvider);
  });

  it('resolveProvider uses live-http when mode=live', () => {
    process.env.TICKETING_SYNC_MODE = 'live';
    expect(resolveProvider('arema')).toBeInstanceOf(LiveHttpTicketingProvider);
  });

  it('stub never decreases sold', async () => {
    process.env.TICKETING_STUB_OCCUPANCY = '0.1';
    const p = new AremaStubProvider();
    const out = await p.fetchSold({
      boletera: 'arema',
      eventName: 'Show',
      zones: [{ zona: 'A', aforo: 100, precio: 10, sold: 80 }],
    });
    expect(out[0].sold).toBe(80);
  });

  it('live provider throws without URL', async () => {
    delete process.env.TICKETING_SYNC_URL;
    const p = new LiveHttpTicketingProvider();
    await expect(
      p.fetchSold({
        boletera: 'arema',
        eventName: 'Show',
        zones: [{ zona: 'A', aforo: 10, precio: 1, sold: 0 }],
      }),
    ).rejects.toThrow(/TICKETING_SYNC_URL/);
  });
});

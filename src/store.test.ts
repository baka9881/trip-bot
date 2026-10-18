import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A throwaway database for each test run; the store reads TRIP_BOT_DB when first imported.
process.env.TRIP_BOT_DB = join(mkdtempSync(join(tmpdir(), 'trip-bot-')), 'test.db');
let store: typeof import('./store');
beforeAll(async () => { store = await import('./store'); });

describe('store', () => {
  it('keeps watches, scans and alerts', () => {
    const watch = store.createWatch({ origin: 'Taipei', originLabel: '台北', region: 'Japan', regionLabel: '日本', tripLength: 'week', sendDigest: true });
    const scannedAt = new Date('2026-10-18T03:00:00Z');
    store.addObservations([
      { watchId: watch.id, city: 'Tokyo', outboundDate: '2026-10-29', returnDate: '2026-11-04', stops: 0, duration: null, price: 6871, currency: 'TWD', scannedAt },
      { watchId: watch.id, city: 'Okinawa', outboundDate: '2026-10-29', returnDate: '2026-11-05', stops: 0, duration: null, price: 4699, currency: 'TWD', scannedAt },
    ]);
    expect(store.observations(watch.id, { scannedAt }).map(row => row.city)).toEqual(['Okinawa', 'Tokyo']);
    expect(store.observations(watch.id, { scannedAt: null })).toEqual([]);
    expect(store.findWatch('Taipei', 'Japan', 'week')).toMatchObject({ id: watch.id, sendDigest: true, active: true, lastScanAt: null });

    const message = { title: '日本促銷', body: '沖繩 NT$4,699', url: '' };
    store.addAlert({ watchId: watch.id, kind: 'deal', city: 'Okinawa', price: 4699, eventKey: 'deal:1', message }, scannedAt);
    store.addAlert({ watchId: watch.id, kind: 'deal', city: 'Okinawa', price: 4699, eventKey: 'deal:1', message }, scannedAt);
    expect(store.dueAlerts(new Date('2026-10-18T04:00:00Z'))).toHaveLength(1);
    expect(store.recentAlerts({ kind: 'deal', since: new Date('2026-10-01'), tripLengths: ['week'] })[0]?.message).toEqual(message);
    expect(store.recentAlerts({ kind: 'deal', since: new Date('2026-10-01'), tripLengths: ['weekend'] })).toEqual([]);
  });

  it('lets only one run claim a due watch', () => {
    const watch = store.createWatch({ origin: 'Taipei', originLabel: '台北', region: 'Korea', regionLabel: '韓國', tripLength: 'weekend' });
    const next = new Date(watch.nextScanAt.getTime() + 6 * 3_600_000);
    expect(store.claimWatch(watch, next)).toBe(true);
    expect(store.claimWatch(watch, next)).toBe(false);
  });

  it('rolls a failed transaction back', () => {
    const watch = store.createWatch({ origin: 'Taipei', originLabel: '台北', region: 'Thailand', regionLabel: '泰國', tripLength: 'week' });
    expect(() => store.transaction(() => {
      store.updateWatch(watch.id, { lastError: 'boom' });
      throw new Error('fail');
    })).toThrow('fail');
    expect(store.findWatch('Taipei', 'Thailand', 'week')?.lastError).toBeNull();
  });
});

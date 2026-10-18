// One-time import of the Flight Finder deal tables (exported with psql json_agg) into trip-bot's
// SQLite store, so the usual prices and promotion history carry over.
//   tsx scripts/import-flight-finder.ts <watches.json> <observations.json> <alerts.json>
import { readFileSync } from 'node:fs';
import { addAlert, addObservations, createWatch, listWatches, transaction, updateAlert, type AlertMessage } from '../src/store';

type Json = Record<string, unknown>;
const load = (file: string): Json[] => JSON.parse(readFileSync(file, 'utf8').trim() || '[]') ?? [];
const date = (value: unknown) => (typeof value === 'string' ? new Date(value) : null);

const [watchesFile, observationsFile, alertsFile] = process.argv.slice(2);
if (!watchesFile || !observationsFile || !alertsFile) throw new Error('usage: import-flight-finder <watches.json> <observations.json> <alerts.json>');
if (listWatches().length) throw new Error('The trip-bot database already has watches; import into an empty one.');

const watches = load(watchesFile);
const observations = load(observationsFile);
const alerts = load(alertsFile);

transaction(() => {
  for (const watch of watches) {
    createWatch({
      id: String(watch.id), origin: String(watch.origin), originLabel: String(watch.originLabel), region: String(watch.region),
      regionLabel: String(watch.regionLabel), currency: String(watch.currency), country: String(watch.country), tripLength: String(watch.tripLength),
      sendDigest: Boolean(watch.sendDigest), active: Boolean(watch.active), intervalHours: Number(watch.intervalHours), digestHour: Number(watch.digestHour),
      nextScanAt: date(watch.nextScanAt)!, lastScanAt: date(watch.lastScanAt), lastDigestDay: (watch.lastDigestDay as string | null) ?? null,
      lastError: (watch.lastError as string | null) ?? null, failureCount: Number(watch.failureCount), failureAlerted: Boolean(watch.failureAlerted),
    });
  }
  addObservations(observations.map(row => ({
    watchId: String(row.watchId), city: String(row.city), outboundDate: String(row.outboundDate), returnDate: String(row.returnDate),
    stops: Number(row.stops), duration: (row.duration as string | null) ?? null, price: Number(row.price), currency: String(row.currency), scannedAt: date(row.scannedAt)!,
  })));
  for (const alert of alerts) {
    addAlert({ watchId: String(alert.watchId), kind: alert.kind as 'deal' | 'digest' | 'health', city: (alert.city as string | null) ?? null,
      price: alert.price === null ? null : Number(alert.price), eventKey: String(alert.eventKey), message: alert.message as AlertMessage }, date(alert.createdAt)!);
  }
});
// Everything imported was already delivered (or given up on) by Flight Finder: none of it is pending.
for (const [index] of alerts.entries()) updateAlert(index + 1, { pending: false, attempts: 1, nextAttemptAt: new Date(), lastError: null });
console.log(`imported ${watches.length} watches, ${observations.length} observations, ${alerts.length} alerts`);

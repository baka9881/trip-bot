// The trip bot's data in one SQLite file (Node's built-in node:sqlite), replacing Flight Finder's
// PostgreSQL: region watches, every scan's prices, and the alerts sent from them.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DB_PATH = process.env.TRIP_BOT_DB ?? fileURLToPath(new URL('../data/trip-bot.db', import.meta.url));

/** A region scanned for cheap round trips, e.g. Taipei → Japan, one-week trips. */
export interface DealWatch {
  id: string; origin: string; originLabel: string; region: string; regionLabel: string; currency: string; country: string;
  tripLength: string; sendDigest: boolean; active: boolean; intervalHours: number; digestHour: number;
  nextScanAt: Date; lastScanAt: Date | null; lastDigestDay: string | null; lastError: string | null;
  failureCount: number; failureAlerted: boolean;
}

/** One city's cheapest round trip in one scan. */
export interface DealObservation {
  watchId: string; city: string; outboundDate: string; returnDate: string; stops: number; duration: string | null;
  price: number; currency: string; scannedAt: Date;
}

/** A promotion, daily list or scan-health message, queued for Telegram. */
export interface DealAlert {
  id: number; watchId: string; kind: 'deal' | 'digest' | 'health'; city: string | null; price: number | null; eventKey: string;
  message: AlertMessage; createdAt: Date; pending: boolean; attempts: number; nextAttemptAt: Date; lastError: string | null;
}

export interface AlertMessage { title: string; body: string; url: string; data?: Record<string, unknown> }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS watches (
  id TEXT PRIMARY KEY, origin TEXT NOT NULL, originLabel TEXT NOT NULL, region TEXT NOT NULL, regionLabel TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TWD', country TEXT NOT NULL DEFAULT 'TW', tripLength TEXT NOT NULL,
  sendDigest INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, intervalHours INTEGER NOT NULL DEFAULT 6,
  digestHour INTEGER NOT NULL DEFAULT 14, nextScanAt TEXT NOT NULL, lastScanAt TEXT, lastDigestDay TEXT, lastError TEXT,
  failureCount INTEGER NOT NULL DEFAULT 0, failureAlerted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY, watchId TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE, city TEXT NOT NULL,
  outboundDate TEXT NOT NULL, returnDate TEXT NOT NULL, stops INTEGER NOT NULL, duration TEXT, price REAL NOT NULL,
  currency TEXT NOT NULL, scannedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS observations_scan ON observations (watchId, scannedAt);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY, watchId TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  city TEXT, price REAL, eventKey TEXT NOT NULL UNIQUE, message TEXT NOT NULL, createdAt TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 1, attempts INTEGER NOT NULL DEFAULT 0, nextAttemptAt TEXT NOT NULL, lastError TEXT
);
CREATE INDEX IF NOT EXISTS alerts_pending ON alerts (pending, nextAttemptAt);
`;

let db: DatabaseSync | null = null;
function open(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;');
  db.exec(SCHEMA);
  return db;
}

type Row = Record<string, unknown>;
const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);
const toDate = (value: unknown) => (typeof value === 'string' ? new Date(value) : null);

function watchFrom(row: Row): DealWatch {
  return {
    ...(row as unknown as DealWatch),
    sendDigest: Boolean(row.sendDigest), active: Boolean(row.active), failureAlerted: Boolean(row.failureAlerted),
    nextScanAt: toDate(row.nextScanAt)!, lastScanAt: toDate(row.lastScanAt),
  };
}
const observationFrom = (row: Row): DealObservation => ({ ...(row as unknown as DealObservation), scannedAt: toDate(row.scannedAt)! });
const alertFrom = (row: Row): DealAlert => ({
  ...(row as unknown as DealAlert), message: JSON.parse(String(row.message)) as AlertMessage, pending: Boolean(row.pending),
  createdAt: toDate(row.createdAt)!, nextAttemptAt: toDate(row.nextAttemptAt)!,
});

/** Run `work` in one transaction (the store is synchronous, so this is all-or-nothing on errors). */
export function transaction<T>(work: () => T): T {
  const database = open();
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function listWatches(filter: { active?: boolean } = {}): DealWatch[] {
  const rows = filter.active === undefined
    ? open().prepare('SELECT * FROM watches ORDER BY region, tripLength').all()
    : open().prepare('SELECT * FROM watches WHERE active = ? ORDER BY region, tripLength').all(filter.active ? 1 : 0);
  return (rows as Row[]).map(watchFrom);
}

export function findWatch(origin: string, region: string, tripLength: string): DealWatch | null {
  const row = open().prepare('SELECT * FROM watches WHERE origin = ? AND region = ? AND tripLength = ?').get(origin, region, tripLength) as Row | undefined;
  return row ? watchFrom(row) : null;
}

const WATCH_COLUMNS = ['origin', 'originLabel', 'region', 'regionLabel', 'currency', 'country', 'tripLength', 'sendDigest', 'active',
  'intervalHours', 'digestHour', 'nextScanAt', 'lastScanAt', 'lastDigestDay', 'lastError', 'failureCount', 'failureAlerted'] as const;
const sqlValue = (value: unknown) => (value instanceof Date ? value.toISOString() : typeof value === 'boolean' ? Number(value) : value ?? null);

export function createWatch(watch: Pick<DealWatch, 'origin' | 'originLabel' | 'region' | 'regionLabel' | 'tripLength'> & Partial<DealWatch>): DealWatch {
  const full: DealWatch = { id: watch.id ?? `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, currency: 'TWD', country: 'TW',
    sendDigest: false, active: true, intervalHours: 6, digestHour: 14, nextScanAt: new Date(), lastScanAt: null, lastDigestDay: null,
    lastError: null, failureCount: 0, failureAlerted: false, ...watch };
  open().prepare(`INSERT INTO watches (id, ${WATCH_COLUMNS.join(', ')}) VALUES (?, ${WATCH_COLUMNS.map(() => '?').join(', ')})`)
    .run(full.id, ...WATCH_COLUMNS.map(column => sqlValue(full[column])) as never[]);
  return full;
}

export function updateWatch(id: string, patch: Partial<Omit<DealWatch, 'id'>>): void {
  const columns = Object.keys(patch).filter(column => (WATCH_COLUMNS as readonly string[]).includes(column));
  if (!columns.length) return;
  open().prepare(`UPDATE watches SET ${columns.map(column => `${column} = ?`).join(', ')} WHERE id = ?`)
    .run(...columns.map(column => sqlValue((patch as Row)[column])) as never[], id);
}

/** Move a due watch's next scan forward unless another run already did; true when this run owns the scan. */
export function claimWatch(watch: DealWatch, nextScanAt: Date): boolean {
  return open().prepare('UPDATE watches SET nextScanAt = ? WHERE id = ? AND active = 1 AND nextScanAt = ?')
    .run(nextScanAt.toISOString(), watch.id, watch.nextScanAt.toISOString()).changes === 1;
}

export function setRegionActive(region: string, active: boolean): number {
  return Number(open().prepare('UPDATE watches SET active = ? WHERE region = ?').run(active ? 1 : 0, region).changes);
}

export function scheduleAllNow(): number {
  return Number(open().prepare('UPDATE watches SET nextScanAt = ? WHERE active = 1').run(new Date().toISOString()).changes);
}

/** A watch's observations: one scan (cheapest first), or a time window for price history. */
export function observations(watchId: string, where: { scannedAt?: Date | null; since?: Date; before?: Date; currency?: string }): DealObservation[] {
  // Asking for a scan that has not happened yet means nothing, never "every row".
  if ('scannedAt' in where && !where.scannedAt) return [];
  const clauses = ['watchId = ?'];
  const values: unknown[] = [watchId];
  if (where.scannedAt) { clauses.push('scannedAt = ?'); values.push(iso(where.scannedAt)); }
  if (where.since) { clauses.push('scannedAt >= ?'); values.push(iso(where.since)); }
  if (where.before) { clauses.push('scannedAt < ?'); values.push(iso(where.before)); }
  if (where.currency) { clauses.push('currency = ?'); values.push(where.currency); }
  return (open().prepare(`SELECT * FROM observations WHERE ${clauses.join(' AND ')} ORDER BY price, id`).all(...values as never[]) as Row[]).map(observationFrom);
}

export function addObservations(rows: readonly DealObservation[]): void {
  const insert = open().prepare('INSERT INTO observations (watchId, city, outboundDate, returnDate, stops, duration, price, currency, scannedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of rows) insert.run(row.watchId, row.city, row.outboundDate, row.returnDate, row.stops, row.duration, row.price, row.currency, row.scannedAt.toISOString());
}

/** Queue an alert once: a repeated event key is ignored. */
export function addAlert(alert: Pick<DealAlert, 'watchId' | 'kind' | 'eventKey' | 'message'> & Partial<Pick<DealAlert, 'city' | 'price'>>, now = new Date()): void {
  open().prepare('INSERT OR IGNORE INTO alerts (watchId, kind, city, price, eventKey, message, createdAt, nextAttemptAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(alert.watchId, alert.kind, alert.city ?? null, alert.price ?? null, alert.eventKey, JSON.stringify(alert.message), now.toISOString(), now.toISOString());
}

export function recentAlerts(where: { kind: DealAlert['kind']; watchId?: string; since: Date; tripLengths?: readonly string[]; limit?: number }): DealAlert[] {
  const clauses = ['a.kind = ?', 'a.createdAt >= ?'];
  const values: unknown[] = [where.kind, iso(where.since)];
  if (where.watchId) { clauses.push('a.watchId = ?'); values.push(where.watchId); }
  if (where.tripLengths) { clauses.push(`w.tripLength IN (${where.tripLengths.map(() => '?').join(', ')})`); values.push(...where.tripLengths); }
  const sql = `SELECT a.* FROM alerts a JOIN watches w ON w.id = a.watchId WHERE ${clauses.join(' AND ')} ORDER BY a.createdAt DESC LIMIT ?`;
  return (open().prepare(sql).all(...values as never[], where.limit ?? 50) as Row[]).map(alertFrom);
}

export function dueAlerts(now: Date, limit = 20): DealAlert[] {
  return (open().prepare('SELECT * FROM alerts WHERE pending = 1 AND nextAttemptAt <= ? ORDER BY createdAt LIMIT ?').all(now.toISOString(), limit) as Row[]).map(alertFrom);
}

export function updateAlert(id: number, patch: Pick<DealAlert, 'pending' | 'attempts' | 'nextAttemptAt' | 'lastError'>): void {
  open().prepare('UPDATE alerts SET pending = ?, attempts = ?, nextAttemptAt = ?, lastError = ? WHERE id = ?')
    .run(patch.pending ? 1 : 0, patch.attempts, patch.nextAttemptAt.toISOString(), patch.lastError, id);
}

/** Drop scan rows older than the price history needs (the usual price looks back 30 days). */
export function pruneObservations(before: Date): number {
  return Number(open().prepare('DELETE FROM observations WHERE scannedAt < ?').run(before.toISOString()).changes);
}

import type { Page } from 'playwright';
import { launchBrowser, createStealthContext } from '../google/browser';

/**
 * Room types of one hotel on Booking.com, each with its own photos and facts, fetched only when
 * the user asks about that hotel: one hotel page per request keeps the home network from being
 * flagged as a bot by booking sites.
 */
export interface BookingRoom {
  name: string;
  guests: number | null;
  stayTotal: number | null; // whole stay, in the requested currency
  freeCancelUntil: string | null; // "M/D"
  sizeM2: number | null;
  beds: string[]; // e.g. ["1 double bed"]
  bathroom: 'private' | 'shared' | null;
  photos: string[];
  /** The room's own bathroom photo, for hotels whose Google "Bathroom" photos show a public bath. */
  bathroomPhoto?: string | null;
  /** Its photos show a bunk or loft bed, whatever the bed list says. */
  bunkInPhotos: boolean;
  /** Sold through Booking Basic (a reseller, block id "bbasic…"): no room photos, other terms. */
  resale: boolean;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MAX_ROOM_TYPES = 4;
const PHOTOS_PER_ROOM = 3;

/** The Booking.com page Google's price link leads to (its "pcurl"), or null for another site. */
export function bookingUrlFromGoogle(link: string): string | null {
  try {
    const target = new URL(link).searchParams.get('pcurl') ?? link;
    return new URL(target).hostname.endsWith('booking.com') ? target : null;
  } catch { return null; }
}

/** Guests, stay total and free-cancellation date from one row of Booking's room table. */
export function parseRoomRow(text: string): Pick<BookingRoom, 'guests' | 'stayTotal' | 'freeCancelUntil'> {
  const guests = /Guests:\s*(\d+)\s*adult/i.exec(text) ?? /Max persons:\s*(\d+)/i.exec(text) ?? /\b(\d+)\s*adults?\b/i.exec(text);
  const price = /(?:TWD|NT\$)\s?([\d,]+)/.exec(text);
  const cancel = /Free cancellation before (\d{1,2}) ([A-Za-z]+)/i.exec(text);
  const month = cancel ? MONTHS.indexOf(cancel[2]!.toLowerCase()) + 1 : 0;
  return {
    guests: guests ? Number(guests[1]) : null,
    stayTotal: price ? Number(price[1]!.replace(/,/g, '')) : null,
    freeCancelUntil: month ? `${month}/${Number(cancel![1])}` : null,
  };
}

/** Size, beds and bathroom from the room's cell in the table ("11 m²") or its details dialog ("Room size 11 m²"). */
export function parseRoomFacts(text: string): Pick<BookingRoom, 'sizeM2' | 'beds' | 'bathroom'> {
  const size = /(?:Room size\s*)?(\d+)\s*m²/i.exec(text);
  const beds = [...text.matchAll(/\b(\d+)\s+(?:extra-large |large |small )?(double|single|twin|queen|king|sofa|bunk|futon)[a-z ]*?beds?\b/gi)]
    .map(match => match[0].replace(/\s+/g, ' ').trim());
  const bathroom = /Private bathroom/i.test(text) ? 'private' : /Shared bathroom|Shared toilet/i.test(text) ? 'shared' : null;
  return { sizeM2: size ? Number(size[1]) : null, beds: [...new Set(beds)], bathroom };
}

/**
 * Each room's photos from the hotel page's own photo list, where every photo names the rooms it
 * shows ("large_url: '…max1024x768/1.webp…', associated_rooms: [ '229544903' ]"). Reading the
 * page source needs no further requests (the room dialogs fetch theirs and fail for robots).
 */
export function parseRoomPhotos(html: string): Map<string, string[]> {
  return new Map([...parseRoomPhotoSets(html)].map(([room, set]) => [room, set.urls]));
}

/**
 * Each room's kept photos, and whether their descriptions show a bunk or loft bed: a hotel may
 * list a room as "2 single beds" while its photos show one bed up a ladder (2026-10-18, DOYANEN
 * HOTELS BAKURO), which the user should hear before booking.
 */
export function parseRoomPhotoSets(html: string): Map<string, { urls: string[]; bunk: boolean; bathroom: string | null }> {
  const byRoom = new Map<string, { urls: string[]; bunk: boolean; bathroom: string | null }>();
  const alts = new Map<string, string>();
  for (const match of html.matchAll(/"AccommodationPhoto:(\d+)":\{[^{}]*?"altText":"((?:[^"\\]|\\.)*)"/g)) alts.set(match[1]!, match[2]!);
  const urls = parseRoomPhotoUrls(html, alts);
  for (const [room, photos] of urls) {
    const bunk = photos.some(photo => /\b(bunk|loft|ladder)\b/i.test(photo.alt));
    byRoom.set(room, { urls: roomViewsFirst(photos), bunk, bathroom: photos.find(photo => photo.kind === 'bathroom')?.url ?? null });
  }
  return byRoom;
}

// Up to two views of the room itself, then one of the bathroom.
const roomViewsFirst = (photos: readonly { url: string; kind: 'room' | 'bathroom' }[]) => [
  ...photos.filter(photo => photo.kind === 'room').slice(0, 2),
  ...photos.filter(photo => photo.kind === 'bathroom').slice(0, 1),
].map(photo => photo.url);

function parseRoomPhotoUrls(html: string, alts: ReadonlyMap<string, string>): Map<string, { url: string; kind: 'room' | 'bathroom'; alt: string }[]> {
  const byRoom = new Map<string, { url: string; kind: 'room' | 'bathroom'; alt: string }[]>();
  for (const match of html.matchAll(/large_url:\s*'([^']+)'\s*,\s*associated_rooms:\s*\[([^\]]*)\]/g)) {
    const id = /\/(\d+)\.\w+\?/.exec(match[1]!)?.[1] ?? '';
    const alt = alts.get(id) ?? '';
    const kind = photoKind(alt);
    if (!kind) continue;
    // Telegram takes JPEG photos; Booking serves the same image as .jpg.
    const url = match[1]!.replace(/\.webp(\?|$)/, '.jpg$1');
    for (const room of match[2]!.matchAll(/'(\d+)'/g)) {
      const photos = byRoom.get(room[1]!) ?? [];
      if (!photos.some(photo => photo.url === url)) photos.push({ url, kind, alt });
      byRoom.set(room[1]!, photos);
    }
  }
  return byRoom;
}

/** Whether a photo description shows the room, the bathroom, or neither (amenities, people, close-ups). */
export function photoKind(alt: string): 'room' | 'bathroom' | null {
  if (/\b(person|people|man|woman|holding|hand)\b/i.test(alt)) return null;
  // Public baths and shared washrooms are not the room's (the user has no interest in them).
  if (/\b(public|communal|shared|onsen|hot spring|sauna|spa)\b/i.test(alt)) return null;
  if (/\b(bed|beds|bedroom|hotel room|bunk|futon|tatami)\b/i.test(alt)) return 'room';
  if (/\b(bathroom|toilet|shower|bathtub|tub|sink)\b/i.test(alt)) return 'bathroom';
  return null;
}

async function readRooms(page: Page): Promise<BookingRoom[]> {
  // Rows of the availability table; one room type can have several rows (rates). Keep its cheapest.
  const rows = await page.evaluate(() => [...document.querySelectorAll('.hprt-table tbody tr')].map(row => ({
    id: (row.getAttribute('data-block-id') ?? '').split('_')[0] ?? '',
    name: row.querySelector('.hprt-roomtype-link')?.textContent?.trim() ?? '',
    text: (row as HTMLElement).innerText.replace(/\s+/g, ' '),
    // The room cell lists size, beds and bathroom; it spans the room's later rate rows.
    room: (row.querySelector('.hprt-table-cell-roomtype') as HTMLElement | null)?.innerText ?? '',
    // The row also shows struck-through and tax amounts; the price display holds what you pay.
    price: row.querySelector('.bui-price-display__value, .prco-valign-middle-helper')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  })));
  const photos = parseRoomPhotoSets(await page.content());
  const byId = new Map<string, BookingRoom>();
  let last = { name: '', room: '' };
  for (const row of rows) {
    if (row.name) last = { name: row.name, room: row.room }; // later rates of the same room leave the room cell empty
    if (!row.id) continue;
    const parsed = { ...parseRoomRow(row.text), stayTotal: parseRoomRow(row.price).stayTotal };
    const known = byId.get(row.id);
    if (known && (parsed.stayTotal ?? Infinity) >= (known.stayTotal ?? Infinity)) continue;
    byId.set(row.id, { name: row.name || known?.name || last.name, ...parsed, ...parseRoomFacts(row.room || last.room),
      photos: (photos.get(row.id)?.urls ?? []).slice(0, PHOTOS_PER_ROOM), bunkInPhotos: photos.get(row.id)?.bunk ?? false,
      bathroomPhoto: photos.get(row.id)?.bathroom ?? null, resale: !/^\d+$/.test(row.id) });
  }
  return [...byId.values()].slice(0, MAX_ROOM_TYPES);
}

/**
 * Opens the hotel's Booking.com page for the stay (from Google's link, which lands on a search
 * page highlighting the hotel) and reads each room type. Null when Booking shows no room table,
 * e.g. when it challenges the visit.
 */
export async function fetchBookingRooms(bookingUrl: string): Promise<{ hotelUrl: string; rooms: BookingRoom[] } | null> {
  const search = new URL(bookingUrl);
  const browser = await launchBrowser();
  try {
    const context = await createStealthContext(browser);
    const page = await context.newPage();
    await page.goto(search.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!page.url().includes('/hotel/')) {
      const hotelLink = await page.waitForFunction(() => document.querySelector('a[href*="/hotel/"]')?.getAttribute('href') ?? null,
        undefined, { timeout: 15_000 }).then(handle => handle.jsonValue() as Promise<string>, () => null);
      if (!hotelLink) return null;
      const hotel = new URL(hotelLink, search);
      for (const key of ['checkin', 'checkout', 'group_adults', 'no_rooms', 'selected_currency']) {
        const value = search.searchParams.get(key);
        if (value) hotel.searchParams.set(key, value);
      }
      hotel.searchParams.set('lang', 'en-gb');
      await page.goto(hotel.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }
    const listed = await page.waitForSelector('.hprt-table', { timeout: 15_000 }).then(() => true, () => false);
    if (!listed) return null;
    const hotelUrl = page.url().replace(/#.*$/, '');
    const rooms = await readRooms(page);
    await context.close();
    return { hotelUrl, rooms };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

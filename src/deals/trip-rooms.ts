import { launchBrowser } from '../google/browser';
import { parseRoomFacts, type BookingRoom } from './booking-rooms';

/**
 * Room types of one hotel on Trip.com, for when Booking.com does not sell the hotel or shows no
 * room photos. Each room card on the hotel page carries its own photos, beds, size, bathroom and
 * the stay's total; fetched only when the user asks about that hotel, one page per request.
 */
const MAX_ROOM_TYPES = 4;
const PHOTOS_PER_ROOM = 3;
const SQ_FT_PER_M2 = 10.7639;

/** Trip.com's hotel id behind a Google price link ("…tw.trip.com/hotels/redirect?hotelid=21161347…"), or null. */
export function tripHotelIdFromGoogle(link: string): string | null {
  try {
    const target = new URL(new URL(link).searchParams.get('pcurl') ?? link);
    if (!/(^|\.)trip\.com$/.test(target.hostname)) return null;
    const id = target.searchParams.get('hotelid') ?? target.searchParams.get('hotelId');
    return id && /^\d+$/.test(id) ? id : null;
  } catch { return null; }
}

/**
 * A room photo at a viewable size, as JPEG: the CDN sends WebP only to clients that accept it
 * (Telegram's fetcher gets JPEG), and the "_W_1080_808_R5_Q70" size is one it serves.
 */
export function tripPhotoUrl(url: string): string | null {
  const match = /^(https:\/\/[a-z0-9.-]*tripcdn\.com\/images\/[A-Za-z0-9]+)(?:_[A-Z0-9_]+)?\.(?:webp|jpg|jpeg|png)/.exec(url);
  return match ? `${match[1]}_W_1080_808_R5_Q70.jpg` : null;
}

/** Trip.com showed its sign-in screen instead of the hotel: too many automated visits. */
export class TripSignInWallError extends Error {
  constructor() {
    super('Trip.com 要求登入才能看（自動查詢太頻繁）');
    this.name = 'TripSignInWallError';
  }
}

/**
 * The room's name from the first line of its card. Some cards render without line breaks, so the
 * line runs on into beds and prices ("Deluxe 2-Bed Room102 small double bedsHas window(s)…");
 * keep it up to the room word. Null for a line that names no room.
 */
export function tripRoomName(line: string): string | null {
  // The room word may run straight into a digit ("Room102 …"), so end it at anything but a letter.
  // "Room"/"Suite"/"Studio" end a name ("Non-smoking Double Room"); a bed word only when there is none.
  // First drop the beds a run-on line carries after the name ("…Room102 small double beds…": guests,
  // then the bed count), so a name without a room word ("SS Connect 1", APA Midosuji, 2026-10-19) is
  // not cut inside the beds into "12 double".
  const trimmed = line.trim().replace(/\d*\s*\d+ (?:(?:small|large|extra-large|semi)[- ])?(?:single|double|queen|king|twin|bunk|sofa)\b.*$/i, '').trim();
  const ending = (words: string) => new RegExp(`^(.*?\\b(?:${words})(?![a-z])(?:\\s*\\([^)]*\\))?)`, 'i').exec(trimmed)?.[1]?.trim();
  const name = ending('room|suite|studio') ?? ending('twin|double|single|family') ?? (/[a-z]{2}/i.test(trimmed) ? trimmed : undefined);
  return name && name.length <= 60 ? name : null;
}

/** One room card's text: "Non-smoking Double Room | 1 double bed | 118 ft² | Private bathroom | … Total price: TWD 20,446 | …". */
export function parseTripCard(text: string): Pick<BookingRoom, 'sizeM2' | 'beds' | 'bathroom' | 'stayTotal'> {
  const facts = parseRoomFacts(text);
  const squareFeet = /(\d+)\s*ft²/.exec(text);
  const total = /Total price:\s*(?:TWD|NT\$)\s?([\d,]+)/i.exec(text);
  return {
    ...facts,
    sizeM2: facts.sizeM2 ?? (squareFeet ? Math.round(Number(squareFeet[1]) / SQ_FT_PER_M2) : null),
    stayTotal: total ? Number(total[1]!.replace(/,/g, '')) : null,
  };
}

/**
 * Drop a photo every room shares (the hotel's cover shot leads each card), so each room shows what
 * is its own; a room whose photos are all shared keeps them rather than showing nothing.
 */
export function withoutSharedPhotos<T extends { photos: string[] }>(rooms: readonly T[]): T[] {
  if (rooms.length < 2) return [...rooms];
  const shared = new Set(rooms[0]!.photos.filter(photo => rooms.every(room => room.photos.includes(photo))));
  return rooms.map(room => {
    const own = room.photos.filter(photo => !shared.has(photo));
    return own.length ? { ...room, photos: own } : room;
  });
}

/** The hotel's Trip.com page for the stay and its room types; null when no room cards show. */
export async function fetchTripRooms(hotelId: string, stay: { outboundDate: string; returnDate: string }, currency: string):
  Promise<{ hotelUrl: string; rooms: BookingRoom[] } | null> {
  const url = new URL('https://www.trip.com/hotels/detail/');
  url.searchParams.set('hotelId', hotelId);
  url.searchParams.set('checkIn', stay.outboundDate);
  url.searchParams.set('checkOut', stay.returnDate);
  url.searchParams.set('adult', '2');
  url.searchParams.set('crn', '1');
  url.searchParams.set('curr', currency);
  url.searchParams.set('locale', 'en-US');
  const browser = await launchBrowser();
  try {
    // A plain context, not the Google stealth one: Trip.com never requests its room list when that
    // context's fingerprint overrides run (2026-10-18), and loads it for an ordinary browser.
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Taipei', viewport: { width: 1366, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
    const page = await context.newPage();
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const listed = await page.waitForSelector('[class*="commonRoomCard"] img', { timeout: 20_000 }).then(() => true, () => false);
    // After a few automated visits Trip.com sends the page to its sign-in screen (2026-10-18).
    if (/\/account\/signin/.test(page.url())) throw new TripSignInWallError();
    if (!listed) return null;
    // A room appears as a card with its name, beds, photos and price; the page also repeats name-only
    // and details-only cards, so keep cards that have both a name line and photos.
    const cards = await page.evaluate(() => [...document.querySelectorAll('[class*="commonRoomCard"]')].map(card => ({
      text: (card as HTMLElement).innerText.replace(/\n+/g, ' | '),
      name: (card as HTMLElement).innerText.split('\n')[0]?.trim() ?? '',
      photos: [...card.querySelectorAll('img')].map(image => (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src),
    })));
    await context.close();
    const rooms = new Map<string, BookingRoom>();
    for (const card of cards) {
      const name = tripRoomName(card.name);
      if (!name || !card.photos.length || rooms.has(name)) continue;
      const photos = [...new Set(card.photos.map(tripPhotoUrl).filter((photo): photo is string => photo !== null))].slice(0, PHOTOS_PER_ROOM);
      rooms.set(name, { name, guests: null, freeCancelUntil: null, ...parseTripCard(card.text), photos, bunkInPhotos: false, resale: false });
    }
    return { hotelUrl: url.toString(), rooms: withoutSharedPhotos([...rooms.values()]).slice(0, MAX_ROOM_TYPES) };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

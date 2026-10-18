/** One hotel card from a Google Hotels search list. Prices are Google's nightly rate. */
export interface HotelListQuote {
  name: string;
  nightly: number;
  rating: number | null;
  badge: string | null; // Google's own label, e.g. "GREAT DEAL"
  stars: number | null; // Google's hotel class ("a 3-star hotel"); null for guesthouses, hostels and rentals
  /** Google's comparison with this hotel's own usual price, e.g. 22 for "22% less than usual". */
  belowUsualPct?: number | null;
  /**
   * A shared large bath (大浴場, separated by sex, used by choice) besides the rooms' own
   * bathrooms. Google files its photos under "Bathroom", which read as a shared bathroom.
   */
  publicBath?: boolean;
}

/**
 * Google rates a hotel's current price against its own usual price only in
 * the list's link labels: "Prices starting from NT$2,796, <name> DEAL 22% less
 * than usual". Returns hotel name → percent below usual.
 */
export interface SiteRating { site: string; score: number; reviews: number }

/**
 * Ratings other travel sites give a hotel, as its Reviews tab lists them
 * ("Tripadvisor\n4.5/5 · 11 reviews"). Used when Google hides its own score;
 * the site with the most reviews wins.
 */
export function bestSiteRating(reviewsText: string): SiteRating | null {
  const lines = reviewsText.split('\n').map(line => line.trim()).filter(Boolean);
  let best: SiteRating | null = null;
  for (let index = 1; index < lines.length; index++) {
    const match = /^([1-5](?:\.\d)?)\/5\s*·\s*([\d,]+) reviews?$/i.exec(lines[index]!);
    if (!match) continue;
    const rating = { site: lines[index - 1]!, score: Number(match[1]), reviews: Number(match[2]!.replace(/,/g, '')) };
    if (!best || rating.reviews > best.reviews) best = rating;
  }
  return best;
}

// Labels separate words with no-break and narrow spaces; card names use plain ones.
const normalizeLabel = (label: string) => label.replace(/\s+/g, ' ').trim();

/** Guest ratings from link labels ("4.3 out of 5 stars from 350 reviews, <name>"), for layouts that do not print them. */
export function parseLabelRatings(labels: readonly string[]): Map<string, number> {
  const found = new Map<string, number>();
  for (const label of labels) {
    const match = /^([1-5](?:\.\d)?) out of 5 stars from [\d.,]+K? reviews, (.+)$/i.exec(normalizeLabel(label));
    if (match) found.set(match[2]!.trim(), Number(match[1]));
  }
  return found;
}

export function parseBelowUsual(labels: readonly string[]): Map<string, number> {
  const found = new Map<string, number>();
  for (const label of labels) {
    const match = /^Prices starting from \S+, (.+?) (?:GREAT DEAL|GREAT PRICE|DEAL) (\d{1,2})% less than usual$/i.exec(normalizeLabel(label));
    if (match) found.set(match[1]!.trim(), Number(match[2]));
  }
  return found;
}

export interface HotelSummary {
  checkIn: string;
  checkOut: string;
  nights: number;
  hotels: number;
  cheapest: HotelListQuote;
  /** Cheapest among hotels rated at least GOOD_RATING, when one is listed. */
  cheapestGood: HotelListQuote | null;
  deals: number; // cards Google marks as a deal
}

const PRICE = /^(?:NT\$|[A-Z]{1,3}\$|[A-Z]{3}\s?|[$¥€£])\s?(\d{1,3}(?:,\d{3})+|\d+)$/;
const BADGE = /^(?:GREAT DEAL|GREAT PRICE|DEAL|\d{1,2}% less than usual)$/i;
const RATING = /^[1-5]\.\d$/;
const STARS = /\b([1-5])-star hotel\b/;
const PUBLIC_BATH = /\b(public bath|hot spring|onsen|outdoor bath)\b|大浴場|公共澡堂|溫泉/i;
export const GOOD_RATING = 3.5;
export const MIN_STARS = 2;
// Shared-room stays: these names sell beds, not rooms.
const SHARED_ROOM = /hostel|capsule|dorm|guest ?house|backpacker|bunk|ゲストハウス|カプセル|ドミトリー|ホステル|相部屋|青年旅/i;

/**
 * A stay the traveller gets to themselves: Google lists it with a hotel class
 * of at least two stars and its name does not advertise beds. Hostels, capsule
 * hotels and guesthouses usually carry no class and are cheapest, so without
 * this check they would top every list.
 */
export function isPrivateHotel(hotel: Pick<HotelListQuote, 'name' | 'stars'>): boolean {
  return hotel.stars !== null && hotel.stars >= MIN_STARS && !SHARED_ROOM.test(hotel.name);
}

/**
 * Parse Google Hotels list text. A card is: name, optional badge, price, then
 * either a rating or "View prices". Requiring that trailing line keeps filter
 * chips such as "Under $1,500" from being read as hotels.
 */
export function parseHotelList(text: string): HotelListQuote[] {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const hotels: HotelListQuote[] = [];
  const seen = new Set<string>();
  for (let index = 1; index < lines.length; index++) {
    const price = PRICE.exec(lines[index]!);
    if (!price) continue;
    const after = lines[index + 1] ?? '';
    // Two list layouts: price then rating, or price then the amenities/class lines.
    if (!RATING.test(after) && after !== 'View prices' && !/^Amenities for |^[1-5]-star hotel/.test(after)) continue;
    let nameIndex = index - 1;
    let badge: string | null = null;
    if (BADGE.test(lines[nameIndex]!)) { badge = lines[nameIndex]!.toUpperCase(); nameIndex -= 1; }
    const name = lines[nameIndex] && normalizeLabel(lines[nameIndex]!);
    if (!name || name.length > 120 || PRICE.test(name) || BADGE.test(name) || seen.has(name)) continue;
    const nightly = Number(price[1]!.replace(/,/g, ''));
    if (!Number.isFinite(nightly) || nightly <= 0) continue;
    seen.add(name);
    // The class sits a few lines below the price ("Amenities for X, a 3-star hotel." or "3-star hotel").
    // The amenities line also says whether there is a large public bath ("Public bath", "Hot spring").
    let stars: number | null = null;
    let publicBath = false;
    for (let next = index + 1; next < Math.min(lines.length, index + 15) && lines[next] !== 'View prices'; next++) {
      if (PUBLIC_BATH.test(lines[next]!)) publicBath = true;
      const match = STARS.exec(lines[next]!);
      if (match && stars === null) stars = Number(match[1]);
    }
    hotels.push({ name, nightly, rating: RATING.test(after) ? Number(after) : null, badge, stars, ...(publicBath ? { publicBath } : {}) });
  }
  return hotels;
}

const DAY_MS = 86_400_000;

export interface RoomOffer { name: string; nightly: number }
export type RoomCheck =
  | { status: 'private'; room: RoomOffer; options: RoomOffer[]; alsoShared: boolean } // room: cheapest one you do not share; options: every private room listed, cheapest first; alsoShared: dorm beds listed too
  | { status: 'shared' } // every listed room is a bed in a shared room
  | { status: 'unknown' }; // the prices panel named no rooms

const ROOM_NAME = /room|bed|dorm|suite|twin|double|single|studio|apartment|capsule|cabin|bunk|ルーム|和室|洋室|ツイン|ダブル|シングル|部屋/i;
const SHARED_ROOM_TYPE = /dorm|bunk|capsule|cabin|bed in|shared room|mixed|ドミトリー|カプセル|相部屋|床位/i;

/**
 * A bed sold in a room shared with strangers ("Bunk Bed in Mixed Dormitory Room"). Narrower than
 * SHARED_ROOM_TYPE: a private room may have a bunk bed ("Superior Twin Room, 1 bunk bed").
 */
export function isDormBed(roomName: string): boolean {
  return /dorm|capsule|bed in|shared room|mixed|ドミトリー|カプセル|相部屋|床位/i.test(roomName);
}

/**
 * Room offers named in a Google Hotels prices panel ("Featured options").
 * A room is a room-like line followed, past at most two condition lines, by
 * its nightly price; provider rows ("Booking.com", "NT$…") are not room-like.
 */
export function parseRoomOffers(panelText: string): RoomOffer[] {
  const lines = panelText.split('\n').map(line => line.trim()).filter(Boolean);
  const start = lines.findIndex(line => /Featured options/i.test(line));
  const end = lines.findIndex((line, index) => index > start && /^All options$/i.test(line));
  if (start < 0) return [];
  const section = lines.slice(start + 1, end > start ? end : undefined);
  const rooms: RoomOffer[] = [];
  for (let index = 0; index < section.length; index++) {
    const name = section[index]!;
    if (!ROOM_NAME.test(name) || PRICE.test(name) || name.length > 140) continue;
    for (let next = index + 1; next <= index + 3 && next < section.length; next++) {
      const price = PRICE.exec(section[next]!);
      if (price) { rooms.push({ name, nightly: Number(price[1]!.replace(/,/g, '')) }); break; }
      if (ROOM_NAME.test(section[next]!) && !/cancellation|guests?|breakfast|balcony/i.test(section[next]!)) break;
    }
  }
  return rooms;
}

/**
 * A hotel's photos: rooms are per room type, from the prices panel's room rows (each sold room
 * shows its own photo); bedroom and bathroom come from the Photos tab's groups.
 */
export interface HotelPhotos { rooms: { name: string; url: string }[]; bedroom: string[]; bathroom: string[] }

/** The private rooms the prices panel shows a photo for, once each, at a viewable size. */
export function roomPhotos(rows: readonly { name: string; url: string }[]): { name: string; url: string }[] {
  const seen = new Set<string>();
  const photos: { name: string; url: string }[] = [];
  for (const row of rows) {
    const url = largePhotoUrl(row.url);
    if (!url || seen.has(url) || !ROOM_NAME.test(row.name) || SHARED_ROOM_TYPE.test(row.name) || PRICE.test(row.name)) continue;
    seen.add(url);
    photos.push({ name: row.name, url });
  }
  return photos;
}

/**
 * A Google photo thumbnail at a size worth viewing: the URL ends in sizing
 * options such as "=w253-h189-k-no", which the image server honours.
 */
export function largePhotoUrl(url: string, width = 1024): string | null {
  if (!/^https:\/\/lh\d\.googleusercontent\.com\//.test(url)) return null;
  return url.replace(/=[\w-]*$/, '') + `=w${width}-k-no`;
}

/** One booking site's offer; freeCancelUntil is "M/D" from "Free cancellation until Oct 27". */
export interface SiteOffer { site: string; nightly: number; url?: string; freeCancelUntil?: string; breakfast?: boolean }

/**
 * Give each offer the link to book it: the panel's "All options" rows are
 * anchors (Google's /travel/lodging/clk redirect to the site's page for the
 * hotel and dates) whose text is the row itself. Sponsored rows are ads and
 * are not matched.
 */
export function attachSiteLinks(offers: readonly SiteOffer[], links: readonly { text: string; url: string }[]): SiteOffer[] {
  const bySite = new Map<string, string>();
  for (const link of links) {
    if (!/\/travel\/lodging\/clk/.test(link.url)) continue;
    const site = parseSiteOffers(`All options\n${link.text}\nVisit site`)[0]?.site;
    if (site && !bySite.has(site)) bySite.set(site, link.url);
  }
  return offers.map(offer => (bySite.has(offer.site) ? { ...offer, url: bySite.get(offer.site) } : offer));
}

/**
 * Each booking site's price in a prices panel's "All options" list (Booking.com,
 * Agoda, Trip.com, the hotel's own site…), cheapest first. A site block runs from
 * its name to "Visit site"; when it shows a struck-through and a member price,
 * the last one is what you pay.
 */
export function parseSiteOffers(panelText: string): SiteOffer[] {
  const lines = panelText.split('\n').map(line => line.trim()).filter(Boolean);
  const start = lines.findIndex(line => /^All options$/i.test(line));
  if (start < 0) return [];
  const best = new Map<string, SiteOffer>();
  let block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^View more options|^Track this hotel/i.test(line)) break;
    if (!/^Visit site$/i.test(line)) { block.push(line); continue; }
    const prices = block.map(entry => PRICE.exec(entry)).filter((match): match is RegExpExecArray => match !== null);
    const site = block[0];
    if (site && prices.length && !PRICE.test(site)) {
      const nightly = Number(prices.at(-1)![1]!.replace(/,/g, ''));
      // An official-site block reads "<hotel name>" then "Official Site"; label it as such.
      const label = block.some(entry => /^Official Site$/i.test(entry)) ? '官網' : site;
      const terms = block.join(' ');
      const cancel = /Free cancellation until (\w{3}) (\d{1,2})/i.exec(terms);
      const month = cancel ? MONTHS.indexOf(cancel[1]!.slice(0, 1).toUpperCase() + cancel[1]!.slice(1, 3).toLowerCase()) + 1 : 0;
      const offer: SiteOffer = { site: label, nightly,
        ...(month ? { freeCancelUntil: `${month}/${cancel![2]}` } : {}),
        ...(/breakfast/i.test(terms) ? { breakfast: true } : {}) };
      if (nightly < (best.get(label)?.nightly ?? Infinity)) best.set(label, offer);
    }
    block = [];
  }
  return [...best.values()].sort((a, b) => a.nightly - b.nightly);
}

/** Whether a hotel's listed rooms include one you would not share. */
export function classifyRooms(rooms: readonly RoomOffer[]): RoomCheck {
  if (!rooms.length) return { status: 'unknown' };
  const own = rooms.filter(room => !SHARED_ROOM_TYPE.test(room.name)).sort((a, b) => a.nightly - b.nightly);
  return own.length ? { status: 'private', room: own[0]!, options: own, alsoShared: own.length < rooms.length } : { status: 'shared' };
}

/** Summary over private hotels only; null when the list had none. */
export function summarizeHotels(hotels: readonly HotelListQuote[], checkIn: string, checkOut: string): HotelSummary | null {
  const byPrice = hotels.filter(isPrivateHotel).sort((a, b) => a.nightly - b.nightly);
  if (!byPrice.length) return null;
  const nights = Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / DAY_MS);
  if (!Number.isInteger(nights) || nights < 1) return null;
  return {
    checkIn, checkOut, nights, hotels: byPrice.length,
    cheapest: byPrice[0]!,
    cheapestGood: byPrice.find(hotel => hotel.rating !== null && hotel.rating >= GOOD_RATING) ?? null,
    deals: byPrice.filter(hotel => hotel.badge !== null).length,
  };
}

const PLACE = /^[\p{L}][\p{L} .'-]{0,48}$/u;

// "cheap 3 star hotels in …" makes Google apply its 3-star filter: rooms, not the
// hostel beds Google files under two stars, and the query keeps the stay dates.
const LIST_QUERY = 'cheap 3 star hotels in';

export interface NearbyArea { area: string; label: string; ride: string }

/**
 * Cheaper places to stay a short train ride from a big city. Ride times are
 * rough guides to the city centre, shown so the saving can be weighed.
 */
const NEARBY_AREAS: Record<string, NearbyArea[]> = {
  Tokyo: [
    { area: 'Saitama', label: '埼玉（大宮、浦和）', ride: '到東京站電車約 30–40 分鐘' },
    { area: 'Kawasaki', label: '川崎', ride: '到東京站電車約 20 分鐘' },
    { area: 'Chiba', label: '千葉', ride: '到東京站電車約 40 分鐘' },
  ],
  Osaka: [
    { area: 'Sakai', label: '堺', ride: '到難波電車約 15–20 分鐘' },
    { area: 'Amagasaki', label: '尼崎', ride: '到梅田電車約 10 分鐘' },
  ],
  Kyoto: [{ area: 'Otsu', label: '大津', ride: '到京都站電車約 10 分鐘' }],
  Nagoya: [{ area: 'Gifu', label: '岐阜', ride: '到名古屋站電車約 20 分鐘' }],
  Fukuoka: [{ area: 'Kurume', label: '久留米', ride: '到博多新幹線約 15 分鐘' }],
  Sapporo: [{ area: 'Otaru', label: '小樽', ride: '到札幌站電車約 35 分鐘' }],
};

export function nearbyAreas(city: string): NearbyArea[] {
  return NEARBY_AREAS[city] ?? [];
}

export function buildHotelSearchUrl(params: { city: string; checkIn: string; checkOut: string; currency: string; country: string }): string {
  if (!PLACE.test(params.city) || !/^\d{4}-\d{2}-\d{2}$/.test(params.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(params.checkOut)) {
    throw new Error('Invalid hotel search');
  }
  const url = new URL('https://www.google.com/travel/search');
  url.searchParams.set('q', `${LIST_QUERY} ${params.city} from ${params.checkIn} to ${params.checkOut}`);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('curr', params.currency);
  url.searchParams.set('gl', params.country);
  return url.toString();
}

/**
 * Google Hotels search for a stay, in Chinese, optionally led by one hotel.
 * Google only applies the dates when the query starts "hotels in <city> from
 * … to …"; a query that starts with a hotel name opens with default dates.
 */
export function buildHotelNameUrl(params: { name?: string; city: string; checkIn: string; checkOut: string; currency: string; country?: string; language?: string }): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(params.checkOut)) throw new Error('Invalid hotel dates');
  const url = new URL('https://www.google.com/travel/search');
  // One hotel: "hotels in" keeps it first. The whole list: the same cheap 3-star search the tool used.
  const query = params.name ? `hotels in ${params.city} from ${params.checkIn} to ${params.checkOut} ${params.name.slice(0, 120)}`
    : `${LIST_QUERY} ${params.city} from ${params.checkIn} to ${params.checkOut}`;
  url.searchParams.set('q', query);
  url.searchParams.set('hl', params.language ?? 'zh-TW');
  url.searchParams.set('curr', params.currency);
  if (params.country) url.searchParams.set('gl', params.country);
  return url.toString();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** How the page's date inputs render an ISO date, e.g. "Sun, Nov 1" contains "Nov 1". */
export function dateInputLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number);
  return `${MONTHS[month! - 1]} ${day}`;
}

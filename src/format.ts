// Pure formatting and choice rules for the deals CLI, kept apart so they can be tested (format.test.mts).
// Everything here shapes what reaches the user's phone, so lines stay short and flush left.
import type { HotelPhotos, SiteOffer } from './deals/hotel-page';
import type { FlightOption } from './deals/flight-list';

export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

/** A short Chinese room type for a supplier room name such as "Standard Semi-Double Room - Non Smoking …". */
export function roomType(name: string): string {
  const types: [RegExp, string][] = [
    [/suite/i, '套房'], [/semi[- ]?double/i, '小雙人房'], [/twin|2 single|two single/i, '雙床房'],
    [/triple|3 (?:single )?beds/i, '三人房'], [/family|quad|4 beds/i, '家庭房（3–4人）'], [/japanese|tatami|和室/i, '和室'],
    [/\b(double|queen|king)\b/i, '雙人房'], [/\bsingle\b/i, '單人房'], // whole words: "Non-Smoking" contains "king"
  ];
  const type = types.find(([pattern]) => pattern.test(name))?.[1] ?? '私人房';
  return /shared bath|shared toilet|共用/i.test(name) ? `${type}（共用衛浴）` : type;
}

const BED_NAMES: [RegExp, string][] = [
  [/bunk/i, '上下鋪'], [/sofa/i, '沙發床'], [/futon/i, '和式床墊'], [/king/i, '特大雙人床'], [/queen/i, '加大雙人床'],
  [/double/i, '雙人床'], [/single|twin/i, '單人床'],
];
/** "1 double bed" → "1 張雙人床". */
export const bedText = (bed: string) => {
  const count = /^\d+/.exec(bed)?.[0] ?? '1';
  return `${count} 張${BED_NAMES.find(([pattern]) => pattern.test(bed))?.[1] ?? '床'}`;
};

/**
 * The photos a hotel gets in the list: one of its room (the listed type, else any room, else a
 * bedroom shot) and one of its bathroom, uncropped (the user's choice, 2026-10-18). Two photos,
 * not four, so each hotel stays short on a phone; the "📷 第N間房型" button shows every room type.
 */
export function listPhoto(photos: HotelPhotos, listedType: string): string[] {
  const listed = photos.rooms.find(room => roomType(room.name) === listedType);
  const room = listed?.url ?? photos.rooms[0]?.url ?? photos.bedroom[0];
  return [room, photos.bathroom[0]].filter((url): url is string => Boolean(url));
}

// Big sites with a clean Chinese interface (and the hotel's own site): recommended first, since the
// user finds most booking sites messy. A lesser-known site is suggested only when it saves real money.
const FAMILIAR_SITES = ['Agoda', 'Booking.com', 'Trip.com', 'Hotels.com', 'Expedia', '官網'];
export const WORTH_A_MESSY_SITE = 200; // per night, in the list currency
const isFamiliar = (offer: SiteOffer) => FAMILIAR_SITES.some(name => offer.site.toLowerCase().startsWith(name.toLowerCase()));

// Telegram turns "Booking.com" into a link to the site's home page, which reads as a link to the hotel; drop the domain.
export const siteName = (site: string) => site.replace(/\.(com|net|jp|tw)(\.\w{2})?$/i, '');

// Sites whose bot check turns the user away when arriving from Google's link (2026-10-17: Traveloka
// "アクセスは一時的に制限されています"); never recommended.
const BLOCKING_SITES = /^traveloka/i;

/**
 * The one site to book on: the familiar one, unless a lesser-known site is more than
 * WORTH_A_MESSY_SITE a night cheaper (the user's rule, 2026-10-18). Null without site prices.
 */
export function recommendedSite(allSites: readonly SiteOffer[]): SiteOffer | null {
  const sites = allSites.filter(site => !BLOCKING_SITES.test(site.site));
  const cheapest = sites[0];
  if (!cheapest) return null;
  const familiar = sites.find(isFamiliar);
  return familiar && familiar.nightly - cheapest.nightly <= WORTH_A_MESSY_SITE ? familiar : cheapest;
}

const AIRLINE_NAMES: [RegExp, string][] = [
  [/^EVA Air/i, '長榮'], [/^China Airlines/i, '華航'], [/^STARLUX/i, '星宇'], [/^Tigerair Taiwan/i, '台灣虎航'],
  [/^Peach/i, '樂桃'], [/^Jetstar/i, '捷星'], [/^Japan Airlines|^JAL\b/i, '日航'], [/^ANA\b|^All Nippon/i, '全日空'],
  [/^Cathay/i, '國泰'], [/^Scoot/i, '酷航'], [/^ZIPAIR/i, 'ZIPAIR'], [/^AirAsia/i, '亞洲航空'], [/^HK Express/i, '香港快運'],
  [/^Thai Lion/i, '泰國獅航'], [/^Mandarin/i, '華信'], [/^UNI Air/i, '立榮'], [/^Spring/i, '春秋'], [/^Thai Vietjet|^VietJet/i, '越捷'],
];

/** "Peach Aviation" → "樂桃"; codeshares such as "EVA AirANA" keep the operating airline. */
export function airlineName(airline: string): string {
  const name = AIRLINE_NAMES.find(([pattern]) => pattern.test(airline))?.[1];
  return name ?? airline.split(/,|(?<=[a-z])(?=[A-Z]{2,})/)[0]!.trim();
}

/**
 * The cheapest flights, always including the cheapest full-service one (bags included) so a
 * list of low-cost fares still shows what a regular airline costs.
 */
export function pickFlights(flights: readonly FlightOption[], limit: number): FlightOption[] {
  const top = flights.slice(0, limit);
  // A nonstop one when there is one: a cheaper overnight connection is no fair comparison.
  const fullService = flights.find(flight => !flight.lowCost && flight.stops === 0) ?? flights.find(flight => !flight.lowCost);
  if (!fullService || top.includes(fullService)) return top;
  return [...flights.slice(0, limit - 1), fullService];
}

/**
 * Two short lines per flight, cheapest first:
 *   1. 樂桃 NT$11,137・廉航
 *   18:50→22:20・直飛・2h30
 */
export function flightLines(flights: readonly FlightOption[], currency: string, limit = 5): string[] {
  return pickFlights(flights, limit).map((flight, index) => {
    const tags = [flight.lowCost ? '廉航（行李另付）' : null].filter(Boolean);
    const duration = flight.duration.replace(/ hr ?/, 'h').replace(/ min/, '').replace(/h(\d)$/, 'h0$1');
    return `${index + 1}. ${airlineName(flight.airline)} ${money(flight.price, currency)}${tags.length ? `・${tags.join('・')}` : ''}`
      + `\n${flight.departs}→${flight.arrives}・${flight.stops === 0 ? '直飛' : `轉機 ${flight.stops} 次`}・${duration}`;
  });
}

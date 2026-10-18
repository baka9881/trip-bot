/** One destination card from a Google Flights Explore page. */
export interface ExploreQuote {
  city: string;
  outboundDate: string; // YYYY-MM-DD
  returnDate: string; // YYYY-MM-DD
  stops: number;
  duration: string | null;
  price: number;
}

export type TripLength = 'weekend' | 'week' | 'two_weeks';

/** Explore's flexible-date choices, as the English page labels them. */
export const TRIP_LENGTHS: Record<TripLength, { option: string; header: string; label: string }> = {
  weekend: { option: 'Weekend', header: 'Weekend trip in the next 6 months', label: '週末' },
  week: { option: '1 week', header: '1-week trip in the next 6 months', label: '約一週' },
  two_weeks: { option: '2 weeks', header: '2-week trip in the next 6 months', label: '約兩週' },
};

export function isTripLength(value: unknown): value is TripLength {
  return value === 'weekend' || value === 'week' || value === 'two_weeks';
}

/** The trip length the page is showing, so a scan never files weekend fares as week-long ones. */
export function pageTripLength(text: string): TripLength | null {
  const lines = new Set(text.split('\n').map(line => line.trim()));
  const shown = (Object.keys(TRIP_LENGTHS) as TripLength[]).filter(length => lines.has(TRIP_LENGTHS[length].header));
  return shown.length === 1 ? shown[0]! : null;
}

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
// "Oct 29 – Nov 7", "Mar 19 – 25, 2027", "Dec 28, 2026 – Jan 6, 2027"
const DATE_RANGE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:, (\d{4}))? [–-] (?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) )?(\d{1,2})(?:, (\d{4}))?$/;
const PRICE = /^(?:NT\$|[A-Z]{1,3}\$|[A-Z]{3}\s?|[$¥€£])\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;
const STOPS = /^(?:Nonstop|(\d+) stops?)$/;
const DURATION = /^(?:\d+ hr)?(?: ?\d+ min)?$/;
// Only plain place names become cities; anything else on the page is chrome.
const CITY = /^[\p{L}][\p{L} .'-]{0,48}$/u;

// Headless Chromium renders the range dash with thin spaces (U+2009) around it.
const normalizeSpaces = (text: string) => text.replace(/[\u00A0\u2000-\u200A\u202F\u205F]/g, ' ').replace(/ {2,}/g, ' ').trim();

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function validDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Resolve an Explore date range to ISO dates. Google omits the year for dates
 * within the coming year, so a yearless start is the next occurrence on or
 * after `today` (allowing a week of slack for cards that start today in
 * another time zone).
 */
export function parseExploreDates(text: string, today: Date): { outboundDate: string; returnDate: string } | null {
  const match = DATE_RANGE.exec(normalizeSpaces(text));
  if (!match) return null;
  const startMonth = MONTHS[match[1]!]!, startDay = Number(match[2]);
  const endMonth = match[4] ? MONTHS[match[4]]! : startMonth, endDay = Number(match[5]);
  const startYearText = match[3] ? Number(match[3]) : null, endYearText = match[6] ? Number(match[6]) : null;
  let startYear: number;
  if (startYearText !== null) startYear = startYearText;
  else if (endYearText !== null) startYear = endMonth < startMonth ? endYearText - 1 : endYearText;
  else {
    const slack = new Date(today.getTime() - 7 * 86_400_000);
    startYear = slack.getUTCFullYear();
    if (iso(startYear, startMonth, startDay) < slack.toISOString().slice(0, 10)) startYear += 1;
  }
  const endYear = endYearText ?? (endMonth < startMonth ? startYear + 1 : startYear);
  if (!validDay(startYear, startMonth, startDay) || !validDay(endYear, endMonth, endDay)) return null;
  const outboundDate = iso(startYear, startMonth, startDay), returnDate = iso(endYear, endMonth, endDay);
  return returnDate >= outboundDate ? { outboundDate, returnDate } : null;
}

/**
 * Parse the visible text of a Google Flights Explore page. Each destination
 * renders as consecutive lines: city, date range, stops, duration, price.
 * Cards missing any piece are skipped rather than guessed. When a city
 * appears more than once, the cheapest card wins.
 */
export function parseExplorePage(text: string, today: Date): ExploreQuote[] {
  const lines = text.split('\n').map(normalizeSpaces).filter(Boolean);
  const byCity = new Map<string, ExploreQuote>();
  for (let index = 1; index < lines.length; index++) {
    const dates = parseExploreDates(lines[index]!, today);
    const city = lines[index - 1]!;
    if (!dates || !CITY.test(city)) continue;
    const stopsMatch = STOPS.exec(lines[index + 1] ?? '');
    if (!stopsMatch) continue;
    const durationLine = lines[index + 2] ?? '';
    const hasDuration = DURATION.test(durationLine) && /\d/.test(durationLine);
    const priceMatch = PRICE.exec(lines[index + (hasDuration ? 3 : 2)] ?? '');
    if (!priceMatch) continue;
    const price = Number(priceMatch[1]!.replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0) continue;
    const quote: ExploreQuote = { city, ...dates, stops: stopsMatch[1] ? Number(stopsMatch[1]) : 0,
      duration: hasDuration ? durationLine : null, price };
    const existing = byCity.get(city);
    if (!existing || quote.price < existing.price) byCity.set(city, quote);
  }
  return [...byCity.values()];
}

const PLACE = /^[A-Za-z][A-Za-z .'-]{0,48}$/;

/** Explore URL for every destination in a region; place names are plain English words only. */
export function buildExploreUrl(params: { origin: string; region: string; currency: string; country: string }): string {
  if (!PLACE.test(params.origin) || !PLACE.test(params.region)) throw new Error('Origin and region must be plain place names');
  if (!/^[A-Z]{3}$/.test(params.currency) || !/^[A-Z]{2}$/.test(params.country)) throw new Error('Invalid currency or country');
  const url = new URL('https://www.google.com/travel/explore');
  url.searchParams.set('q', `flights from ${params.origin} to ${params.region}`);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('curr', params.currency);
  url.searchParams.set('gl', params.country);
  return url.toString();
}

/** A Google Flights search for one Explore card, for the notification link. */
export function buildCardSearchUrl(origin: string, quote: Pick<ExploreQuote, 'city' | 'outboundDate' | 'returnDate'>, currency: string): string {
  const url = new URL('https://www.google.com/travel/flights');
  url.searchParams.set('q', `flights from ${origin} to ${quote.city} on ${quote.outboundDate} to ${quote.returnDate}`);
  url.searchParams.set('hl', 'zh-TW');
  url.searchParams.set('curr', currency);
  return url.toString();
}

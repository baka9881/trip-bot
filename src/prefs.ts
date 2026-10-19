// The user's standing preferences, so lists and the recommended combination leave out what they
// would never pick. Kept in data/settings.json next to the party size; `deals prefs` shows and sets them.
import type { FlightOption } from './deals/flight-list';

export interface Prefs {
  /** Earliest and latest departure, "HH:MM", for both legs (no red-eye flights). */
  departAfter: string;
  departBefore: string;
  /** Travelling with checked bags: low-cost fares are compared with an estimated bag fee added. */
  checkedBag: boolean;
  /** Estimated low-cost checked-bag fee per person, round trip, in the list currency. */
  bagFeeEstimate: number;
  minStars: number;
  minRating: number;
  /** Whole trip (flight + stay) per person; null for no limit. */
  maxPerPerson: number | null;
  /** How much more one ticket (and a same-airline return) may cost before the cheaper separate tickets win. */
  oneTicketPremium: number;
  /** Leave out rooms named as smoking rooms (the user dislikes the smell, 2026-10-19). */
  nonSmoking: boolean;
  /** The hotel's usual check-in and check-out ("HH:MM"): flights are chosen around them. */
  hotelCheckIn: string;
  hotelCheckOut: string;
}

// Chosen for the user on 2026-10-19 (they asked for a lazier flow without stating preferences):
// no red-eyes, two people with luggage, well-rated hotels, no budget cap. Separate tickets whenever
// they are cheaper (the user's choice, 2026-10-19: oneTicketPremium 0).
export const DEFAULT_PREFS: Prefs = {
  departAfter: '07:00', departBefore: '22:00', checkedBag: true, bagFeeEstimate: 1800,
  minStars: 2, minRating: 3.5, maxPerPerson: null, oneTicketPremium: 0, nonSmoking: true,
  hotelCheckIn: '15:00', hotelCheckOut: '10:00', // most Japanese business hotels
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Saved preferences over the defaults; a malformed value falls back to its default. */
export function readPrefs(saved: unknown): Prefs {
  const raw = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const prefs = { ...DEFAULT_PREFS };
  if (typeof raw.departAfter === 'string' && TIME.test(raw.departAfter)) prefs.departAfter = raw.departAfter;
  if (typeof raw.departBefore === 'string' && TIME.test(raw.departBefore)) prefs.departBefore = raw.departBefore;
  if (typeof raw.checkedBag === 'boolean') prefs.checkedBag = raw.checkedBag;
  if (typeof raw.bagFeeEstimate === 'number' && raw.bagFeeEstimate >= 0) prefs.bagFeeEstimate = raw.bagFeeEstimate;
  if (typeof raw.minStars === 'number' && raw.minStars >= 1 && raw.minStars <= 5) prefs.minStars = raw.minStars;
  if (typeof raw.minRating === 'number' && raw.minRating >= 0 && raw.minRating <= 5) prefs.minRating = raw.minRating;
  if (raw.maxPerPerson === null || (typeof raw.maxPerPerson === 'number' && raw.maxPerPerson > 0)) prefs.maxPerPerson = raw.maxPerPerson as number | null;
  if (typeof raw.oneTicketPremium === 'number' && raw.oneTicketPremium >= 0) prefs.oneTicketPremium = raw.oneTicketPremium;
  if (typeof raw.nonSmoking === 'boolean') prefs.nonSmoking = raw.nonSmoking;
  if (typeof raw.hotelCheckIn === 'string' && TIME.test(raw.hotelCheckIn)) prefs.hotelCheckIn = raw.hotelCheckIn;
  if (typeof raw.hotelCheckOut === 'string' && TIME.test(raw.hotelCheckOut)) prefs.hotelCheckOut = raw.hotelCheckOut;
  return prefs;
}

/** Whether a departure time ("18:50") is inside the allowed window. */
export function departsInWindow(departs: string, prefs: Pick<Prefs, 'departAfter' | 'departBefore'>): boolean {
  const time = departs.slice(0, 5);
  return time >= prefs.departAfter && time <= prefs.departBefore;
}

/** A fare as the user would pay it: a low-cost fare gets the estimated checked-bag fee when they travel with bags. */
export function comparableFare(flight: Pick<FlightOption, 'price' | 'lowCost'>, prefs: Pick<Prefs, 'checkedBag' | 'bagFeeEstimate'>): number {
  return flight.price + (prefs.checkedBag && flight.lowCost ? prefs.bagFeeEstimate : 0);
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const clock = (total: number) => `${String(Math.floor(((total % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((total % 60) + 60) % 60).padStart(2, '0')}`;

/**
 * Minutes from landing to the hotel door (immigration, bags, the ride into town) and from the hotel
 * door to take-off (the ride back, two hours at the airport), by destination. Naha's airport is
 * fifteen minutes from town, Narita over an hour (2026-10-19: one figure for all read 21:00 for a
 * Naha arrival the user would make by 19:30).
 */
const TRANSFERS: Record<string, readonly [number, number]> = {
  Okinawa: [75, 150], Naha: [75, 150], Ishigaki: [75, 150], Miyako: [75, 150], Fukuoka: [75, 150],
  Tokyo: [150, 210], Osaka: [120, 180], Nagoya: [120, 180], Sapporo: [120, 180],
};
const DEFAULT_TRANSFER: readonly [number, number] = [120, 180];
const transfer = (city: string | undefined) => (city && TRANSFERS[city]) || DEFAULT_TRANSFER;

// Reach the hotel by 23:30 (last trains, front desks); leave it no more than three hours before check-out.
const LATEST_AT_HOTEL = minutes('23:30');
const EARLIEST_BEFORE_CHECKOUT = 180;

/** When the party reaches the hotel after this outbound flight lands, in minutes after midnight ("+1" adds a day). */
export const atHotel = (flight: Pick<FlightOption, 'arrives'>, city?: string) =>
  minutes(flight.arrives) + (/\+1/.test(flight.arrives) ? 1440 : 0) + transfer(city)[0];

/** When the party must leave the hotel for this return flight, in minutes after midnight. */
export const leavesHotel = (flight: Pick<FlightOption, 'departs'>, city?: string) => minutes(flight.departs) - transfer(city)[1];

/** An outbound that reaches the hotel the same evening; a return that does not get the party up before dawn. */
export const fitsCheckIn = (flight: Pick<FlightOption, 'arrives'>, city?: string) => atHotel(flight, city) <= LATEST_AT_HOTEL;
export const fitsCheckOut = (flight: Pick<FlightOption, 'departs'>, prefs: Pick<Prefs, 'hotelCheckOut'>, city?: string) =>
  leavesHotel(flight, city) >= minutes(prefs.hotelCheckOut) - EARLIEST_BEFORE_CHECKOUT;

/** The cheapest of the flights that suit the stay, else of all of them: a recommendation either way. */
const cheapestSuiting = (flights: readonly FlightOption[], suits: (flight: FlightOption) => boolean, prefs: Prefs) => {
  const sorted = [...flights].sort((a, b) => comparableFare(a, prefs) - comparableFare(b, prefs));
  return sorted.filter(suits).length ? sorted.filter(suits) : sorted;
};

// A trip of three nights or fewer is short enough that half a day counts: pay up to this much more for
// an earlier outbound or a later return (2026-10-19: a weekend in Okinawa flew out at 16:10 Saturday).
export const SHORT_TRIP_NIGHTS = 3;
export const MORE_TIME_PREMIUM = 1500;

/** On a short trip, the flight that gives the most time there among those within the premium of the cheapest. */
const mostTime = (sorted: readonly FlightOption[], prefs: Prefs, nights: number | undefined, later: (a: FlightOption, b: FlightOption) => number) => {
  const cheapest = sorted[0];
  if (!cheapest || nights === undefined || nights > SHORT_TRIP_NIGHTS) return cheapest ?? null;
  return sorted.filter(flight => comparableFare(flight, prefs) - comparableFare(cheapest, prefs) <= MORE_TIME_PREMIUM).sort(later)[0] ?? cheapest;
};

/**
 * The outbound flight to recommend: in the departure window, reaching the hotel the same evening,
 * cheapest once bag fees are counted (the user asked for check-in and check-out to count, 2026-10-19);
 * on a short trip the earliest arrival within MORE_TIME_PREMIUM of that.
 */
export function chooseFlight(flights: readonly FlightOption[], prefs: Prefs, city?: string, nights?: number): FlightOption | null {
  const sorted = cheapestSuiting(flights.filter(flight => departsInWindow(flight.departs, prefs)), flight => fitsCheckIn(flight, city), prefs);
  return mostTime(sorted, prefs, nights, (a, b) => atHotel(a, city) - atHotel(b, city));
}

/**
 * How to buy the itinerary: one ticket unless separate tickets save more than the premium (a tie goes
 * to one ticket), plus the other choice so the user sees what it costs or saves.
 */
export function chooseBookingOption<T extends { separateTickets: boolean; price: number }>(options: readonly T[], premium: number): { chosen: T; other: T | null } | null {
  const oneTicket = options.filter(option => !option.separateTickets).sort((a, b) => a.price - b.price)[0];
  const separate = options.filter(option => option.separateTickets).sort((a, b) => a.price - b.price)[0];
  if (oneTicket && (!separate || oneTicket.price - separate.price <= premium)) return { chosen: oneTicket, other: separate ?? null };
  if (separate) return { chosen: separate, other: oneTicket ?? null };
  return null;
}

/** The return to pair with an outbound: in the window, cheapest, preferring the same airline (one ticket). */
export function chooseReturn(returns: readonly FlightOption[], outboundAirline: string, prefs: Prefs, city?: string, nights?: number): FlightOption | null {
  const allowed = cheapestSuiting(returns.filter(flight => departsInWindow(flight.departs, prefs)), flight => fitsCheckOut(flight, prefs, city), prefs);
  // On a short trip the latest return within the premium; otherwise the cheapest.
  const cheapest = mostTime(allowed, prefs, nights, (a, b) => leavesHotel(b, city) - leavesHotel(a, city));
  if (!cheapest) return null;
  const sameAirline = allowed.find(flight => flight.airline === outboundAirline);
  return sameAirline && comparableFare(sameAirline, prefs) - comparableFare(cheapest, prefs) <= prefs.oneTicketPremium
    && (nights === undefined || nights > SHORT_TRIP_NIGHTS || leavesHotel(sameAirline, city) >= leavesHotel(cheapest, city)) ? sameAirline : cheapest;
}

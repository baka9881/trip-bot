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
}

// Chosen for the user on 2026-10-19 (they asked for a lazier flow without stating preferences):
// no red-eyes, two people with luggage, well-rated hotels, no budget cap. Separate tickets whenever
// they are cheaper (the user's choice, 2026-10-19: oneTicketPremium 0).
export const DEFAULT_PREFS: Prefs = {
  departAfter: '07:00', departBefore: '22:00', checkedBag: true, bagFeeEstimate: 1800,
  minStars: 2, minRating: 4.0, maxPerPerson: null, oneTicketPremium: 0, nonSmoking: true,
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

/** The outbound flight to recommend: in the departure window, cheapest once bag fees are counted. */
export function chooseFlight(flights: readonly FlightOption[], prefs: Prefs): FlightOption | null {
  return flights.filter(flight => departsInWindow(flight.departs, prefs))
    .sort((a, b) => comparableFare(a, prefs) - comparableFare(b, prefs))[0] ?? null;
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
export function chooseReturn(returns: readonly FlightOption[], outboundAirline: string, prefs: Prefs): FlightOption | null {
  const allowed = returns.filter(flight => departsInWindow(flight.departs, prefs))
    .sort((a, b) => comparableFare(a, prefs) - comparableFare(b, prefs));
  const cheapest = allowed[0];
  if (!cheapest) return null;
  const sameAirline = allowed.find(flight => flight.airline === outboundAirline);
  return sameAirline && comparableFare(sameAirline, prefs) - comparableFare(cheapest, prefs) <= prefs.oneTicketPremium ? sameAirline : cheapest;
}

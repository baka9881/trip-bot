import { describe, it, expect } from 'vitest';
import { atHotel, chooseBookingOption, chooseFlight, chooseReturn, clock, comparableFare, DEFAULT_PREFS, departsInWindow, fitsCheckOut, leavesHotel, readPrefs } from './prefs';
import type { FlightOption } from './deals/flight-list';

const flight = (airline: string, price: number, departs: string, lowCost = false): FlightOption =>
  ({ airline, price, departs, arrives: '12:00', stops: 0, duration: '2 hr 30 min', lowCost });

describe('preferences', () => {
  it('falls back to the defaults for missing or malformed values', () => {
    expect(readPrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(readPrefs({ departAfter: '6am', minRating: 4.3, maxPerPerson: 20000 })).toEqual({ ...DEFAULT_PREFS, minRating: 4.3, maxPerPerson: 20000 });
  });

  it('keeps red-eye departures out', () => {
    expect(departsInWindow('06:30', DEFAULT_PREFS)).toBe(false);
    expect(departsInWindow('18:50', DEFAULT_PREFS)).toBe(true);
    expect(departsInWindow('22:30', DEFAULT_PREFS)).toBe(false);
  });

  it('compares low-cost fares with the bag fee when travelling with bags', () => {
    expect(comparableFare(flight('Peach', 7000, '10:00', true), DEFAULT_PREFS)).toBe(8800);
    expect(comparableFare(flight('Peach', 7000, '10:00', true), { ...DEFAULT_PREFS, checkedBag: false })).toBe(7000);
  });

  it('recommends the cheapest flight in the window once bags are counted', () => {
    const flights = [flight('Jetstar', 6500, '02:30', true), flight('Peach', 7000, '18:50', true), flight('EVA Air', 8500, '08:00')];
    expect(chooseFlight(flights, DEFAULT_PREFS)?.airline).toBe('EVA Air'); // 8,500 vs Peach 7,000 + 1,800
    expect(chooseFlight(flights, { ...DEFAULT_PREFS, checkedBag: false })?.airline).toBe('Peach');
  });

  it('buys separate tickets whenever they are cheaper, unless a premium for one ticket is set', () => {
    // Scoot, Taipei–Tokyo Oct 29–Nov 2: one ticket NT$9,856, separate tickets NT$8,276.
    const scoot = [{ separateTickets: true, price: 8276 }, { separateTickets: false, price: 9856 }];
    expect(chooseBookingOption(scoot, DEFAULT_PREFS.oneTicketPremium)).toEqual({ chosen: scoot[0], other: scoot[1] });
    expect(chooseBookingOption(scoot, 2000)).toEqual({ chosen: scoot[1], other: scoot[0] });
    const tie = [{ separateTickets: true, price: 9856 }, { separateTickets: false, price: 9856 }];
    expect(chooseBookingOption(tie, 0)?.chosen.separateTickets).toBe(false);
    expect(chooseBookingOption([], 0)).toBeNull();
  });

  // Tokyo, Oct 29–Nov 4 (2026-10-19): Jetstar 08:30 meant leaving the hotel at 05:00.
  it('chooses flights around the hotel\'s check-in and check-out', () => {
    const early = flight('Jetstar', 3500, '08:30', true);
    const noon = flight('Scoot', 3900, '12:10', true);
    expect(chooseReturn([early, noon], 'Scoot', DEFAULT_PREFS)?.departs).toBe('12:10');
    expect(chooseReturn([early], 'Scoot', DEFAULT_PREFS)?.departs).toBe('08:30'); // nothing better: still a flight
    const late = { ...flight('Peach', 5000, '19:00', true), arrives: '23:20' };
    const evening = { ...flight('Scoot', 5300, '14:25', true), arrives: '18:30' };
    expect(chooseFlight([late, evening], DEFAULT_PREFS)?.airline).toBe('Scoot');
    expect(clock(atHotel(evening))).toBe('21:00');
    expect(clock(leavesHotel(noon))).toBe('08:40');
    expect(fitsCheckOut(early, DEFAULT_PREFS)).toBe(false);
  });

  it('pairs the cheapest return, the same airline only within the one-ticket premium', () => {
    const returns = [flight('Jetstar', 7825, '14:55', true), flight('AirAsia', 7900, '11:00', true), flight('AirAsia', 8500, '20:00', true)];
    expect(chooseReturn(returns, 'AirAsia', DEFAULT_PREFS)?.airline).toBe('Jetstar');
    expect(chooseReturn(returns, 'AirAsia', { ...DEFAULT_PREFS, oneTicketPremium: 1000 })?.price).toBe(7900);
    expect(chooseReturn([flight('Jetstar', 7900, '14:55', true), flight('AirAsia', 7900, '11:00', true)], 'AirAsia', DEFAULT_PREFS)?.airline).toBe('AirAsia');
  });
});

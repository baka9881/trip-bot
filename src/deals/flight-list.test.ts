import { describe, it, expect } from 'vitest';
import { parseFlightLabel, parseFlightLabels } from './flight-list';

// Labels from Google Flights, Taipei → Osaka, Dec 20–25 2026.
const PEACH = 'From 11137 New Taiwan dollars round trip total. Nonstop flight with Peach Aviation. Leaves Taiwan Taoyuan International Airport at 6:50 PM on Sunday, December 20 and arrives at Kansai International Airport at 10:20 PM on Sunday, December 20. Total duration 2 hr 30 min.   Select flight';
const JETSTAR = 'From 11440 New Taiwan dollars round trip total.This price does not include overhead bin access. Nonstop flight with Jetstar. Leaves Taiwan Taoyuan International Airport at 6:15 PM on Sunday, December 20 and arrives at Kansai International Airport at 9:45 PM on Sunday, December 20. Total duration 2 hr 30 min.   Select flight';
const OVERNIGHT = 'From 21804 New Taiwan dollars round trip total. 1 stop flight with ANA. Operated by Air Japan. Leaves Taipei Songshan Airport at 4:50 PM on Sunday, December 20 and arrives at Osaka International Airport at 7:30 AM on Monday, December 21. Total duration 13 hr 40 min.   Select flight';
const EVA = 'From 17927 New Taiwan dollars round trip total. Nonstop flight with EVA Air. Leaves Taiwan Taoyuan International Airport at 6:30 AM on Sunday, December 20 and arrives at Kansai International Airport at 9:55 AM on Sunday, December 20. Total duration 2 hr 25 min.   Select flight';

describe('Google Flights results', () => {
  it('reads price, airline, stops and times from a result label', () => {
    expect(parseFlightLabel(PEACH)).toEqual({ price: 11137, airline: 'Peach Aviation', stops: 0, departs: '18:50', arrives: '22:20', duration: '2 hr 30 min', lowCost: true });
    expect(parseFlightLabel(EVA)).toMatchObject({ airline: 'EVA Air', departs: '06:30', arrives: '09:55', lowCost: false });
  });

  it('marks next-day arrivals, stops and low-cost fares without cabin bags', () => {
    expect(parseFlightLabel(OVERNIGHT)).toMatchObject({ airline: 'ANA', stops: 1, departs: '16:50', arrives: '07:30 +1', lowCost: false });
    expect(parseFlightLabel(JETSTAR)?.lowCost).toBe(true);
    expect(parseFlightLabel('Leaves Taiwan Taoyuan International Airport at 6:50 PM on Sunday, December 20.')).toBeNull();
  });

  it('lists each option once, cheapest first', () => {
    expect(parseFlightLabels([EVA, PEACH, PEACH, 'Flight details. Leaves …', JETSTAR]).map(option => option.airline))
      .toEqual(['Peach Aviation', 'Jetstar', 'EVA Air']);
  });
});

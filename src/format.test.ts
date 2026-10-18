// Tests for what the trip bot sends to the user's phone (npm test).
// Each case is a mistake that reached the user once, or a rule the user set.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { airlineName, flightLines, listPhoto, pickFlights, recommendedSite, roomType } from './format';
import { callbackData, chunks } from './telegram';
import type { FlightOption } from './deals/flight-list';

test('room types match whole words ("Non-Smoking" contains "king")', () => {
  assert.equal(roomType('Single Room - Non-Smoking'), '單人房');
  assert.equal(roomType('Double Room - Non-Smoking'), '雙人房');
  assert.equal(roomType('Deluxe Twin Room - Non-Smoking'), '雙床房');
  assert.equal(roomType('Family Room'), '家庭房（3–4人）');
  assert.equal(roomType('Standard Room (for 2 Adults) - Non-Smoking'), '私人房');
  assert.equal(roomType('Double Room with Shared Bathroom'), '雙人房（共用衛浴）');
});

test('a familiar site is recommended unless a lesser-known one saves more than NT$200 a night', () => {
  const sites = (entries: [string, number][]) => entries.map(([site, nightly]) => ({ site, nightly }));
  assert.equal(recommendedSite(sites([['Priceline', 3000], ['Agoda', 3150]]))?.site, 'Agoda');
  assert.equal(recommendedSite(sites([['Priceline', 3000], ['Agoda', 3300]]))?.site, 'Priceline');
  assert.equal(recommendedSite(sites([['Traveloka', 2000], ['Booking.com', 2100]]))?.site, 'Booking.com'); // blocks visitors
  assert.equal(recommendedSite([]), null);
});

test('an oddly cheap site (dorm beds) is not taken for a room price', () => {
  // Rhodes Kagurazaka Hotel, 2026-10-18: Booking's NT$2,176 was two dorm beds.
  const sites = [['Booking.com', 2176], ['Trip.com', 3867], ['Agoda', 4047], ['Priceline', 4056], ['Hotels.com', 4331]]
    .map(([site, nightly]) => ({ site: site as string, nightly: nightly as number }));
  assert.equal(recommendedSite(sites)?.site, 'Trip.com');
  assert.equal(recommendedSite(sites.slice(0, 2))?.site, 'Booking.com'); // too few sites to tell
});

test('the list shows one room photo (the listed type) and one bathroom photo', () => {
  const photos = { rooms: [{ name: 'Twin Room', url: 'twin' }, { name: 'Double Room', url: 'double' }], bedroom: ['bed'], bathroom: ['bath1', 'bath2'] };
  assert.deepEqual(listPhoto(photos, '雙人房'), ['double', 'bath1']);
  assert.deepEqual(listPhoto({ rooms: [], bedroom: ['bed'], bathroom: [] }, '雙人房'), ['bed']);
});

const flight = (airline: string, price: number, extra: Partial<FlightOption> = {}): FlightOption =>
  ({ price, airline, stops: 0, departs: '08:00', arrives: '11:30', duration: '2 hr 30 min', lowCost: false, ...extra });

test('flight lists keep the cheapest nonstop full-service flight next to low-cost fares', () => {
  const flights = [flight('Peach Aviation', 11137, { lowCost: true }), flight('Jetstar', 11440, { lowCost: true }),
    flight('Trinity Airways', 14476, { stops: 1 }), flight('Cathay Pacific', 14526)];
  assert.deepEqual(pickFlights(flights, 3).map(option => option.airline), ['Peach Aviation', 'Jetstar', 'Cathay Pacific']);
  assert.deepEqual(pickFlights(flights, 5).map(option => option.airline), flights.map(option => option.airline));
});

test('airlines read in Chinese, codeshares by their operating airline', () => {
  assert.equal(airlineName('Peach Aviation'), '樂桃');
  assert.equal(airlineName('EVA AirANA'), '長榮');
  assert.equal(airlineName('China Airlines, JAL'), '華航');
  assert.equal(airlineName('Trinity Airways'), 'Trinity Airways');
});

test('each flight is two short lines that fit a phone', () => {
  const [lines] = flightLines([flight('Peach Aviation', 11137, { lowCost: true, departs: '18:50', arrives: '22:20' })], 'TWD');
  assert.equal(lines, '1. 樂桃 NT$11,137・廉航（行李另付）\n18:50→22:20・直飛・2h30');
  for (const line of lines!.split('\n')) assert.ok(line.length <= 26, `too long for a phone: ${line}`);
});

test('Telegram messages split between hotels and stay under the link limit', () => {
  const link = `https://www.google.com/travel/lodging/clk?pc=${'x'.repeat(1400)}`;
  const hotel = (n: number) => `${n}. [Hotel ${n}](${link})\n⭐4.1\n每晚含稅 NT$3,000・[Agoda](${link}) 訂`;
  const parts = chunks(['🏨 東京 住宿', ...[1, 2, 3, 4, 5, 6].map(hotel), '說明'].join('\n'));
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(/^(🏨|\d+\. )/.test(part), `a message starts mid-hotel: ${part.slice(0, 30)}`);
});

test('button data fits Telegram\'s 64 bytes', () => {
  assert.equal(callbackData('B4 東京'), 'ff:B4 東京');
  assert.ok(Buffer.byteLength(callbackData('B4 一個非常非常非常非常非常非常非常長的城市名稱')) <= 64);
});

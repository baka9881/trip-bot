// A hotel's Booking rooms are kept a month, a miss two days (the user asked for photos ready ahead, 2026-10-20).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { freshProfile, profileKey, type HotelProfile } from './hotel-profiles';

const day = 86_400_000;
const now = Date.parse('2026-10-20T00:00:00Z');
const profile = (name: string, found: boolean, daysAgo: number): HotelProfile =>
  ({ name, hotelUrl: found ? 'https://www.booking.com/hotel/jp/x.html' : null, rooms: found ? [{ name: 'Double Room' } as never] : [], fetchedAt: new Date(now - daysAgo * day).toISOString() });

test('one hotel however Google spells it', () => {
  assert.equal(profileKey('Mr . KINJO in Asahibashi'), profileKey('Mr.KINJO in Asahibashi'));
});

test('a profile is used for a month, a miss is retried after two days', () => {
  const profiles = { [profileKey('A')]: profile('A', true, 20), [profileKey('B')]: profile('B', true, 31), [profileKey('C')]: profile('C', false, 1), [profileKey('D')]: profile('D', false, 3) };
  assert.ok(freshProfile('A', now, profiles));
  assert.equal(freshProfile('B', now, profiles), null);
  assert.ok(freshProfile('C', now, profiles));
  assert.equal(freshProfile('D', now, profiles), null);
});

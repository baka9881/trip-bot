// What Booking.com shows of each hotel, kept for a month: its room types, beds, bathrooms and photos
// do not change from one stay to the next. The user asked for every hotel's photos to be ready before
// a list is shown rather than looked up then (2026-10-20), so the background jobs fill this in a few
// hotels at a time and the lists read it.
import { readFileSync, writeFileSync } from 'node:fs';
import type { BookingRoom } from './deals/booking-rooms';

export interface HotelProfile {
  name: string;
  /** Booking's page for the hotel, or null when Booking was searched and had nothing. */
  hotelUrl: string | null;
  rooms: BookingRoom[];
  fetchedAt: string;
}

const PROFILES_FILE = new URL('../data/hotel-profiles.json', import.meta.url);
export const PROFILE_DAYS = 30;
// A hotel Booking did not show (or a visit Booking challenged) is tried again after this long.
export const RETRY_MISSING_DAYS = 2;

/** One hotel however Google spells it ("Mr . KINJO" / "Mr.KINJO"). */
export const profileKey = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

export function readProfiles(): Record<string, HotelProfile> {
  try { return JSON.parse(readFileSync(PROFILES_FILE, 'utf8')) as Record<string, HotelProfile>; } catch { return {}; }
}

/** A hotel's profile while it is fresh: a month when Booking showed it, two days when it did not. */
export function freshProfile(name: string, now = Date.now(), profiles = readProfiles()): HotelProfile | null {
  const profile = profiles[profileKey(name)];
  if (!profile) return null;
  const days = profile.hotelUrl && profile.rooms.length ? PROFILE_DAYS : RETRY_MISSING_DAYS;
  return now - Date.parse(profile.fetchedAt) < days * 86_400_000 ? profile : null;
}

export function saveProfile(profile: HotelProfile): void {
  const profiles = readProfiles();
  profiles[profileKey(profile.name)] = profile;
  writeFileSync(PROFILES_FILE, `${JSON.stringify(profiles)}\n`);
}

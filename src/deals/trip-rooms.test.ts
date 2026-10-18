import { describe, it, expect } from 'vitest';
import { parseTripCard, tripHotelIdFromGoogle, tripPhotoUrl, tripRoomName, withoutSharedPhotos } from './trip-rooms';

// APA Hotel Asakusa Tawaramachi Ekimae on Trip.com, Oct 29 – Nov 2 2026.
describe('Trip.com rooms', () => {
  it('finds the Trip.com hotel id behind a Google price link', () => {
    const target = 'https://tw.trip.com/hotels/redirect?hotelid=21161347&city=228&adult=2&checkin=2026-10-29';
    expect(tripHotelIdFromGoogle(`https://www.google.com/travel/lodging/clk?pc=AA80&pcurl=${encodeURIComponent(target)}`)).toBe('21161347');
    expect(tripHotelIdFromGoogle('https://www.google.com/travel/lodging/clk?pcurl=https%3A%2F%2Fwww.booking.com%2Fsearchresults.html')).toBeNull();
  });

  it('asks the CDN for a large JPEG', () => {
    expect(tripPhotoUrl('https://ak-d.tripcdn.com/images/0583w12000sqhnvyuDE61_R_696_392_R5.webp'))
      .toBe('https://ak-d.tripcdn.com/images/0583w12000sqhnvyuDE61_W_1080_808_R5_Q70.jpg');
    expect(tripPhotoUrl('https://example.com/a.webp')).toBeNull();
  });

  // OKINI HOTEL namba (2026-10-18): one card rendered without line breaks.
  it('cuts a run-on card line at the room name', () => {
    expect(tripRoomName('Deluxe 2-Bed Room102 small double bedsHas window(s)Non-smoking161–193 ft²')).toBe('Deluxe 2-Bed Room');
    expect(tripRoomName('Non-smoking Double Room')).toBe('Non-smoking Double Room');
    expect(tripRoomName('3')).toBeNull();
    expect(parseTripCard('Deluxe 2-Bed Room | 2 small double beds | Private bathroom').beds).toEqual(['2 small double beds']);
  });

  it('drops the cover photo every room card leads with', () => {
    const rooms = [{ name: 'Double', photos: ['cover', 'double-1', 'double-2'] }, { name: 'Single', photos: ['cover', 'single-1'] }];
    expect(withoutSharedPhotos(rooms).map(room => room.photos)).toEqual([['double-1', 'double-2'], ['single-1']]);
    expect(withoutSharedPhotos([{ name: 'A', photos: ['cover'] }, { name: 'B', photos: ['cover'] }]).map(room => room.photos)).toEqual([['cover'], ['cover']]);
  });

  it('reads beds, size, bathroom and the stay total from a room card', () => {
    const card = 'Non-smoking Double Room | 3 | 1 double bed | Non-smoking | 118 ft² | Free Wi-Fi | Bathtub | Air conditioning | Private bathroom | Room Details | '
      + "Today's Price | Special Discount | 10% off | TWD 5,188 | TWD 4,620 | Total price: TWD 20,446 | 1 room × 4 nights incl. taxes & fees | Reserve";
    expect(parseTripCard(card)).toEqual({ sizeM2: 11, beds: ['1 double bed'], bathroom: 'private', stayTotal: 20446 });
  });
});

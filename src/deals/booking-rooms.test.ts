import { describe, it, expect } from 'vitest';
import { bookingUrlFromGoogle, parseRoomFacts, parseRoomPhotoSets, parseRoomPhotos, parseRoomRow, photoKind } from './booking-rooms';

describe('Booking.com rooms', () => {
  it('finds the Booking page behind a Google price link', () => {
    const target = 'https://www.booking.com/searchresults.en.html?dest_id=2295449&dest_type=hotel&checkin=2026-10-29';
    expect(bookingUrlFromGoogle(`https://www.google.com/travel/lodging/clk?pc=AA80&pcurl=${encodeURIComponent(target)}&ap=1`)).toBe(target);
    expect(bookingUrlFromGoogle('https://www.google.com/travel/lodging/clk?pcurl=https%3A%2F%2Fwww.priceline.com%2Fr%2F')).toBeNull();
    expect(bookingUrlFromGoogle('not a url')).toBeNull();
  });

  // A row of APA Hotel Asakusa Tawaramachi Ekimae's room table on 2026-10-17.
  it('reads guests, the stay total and free cancellation from a room row', () => {
    expect(parseRoomRow('Double Room - Non-Smoking 1 double bed Guests: 2 adults TWD 18,765 Includes taxes and charges Free cancellation before 28 October 2026 • Pay nothing until 26 October'))
      .toEqual({ guests: 2, stayTotal: 18765, freeCancelUntil: '10/28' });
    expect(parseRoomRow('Single Room Guests: 1 adult TWD 17,105')).toEqual({ guests: 1, stayTotal: 17105, freeCancelUntil: null });
    // Another layout (APA Hotel Asakusa Kuramae Kita) states capacity as "Max persons".
    expect(parseRoomRow('Max persons: 2 TWD 18,257 Free cancellation before 28 October 2026').guests).toBe(2);
  });

  // The photo list and photo descriptions embedded in the hotel page, as on APA Hotel Asakusa
  // Tawaramachi Ekimae (2026-10-18): of 14 photos tagged to the double room, one shows the room.
  it('keeps the photos that show the room and its bathroom, room views first', () => {
    const photo = (id: number, rooms: string) => `{ id: '${id}', large_url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/${id}.webp?k=${id}&o=' ,associated_rooms: [ ${rooms} ] }`;
    const alt = (id: number, text: string) => `"AccommodationPhoto:${id}":{"__typename":"AccommodationPhoto","id":${id},"altText":"${text} at APA Hotel","photoType":"ROOM","resource":{"size":"x"}}`;
    const html = [
      photo(1, "'229544903'"), photo(2, "'229544903'"), photo(3, "'229544903', '229544901'"), photo(4, "'229544903'"), photo(5, ''),
      alt(1, 'a person holding a cell phone in their hand'), alt(2, 'a white bathroom with a sink and a shower'),
      alt(3, 'a hotel room with a bed and a window'), alt(4, 'a group of three shampoo bottles'), alt(5, 'a hotel room with a bed'),
    ].join(',');
    const photos = parseRoomPhotos(html);
    expect(photos.get('229544903')).toEqual([
      'https://cf.bstatic.com/xdata/images/hotel/max1024x768/3.jpg?k=3&o=',
      'https://cf.bstatic.com/xdata/images/hotel/max1024x768/2.jpg?k=2&o=',
    ]);
    expect(photos.get('229544901')).toEqual(['https://cf.bstatic.com/xdata/images/hotel/max1024x768/3.jpg?k=3&o=']);
    expect(photos.has('')).toBe(false);
  });

  // DOYANEN HOTELS BAKURO (2026-10-18): "Twin Room with Shared Bathroom" lists 2 single beds while
  // every photo of it shows one bed up a ladder.
  it('notices photos of a bunk or loft bed', () => {
    const html = `{ id: '1', large_url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/1.webp?k=a&o=' ,associated_rooms: [ '606895011' ] },
      "AccommodationPhoto:1":{"__typename":"AccommodationPhoto","id":1,"altText":"a small room with a bunk bed and a ladder at BAKURO","x":{}},
      { id: '2', large_url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/2.webp?k=b&o=' ,associated_rooms: [ '229544903' ] },
      "AccommodationPhoto:2":{"__typename":"AccommodationPhoto","id":2,"altText":"a hotel room with a bed and a window","x":{}}`;
    const sets = parseRoomPhotoSets(html);
    expect(sets.get('606895011')?.bunk).toBe(true);
    expect(sets.get('229544903')?.bunk).toBe(false);
  });

  it('tells room and bathroom photos from amenity close-ups', () => {
    expect(photoKind('a hotel room with two beds and a desk')).toBe('room');
    expect(photoKind('a white bathroom with a sink and a shower')).toBe('bathroom');
    expect(photoKind('a person holding a cell phone in front of a tv')).toBeNull();
    expect(photoKind('a public bath with several sinks and stools')).toBeNull();
    expect(photoKind('two toy rubber ducks with faces on a white background')).toBeNull();
    expect(photoKind('a white box filled with black and white toothbrushes')).toBeNull();
  });

  it('reads size, beds and bathroom from the room dialog', () => {
    const dialog = 'Double Room - Non-Smoking\nAir conditioning\nPrivate bathroom\nFlat-screen TV\nRoom size 11 m²\n1 double bed\nComfy beds, 8.3\nIn the bathroom:\nShared toilet\nBath';
    expect(parseRoomFacts(dialog)).toEqual({ sizeM2: 11, beds: ['1 double bed'], bathroom: 'private' });
    expect(parseRoomFacts('Shared bathroom\n2 single beds')).toEqual({ sizeM2: null, beds: ['2 single beds'], bathroom: 'shared' });
  });
});

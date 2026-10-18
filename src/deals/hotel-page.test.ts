import { describe, it, expect } from 'vitest';
import { isDormBed, isNonSmokingRoom, isSmokingRoom, buildHotelNameUrl, buildHotelSearchUrl, classifyRooms, dateInputLabel, isPrivateHotel, nearbyAreas, parseBelowUsual, parseHotelList, parseLabelRatings, parseRoomOffers, parseSiteOffers, attachSiteLinks, largePhotoUrl, roomPhotos, summarizeHotels, bestSiteRating } from './hotel-page';

// Excerpt captured from a live Google Hotels search (Okinawa, Nov 1-7 2026, hl=en, curr=TWD).
const LIVE = `Skip to main content
All filters
4+ rating
Under $1,500
Free parking
Okinawa · 130 results
Okinawa Grand Mer Resort
NT$2,756
4.1
(3.0K)
4-star hotel
View prices
Hotel Pacific View
NT$1,363
3.5
(83)
Amenities for Hotel Pacific View, a 5-star hotel.: Sauna, Free Wi-Fi, Free parking, Restaurant,
5-star hotel
View prices
Music Hotel KOZA by Coldio Premium
GREAT DEAL
NT$881
3.7
(146)
Amenities for Music Hotel KOZA by Coldio Premium: Free Wi-Fi, Restaurant,
Free Wi-Fi
View prices
GREAT DEAL
Rycom Crystal Hotel
NT$1,319
3.9
(368)
Amenities for Rycom Crystal Hotel, a 3-star hotel.: Free Wi-Fi, Free parking, Restaurant,
3-star hotel
View prices
KAI沖縄北インター
NT$1,155
View prices
Hotel Palm Tree Hill
NT$1,089
3.3
(31)
Amenities for Hotel Palm Tree Hill, a 2-star hotel.: Free Wi-Fi, Free parking,
2-star hotel
View prices`;

// Tokyo cards captured 2026-10-15: bed-only stays carry no class or say so in their name.
const TOKYO = `OGIKUBO TOMBO HOTEL
NT$1,739
3.9
(37)
View prices
GREAT DEAL
Hotel + Hostel Tokyo Asakusa 2
NT$1,881
3.5
(1.2K)
Amenities for Hotel + Hostel Tokyo Asakusa 2, a 2-star hotel.: Public bath, Free Wi-Fi,
View prices
TOKYO-W-inn Asakusa
NT$2,058
4.4
(512)
Amenities for TOKYO-W-inn Asakusa, a 2-star hotel.: Free Wi-Fi, Parking,
View prices
Tora Hotel Asakusa
NT$1,827
4.3
(904)
Amenities for Tora Hotel Asakusa, a 1-star hotel.: Free Wi-Fi, Bar,
View prices`;

describe('parseHotelList', () => {
  it('reads hotel cards, ratings, hotel class and Google deal badges from live text', () => {
    const hotels = parseHotelList(LIVE);
    expect(hotels.map(hotel => hotel.name)).toEqual([
      'Okinawa Grand Mer Resort', 'Hotel Pacific View', 'Music Hotel KOZA by Coldio Premium', 'Rycom Crystal Hotel', 'KAI沖縄北インター', 'Hotel Palm Tree Hill',
    ]);
    expect(hotels[2]).toEqual({ name: 'Music Hotel KOZA by Coldio Premium', nightly: 881, rating: 3.7, badge: 'GREAT DEAL', stars: null });
    expect(hotels.map(hotel => hotel.stars)).toEqual([4, 5, null, 3, null, 2]);
    expect(hotels[4]).toMatchObject({ nightly: 1155, rating: null, badge: null });
  });

  it('does not read filter chips as hotels', () => {
    expect(parseHotelList('Price\nUnder $1,500\nFree parking')).toEqual([]);
  });

  // Rex Inn Kawasaki's card (2026-10-16): a large public bath besides the rooms' own bathrooms.
  it('notes a large public bath from the amenities line', () => {
    const text = 'Rex Inn Kawasaki\nNT$1,633\n3.6\n(750)\nAmenities for Rex Inn Kawasaki, a 2-star hotel.: Public bath, Outdoor bath, Sauna, Free Wi-Fi,\n2-star hotel\nView prices\n'
      + 'Hotel + Hostel Tokyo Kawasaki\nNT$1,787\n3.6\n(263)\nAmenities for Hotel + Hostel Tokyo Kawasaki: Free Wi-Fi, Restaurant,\nView prices';
    const hotels = parseHotelList(text);
    expect(hotels[0]).toMatchObject({ name: 'Rex Inn Kawasaki', stars: 2, publicBath: true });
    expect(hotels[1]?.publicBath).toBeUndefined();
  });
});

describe('isPrivateHotel', () => {
  it('keeps classed hotels and drops bed-only stays', () => {
    const verdicts = Object.fromEntries(parseHotelList(TOKYO).map(hotel => [hotel.name, isPrivateHotel(hotel)]));
    expect(verdicts).toEqual({
      'OGIKUBO TOMBO HOTEL': false, // no hotel class: sells beds
      'Hotel + Hostel Tokyo Asakusa 2': false, // hostel in the name despite its class
      'TOKYO-W-inn Asakusa': true,
      'Tora Hotel Asakusa': false, // below two stars
    });
    expect(isPrivateHotel({ name: 'ゲストハウス赤道直家', stars: 3 })).toBe(false);
    expect(isPrivateHotel({ name: 'Capsule Inn Kyoto', stars: 2 })).toBe(false);
  });
});

// Prices panels captured 2026-10-15 (Tokyo, Oct 29 - Nov 4).
const DORM_PANEL = `Back to list of all results
Overview
Prices
Nightly total
Free cancellation only
Sponsored·Featured options
Booking.com
NT$2,158
Visit site
Get Instant Confirmation · Read Real Guest Reviews
Bunk Bed in Female Dormitory Room
Balcony
NT$2,158
Visit site
Bunk Bed in Female Dormitory Room
3 guests · Balcony
NT$3,237
Visit site
Bunk Bed in Mixed Dormitory Room
Balcony
NT$2,158
Visit site
Visit site for more options
All options
Booking.com
NT$2,158
Visit site`;

const HOTEL_PANEL = `Back to list of all results
Prices
Sponsored·Featured options
Hotels.com
NT$3,590
Visit site
Save with Member Prices · Save with Member Prices
Standard Room, Non Smoking (2persons)
Free cancellation until Oct 28
NT$3,590
Visit site
Standard Room, Non Smoking (2persons)
Free cancellation until Oct 28 · breakfast
NT$4,103
Visit site
Cozy Room for 2 Adults - Non-Smoking
Free cancellation until Oct 28
NT$3,816
Visit site
Visit site for more options
Priceline
Free cancellation until Oct 27 · Free Wi-Fi
NT$2,930
Visit site
All options
Priceline
NT$2,930`;

// The "All options" list of slash 川崎 on 2026-10-16, as Google renders it.
const SITES_PANEL = `Sponsored·Featured options
Trip.com
NT$3,381
Visit site
All options
slash kawasaki
 Official Site
Member rate, save 5%
,
NT$5,029
NT$4,778
Visit site
goseek.com
NT$3,309
Visit site
Trip.com
Free cancellation until Oct 27
,
NT$3,381
Visit site
Booking.com
Free cancellation until Oct 27
,
NT$3,907
Visit site
View more options from NT$3,381
Track this hotel`;

describe('hotel photos', () => {
  it('asks Google for a large version of a thumbnail', () => {
    expect(largePhotoUrl('https://lh3.googleusercontent.com/gps-cs-s/ANWiy9R_x-Q=w253-h189-k-no'))
      .toBe('https://lh3.googleusercontent.com/gps-cs-s/ANWiy9R_x-Q=w1024-k-no');
    expect(largePhotoUrl('https://lh4.googleusercontent.com/proxy/hMjM=s287-w287-h192-n-k-no-v1'))
      .toBe('https://lh4.googleusercontent.com/proxy/hMjM=w1024-k-no');
    expect(largePhotoUrl('data:image/gif;base64,R0lGOD')).toBeNull();
    expect(largePhotoUrl('https://lh3.googleusercontent.com/hrppk/ANjXD_xlj9C9')).toBe('https://lh3.googleusercontent.com/hrppk/ANjXD_xlj9C9=w1024-k-no');
  });

  it('keeps one photo per private room row', () => {
    expect(roomPhotos([
      { name: 'Double Room, Non Smoking (Room Only)', url: 'https://lh3.googleusercontent.com/hrppk/A' },
      { name: 'Double Room, Non Smoking (Room Only)', url: 'https://lh3.googleusercontent.com/hrppk/A' },
      { name: 'Twin Room, Non Smoking', url: 'https://lh3.googleusercontent.com/hrppk/B' },
      { name: 'Bunk Bed in Mixed Dormitory Room', url: 'https://lh3.googleusercontent.com/hrppk/C' },
      { name: 'Agoda', url: 'https://lh3.googleusercontent.com/hrppk/D' },
    ])).toEqual([
      { name: 'Double Room, Non Smoking (Room Only)', url: 'https://lh3.googleusercontent.com/hrppk/A=w1024-k-no' },
      { name: 'Twin Room, Non Smoking', url: 'https://lh3.googleusercontent.com/hrppk/B=w1024-k-no' },
    ]);
  });
});

describe('booking sites', () => {
  it('lists each site once at the price you pay, cheapest first', () => {
    expect(parseSiteOffers(SITES_PANEL)).toEqual([
      { site: 'goseek.com', nightly: 3309 },
      { site: 'Trip.com', nightly: 3381, freeCancelUntil: '10/27' },
      { site: 'Booking.com', nightly: 3907, freeCancelUntil: '10/27' },
      { site: '官網', nightly: 4778 },
    ]);
    expect(parseSiteOffers('All options\nAgoda\nFree cancellation until Nov 3 · breakfast\nNT$4,100\nVisit site'))
      .toEqual([{ site: 'Agoda', nightly: 4100, freeCancelUntil: '11/3', breakfast: true }]);
    expect(parseSiteOffers('Featured options\nTrip.com\nNT$3,381\nVisit site')).toEqual([]);
  });

  it('links each site to its booking page and ignores sponsored ads', () => {
    const offers = parseSiteOffers(SITES_PANEL);
    const linked = attachSiteLinks(offers, [
      { text: 'Booking.com\nFree cancellation until Oct 27\nNT$3,907\nVisit site', url: 'https://www.google.com/aclk?sa=l&ad=1' },
      { text: 'goseek.com\nNT$3,309\nVisit site', url: 'https://www.google.com/travel/lodging/clk?pc=goseek' },
      { text: 'slash kawasaki\n Official Site\n,\nNT$5,029\nNT$4,778\nVisit site', url: 'https://www.google.com/travel/lodging/clk?pc=official' },
    ]);
    expect(linked.find(offer => offer.site === 'goseek.com')?.url).toBe('https://www.google.com/travel/lodging/clk?pc=goseek');
    expect(linked.find(offer => offer.site === '官網')?.url).toBe('https://www.google.com/travel/lodging/clk?pc=official');
    expect(linked.find(offer => offer.site === 'Booking.com')?.url).toBeUndefined();
  });
});

describe('room checks', () => {
  it('reads the named rooms and their nightly prices from a prices panel', () => {
    expect(parseRoomOffers(DORM_PANEL)).toEqual([
      { name: 'Bunk Bed in Female Dormitory Room', nightly: 2158 },
      { name: 'Bunk Bed in Female Dormitory Room', nightly: 3237 },
      { name: 'Bunk Bed in Mixed Dormitory Room', nightly: 2158 },
    ]);
    expect(parseRoomOffers(HOTEL_PANEL)).toEqual([
      { name: 'Standard Room, Non Smoking (2persons)', nightly: 3590 },
      { name: 'Standard Room, Non Smoking (2persons)', nightly: 4103 },
      { name: 'Cozy Room for 2 Adults - Non-Smoking', nightly: 3816 },
    ]);
  });

  it('flags hotels that only sell dorm beds and confirms the cheapest private room', () => {
    expect(classifyRooms(parseRoomOffers(DORM_PANEL))).toEqual({ status: 'shared' });
    expect(classifyRooms(parseRoomOffers(HOTEL_PANEL))).toEqual({ status: 'private', room: { name: 'Standard Room, Non Smoking (2persons)', nightly: 3590 },
      options: [
        { name: 'Standard Room, Non Smoking (2persons)', nightly: 3590 },
        { name: 'Cozy Room for 2 Adults - Non-Smoking', nightly: 3816 },
        { name: 'Standard Room, Non Smoking (2persons)', nightly: 4103 },
      ], alsoShared: false });
    expect(classifyRooms([{ name: 'Capsule (Male)', nightly: 900 }, { name: 'Double Room', nightly: 3000 }])).toEqual({ status: 'private', room: { name: 'Double Room', nightly: 3000 },
      options: [{ name: 'Double Room', nightly: 3000 }], alsoShared: true });
  });

  it('cannot confirm a hotel whose panel names no rooms', () => {
    expect(classifyRooms(parseRoomOffers('Prices\nAll options\nBooking.com\nNT$2,000\nVisit site'))).toEqual({ status: 'unknown' });
  });
});

describe('summarizeHotels', () => {
  it('summarizes private hotels only: cheapest overall and among well-rated', () => {
    const summary = summarizeHotels(parseHotelList(LIVE), '2026-11-01', '2026-11-07');
    expect(summary).toMatchObject({
      nights: 6, hotels: 4, deals: 0,
      cheapest: { name: 'Hotel Palm Tree Hill', nightly: 1089 },
      cheapestGood: { name: 'Rycom Crystal Hotel', nightly: 1319 },
    });
  });

  it('returns null when every stay is a shared room', () => {
    expect(summarizeHotels(parseHotelList('OGIKUBO TOMBO HOTEL\nNT$1,739\n3.9\n(37)\nView prices'), '2026-11-01', '2026-11-07')).toBeNull();
  });

  it('returns null without hotels or with impossible dates', () => {
    expect(summarizeHotels([], '2026-11-01', '2026-11-07')).toBeNull();
    expect(summarizeHotels(parseHotelList(LIVE), '2026-11-07', '2026-11-01')).toBeNull();
  });
});

describe('hotel search URLs', () => {
  it('builds a dated Google Hotels search and rejects odd input', () => {
    const url = new URL(buildHotelSearchUrl({ city: 'Okinawa', checkIn: '2026-11-01', checkOut: '2026-11-07', currency: 'TWD', country: 'TW' }));
    expect(url.searchParams.get('q')).toBe('cheap 3 star hotels in Okinawa from 2026-11-01 to 2026-11-07');
    expect(() => buildHotelSearchUrl({ city: 'Okinawa&x=1', checkIn: '2026-11-01', checkOut: '2026-11-07', currency: 'TWD', country: 'TW' })).toThrow();
  });

  it('keeps the stay dates when linking one hotel, by leading with "hotels in <city> from … to …"', () => {
    const one = new URL(buildHotelNameUrl({ name: 'Rycom Crystal Hotel', city: 'Okinawa', checkIn: '2026-10-29', checkOut: '2026-11-05', currency: 'TWD', country: 'TW' }));
    expect(one.searchParams.get('q')).toBe('hotels in Okinawa from 2026-10-29 to 2026-11-05 Rycom Crystal Hotel');
    expect(one.searchParams.get('hl')).toBe('zh-TW');
    expect(one.searchParams.get('gl')).toBe('TW');
    const all = new URL(buildHotelNameUrl({ city: 'Okinawa', checkIn: '2026-10-29', checkOut: '2026-11-05', currency: 'TWD' }));
    expect(all.searchParams.get('q')).toBe('cheap 3 star hotels in Okinawa from 2026-10-29 to 2026-11-05');
    expect(() => buildHotelNameUrl({ city: 'Okinawa', checkIn: 'tomorrow', checkOut: '2026-11-05', currency: 'TWD' })).toThrow();
  });

  it('matches how the page labels its date inputs', () => {
    expect(dateInputLabel('2026-11-01')).toBe('Nov 1');
    expect(dateInputLabel('2027-01-16')).toBe('Jan 16');
  });
});

describe('nearbyAreas', () => {
  it('suggests cheaper places a short ride from big cities and nothing elsewhere', () => {
    expect(nearbyAreas('Tokyo').map(area => area.area)).toEqual(['Saitama', 'Kawasaki', 'Chiba']);
    expect(nearbyAreas('Tokyo')[0]).toMatchObject({ label: '埼玉（大宮、浦和）', ride: expect.stringContaining('分鐘') });
    expect(nearbyAreas('Ishigaki')).toEqual([]);
  });
});

describe('parseBelowUsual', () => {
  it('reads Google’s "less than usual" comparison from list link labels', () => {
    // Labels captured from the Tokyo list on 2026-10-15.
    const found = parseBelowUsual([
      'Prices starting from NT$2,796, APA Hotel TKP Tokyo Nishikasai DEAL 22% less than usual',
      'Prices starting from NT$3,020, APA Hotel Nihonbashi Bakurocho-eki Kita DEAL 24% less than usual',
      'Prices starting from NT$3,494, Some Hotel GREAT PRICE for a 3-star hotel',
      'Photos for APA Hotel TKP Tokyo Nishikasai',
    ]);
    expect([...found]).toEqual([['APA Hotel TKP Tokyo Nishikasai', 22], ['APA Hotel Nihonbashi Bakurocho-eki Kita', 24]]);
  });
});

describe('second list layout', () => {
  // Layout seen on 2026-10-15: no rating line under the price; the rating is only in a label.
  const ALT = `Tokyo · 211 results
HOTEL GRAPHY NEZU
NT$2,719
Amenities for HOTEL GRAPHY NEZU, a 3-star hotel.: Free Wi-Fi, Parking, Bar, Restaurant, Kid-friendly,
3-star hotel
Free Wi-Fi
View prices`;

  it('reads cards whose price is followed by amenities, and ratings from labels', () => {
    expect(parseHotelList(ALT)).toEqual([{ name: 'HOTEL GRAPHY NEZU', nightly: 2719, rating: null, badge: null, stars: 3 }]);
    expect([...parseLabelRatings(['4.3 out of 5 stars from 1.2K reviews, HOTEL GRAPHY NEZU', 'Photos for X'])]).toEqual([['HOTEL GRAPHY NEZU', 4.3]]);
  });
});

describe('bestSiteRating', () => {
  it('takes the travel site with the most reviews from a hotel Reviews tab', () => {
    // Captured 2026-10-15, APA Hotel Ayase-Ekimae (Google showed no score of its own).
    const text = 'Reviews on other travel sites\nTrip.com\n4.7/5 · 15 reviews\nTripadvisor\n4.5/5 · 11 reviews\nReviews\nWrite a review';
    expect(bestSiteRating(text)).toEqual({ site: 'Trip.com', score: 4.7, reviews: 15 });
    expect(bestSiteRating('Trip.com\n4.1/5 · 96 reviews\nAgoda\n4.0/5 · 1,204 reviews')).toEqual({ site: 'Agoda', score: 4, reviews: 1204 });
    expect(bestSiteRating('Reviews\nWrite a review')).toBeNull();
  });
});

describe('dorm beds', () => {
  it('tells a dorm bed from a private room with a bunk bed', () => {
    expect(isDormBed('Bunk Bed in Mixed Dormitory Room')).toBe(true);
    expect(isDormBed('Superior Twin Room')).toBe(false);
    expect(isDormBed('Twin Room with Shared Bathroom')).toBe(false);
  });

  // The user dislikes the smell of smoke (2026-10-19); "Non-Smoking" contains "Smoking".
  it('tells smoking rooms from non-smoking and unlabelled ones', () => {
    expect(isSmokingRoom('Double Room - Smoking')).toBe(true);
    expect(isSmokingRoom('喫煙 ダブルルーム')).toBe(true);
    expect(isSmokingRoom('Double Room - Non-Smoking')).toBe(false);
    expect(isSmokingRoom('Non smoking Twin Room')).toBe(false);
    expect(isSmokingRoom('Standard Double Room')).toBe(false);
    expect(isNonSmokingRoom('Double Room - Non-Smoking')).toBe(true);
    expect(isNonSmokingRoom('Standard Double Room')).toBe(false);
  });
});

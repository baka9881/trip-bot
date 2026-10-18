import { describe, it, expect } from 'vitest';
import { buildCardSearchUrl, buildExploreUrl, pageTripLength, parseExploreDates, parseExplorePage } from './explore-page';

// Excerpt captured from a live Google Flights Explore page (Taipei to Japan, hl=en, curr=TWD) on 2026-10-15.
const LIVE = `Skip to main content
Round trip
1
Economy
Taipei
Japan
1-week trip in the next 6 months
All filters (1)
About these results
Tokyo
Oct 29 – Nov 7
Nonstop
3 hr 15 min
NT$6,739
Osaka
Oct 29 – Nov 5
Nonstop
2 hr 15 min
NT$7,154
Kobe
Mar 19 – 25, 2027
Nonstop
2 hr 30 min
NT$12,334
Nagasaki
Oct 29 – Nov 5
1 stop
20 hr 50 min
NT$14,037
Okayama
Dec 28, 2026 – Jan 6, 2027
Nonstop
2 hr 25 min
NT$7,552
Okinawa
Nov 1 – 7
Nonstop
1 hr 20 min
NT$5,499
Wakkanai
Oct 15 – 21
1 stop
18 hr 55 min
NT$26,855
Iwakuni
Oct 15 – 21
View map`;

const TODAY = new Date('2026-10-15T00:00:00Z');

describe('parseExplorePage', () => {
  it('reads every complete destination card from live page text', () => {
    const quotes = parseExplorePage(LIVE, TODAY);
    expect(quotes.map(quote => quote.city)).toEqual(['Tokyo', 'Osaka', 'Kobe', 'Nagasaki', 'Okayama', 'Okinawa', 'Wakkanai']);
    expect(quotes[0]).toEqual({ city: 'Tokyo', outboundDate: '2026-10-29', returnDate: '2026-11-07', stops: 0, duration: '3 hr 15 min', price: 6739 });
    expect(quotes.find(quote => quote.city === 'Nagasaki')).toMatchObject({ stops: 1, price: 14037 });
    expect(quotes.find(quote => quote.city === 'Okinawa')).toMatchObject({ outboundDate: '2026-11-01', returnDate: '2026-11-07', price: 5499 });
  });

  it('reads cards rendered with thin spaces around the date dash, as headless Chromium does', () => {
    expect(parseExplorePage('Tokyo\nOct 29 – Nov 7\nNonstop\n3 hr 5 min\nNT$6,632', TODAY))
      .toEqual([{ city: 'Tokyo', outboundDate: '2026-10-29', returnDate: '2026-11-07', stops: 0, duration: '3 hr 5 min', price: 6632 }]);
  });

  it('skips a card whose price has not rendered', () => {
    expect(parseExplorePage(LIVE, TODAY).some(quote => quote.city === 'Iwakuni')).toBe(false);
  });

  it('keeps the cheapest card when a city repeats', () => {
    const text = 'Tokyo\nOct 29 – Nov 7\nNonstop\n3 hr\nNT$9,000\nTokyo\nNov 2 – 9\nNonstop\n3 hr\nNT$7,000';
    expect(parseExplorePage(text, TODAY)).toMatchObject([{ city: 'Tokyo', price: 7000, outboundDate: '2026-11-02' }]);
  });

  it('ignores page chrome that only looks like a card', () => {
    expect(parseExplorePage('NT$1,000 off!\nOct 29 – Nov 7\nNonstop\n3 hr\nNT$9,000', TODAY)).toEqual([]);
    expect(parseExplorePage('Tokyo\nOct 29 – Nov 7\nNonstop\n3 hr\nfree', TODAY)).toEqual([]);
  });
});

describe('pageTripLength', () => {
  it('reads which flexible trip length the page shows', () => {
    expect(pageTripLength(LIVE)).toBe('week');
    expect(pageTripLength('Japan\nWeekend trip in the next 6 months\nTokyo')).toBe('weekend');
    expect(pageTripLength('Japan\n2-week trip in the next 6 months\nTokyo')).toBe('two_weeks');
    expect(pageTripLength('Japan\nTokyo')).toBeNull();
  });
});

describe('parseExploreDates', () => {
  it('resolves yearless ranges to the next occurrence', () => {
    expect(parseExploreDates('Oct 15 – 21', TODAY)).toEqual({ outboundDate: '2026-10-15', returnDate: '2026-10-21' });
    expect(parseExploreDates('Feb 3 – 9', TODAY)).toEqual({ outboundDate: '2027-02-03', returnDate: '2027-02-09' });
  });

  it('carries the year across a December to January range', () => {
    expect(parseExploreDates('Dec 28 – Jan 4', TODAY)).toEqual({ outboundDate: '2026-12-28', returnDate: '2027-01-04' });
    expect(parseExploreDates('Dec 28, 2026 – Jan 6, 2027', TODAY)).toEqual({ outboundDate: '2026-12-28', returnDate: '2027-01-06' });
    expect(parseExploreDates('Mar 19 – 25, 2027', TODAY)).toEqual({ outboundDate: '2027-03-19', returnDate: '2027-03-25' });
  });

  it('rejects impossible dates and non-ranges', () => {
    expect(parseExploreDates('Feb 30 – Mar 2', TODAY)).toBeNull();
    expect(parseExploreDates('Nonstop', TODAY)).toBeNull();
  });
});

describe('Explore URLs', () => {
  it('builds a region Explore URL from plain place names only', () => {
    const url = new URL(buildExploreUrl({ origin: 'Taipei', region: 'Japan', currency: 'TWD', country: 'TW' }));
    expect(url.pathname).toBe('/travel/explore');
    expect(url.searchParams.get('q')).toBe('flights from Taipei to Japan');
    expect(url.searchParams.get('curr')).toBe('TWD');
    expect(() => buildExploreUrl({ origin: 'Taipei', region: 'Japan&x=1', currency: 'TWD', country: 'TW' })).toThrow();
  });

  it('links a card to a dated Google Flights search', () => {
    const url = new URL(buildCardSearchUrl('Taipei', { city: 'Okinawa', outboundDate: '2026-11-01', returnDate: '2026-11-07' }, 'TWD'));
    expect(url.searchParams.get('q')).toBe('flights from Taipei to Okinawa on 2026-11-01 to 2026-11-07');
  });
});

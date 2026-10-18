import { describe, it, expect } from 'vitest';
import { cheapestCities, findDeals, median, type CityHistory } from './detect';
import { dealMessage, digestMessage, scanFailingMessage, scanRecoveredMessage } from './message';
import type { ExploreQuote } from './explore-page';

const NOW = new Date('2026-10-15T04:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const quote = (city: string, price: number, extra: Partial<ExploreQuote> = {}): ExploreQuote =>
  ({ city, outboundDate: '2026-11-01', returnDate: '2026-11-07', stops: 0, duration: '1 hr 20 min', price, ...extra });
const history = (prices: number[], lastAlert: CityHistory['lastAlert'] = null): CityHistory =>
  ({ scanPrices: prices.map((price, index) => ({ price, scannedAt: daysAgo(index + 1) })), lastAlert });

describe('findDeals', () => {
  it('flags a city at least 20% below the median of its earlier scans', () => {
    const deals = findDeals([quote('Okinawa', 5600), quote('Tokyo', 9000)],
      new Map([['Okinawa', history([7000, 7200, 7100, 9000])], ['Tokyo', history([9500, 9400, 9300, 9600])]]), NOW);
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({ quote: { city: 'Okinawa' }, usualPrice: 7150, samples: 4 });
    expect(deals[0]!.discount).toBeCloseTo(1 - 5600 / 7150);
  });

  it('does not call a fare a promotion when it is still expensive for the region', () => {
    // 2026-10-16: Obihiro (one stop) at NT$16,359 was 44% under its own inflated usual price,
    // while most of Japan cost under NT$10,000 that weekend.
    const region = ['Okinawa', 'Tokyo', 'Osaka', 'Fukuoka'].map((city, index) => quote(city, 6000 + index * 1000));
    const obihiro = quote('Obihiro', 16359, { stops: 1 });
    const history = new Map([['Obihiro', { scanPrices: [29063, 28000, 30000, 29500].map((price, index) => ({ price, scannedAt: daysAgo(index + 1) })), lastAlert: null }]]);
    expect(findDeals([...region, obihiro], history, NOW)).toEqual([]);
    const okinawaHistory = new Map([['Okinawa', { scanPrices: [9000, 9000, 9000, 9000].map((price, index) => ({ price, scannedAt: daysAgo(index + 1) })), lastAlert: null }]]);
    expect(findDeals([...region, obihiro], okinawaHistory, NOW).map(deal => deal.quote.city)).toEqual(['Okinawa']);
  });

  it('stays silent until a city has enough history', () => {
    expect(findDeals([quote('Okinawa', 3000)], new Map([['Okinawa', history([7000, 7000, 7000])]]), NOW)).toEqual([]);
    expect(findDeals([quote('Okinawa', 3000)], new Map(), NOW)).toEqual([]);
  });

  it('ignores scans older than the history window', () => {
    const old: CityHistory = { scanPrices: [40, 41, 42, 43].map(day => ({ price: 7000, scannedAt: daysAgo(day) })), lastAlert: null };
    expect(findDeals([quote('Okinawa', 3000)], new Map([['Okinawa', old]]), NOW)).toEqual([]);
  });

  it('does not repeat an alert unless the price falls further or a week passes', () => {
    const base = [7000, 7000, 7000, 7000];
    const recent = history(base, { price: 5500, at: daysAgo(2) });
    expect(findDeals([quote('Okinawa', 5400)], new Map([['Okinawa', recent]]), NOW)).toEqual([]);
    expect(findDeals([quote('Okinawa', 5200)], new Map([['Okinawa', recent]]), NOW)).toHaveLength(1);
    expect(findDeals([quote('Okinawa', 5500)], new Map([['Okinawa', history(base, { price: 5500, at: daysAgo(8) })]]), NOW)).toHaveLength(1);
  });

  it('orders deals by the deepest discount', () => {
    const base = history([10000, 10000, 10000, 10000]);
    // Sapporo and Sendai have no history; they only set a realistic regional median.
    const deals = findDeals([quote('Tokyo', 7500), quote('Osaka', 6000), quote('Sapporo', 9000), quote('Sendai', 9500)],
      new Map([['Tokyo', base], ['Osaka', base]]), NOW);
    expect(deals.map(deal => deal.quote.city)).toEqual(['Osaka', 'Tokyo']);
  });
});

describe('helpers', () => {
  it('computes medians for odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('lists the cheapest cities with fewer stops winning ties', () => {
    expect(cheapestCities([quote('A', 9000), quote('B', 5000, { stops: 1 }), quote('C', 5000), quote('D', 7000)], 3)
      .map(item => item.city)).toEqual(['C', 'B', 'D']);
  });
});

describe('messages', () => {
  const context = { originLabel: '台北', origin: 'Taipei', regionLabel: '日本', currency: 'TWD', tripLabel: '約一週' };

  it('writes a Chinese promotion alert with the usual price and a search link', () => {
    const message = dealMessage({ quote: quote('Okinawa', 5499), usualPrice: 7200, discount: 1 - 5499 / 7200, samples: 6 }, context);
    expect(message.title).toContain('日本促銷（約一週）：沖繩');
    expect(message.body).toContain('台北 → 沖繩 來回');
    expect(message.body).toContain('直飛');
    expect(message.body).toContain('11/01–11/07');
    expect(message.body).toContain('📉 比平常便宜 NT$1,701');
    expect(message.body).toContain('常見價 NT$7,200');
    expect(message.body).not.toContain('%');
    // Phone-width lines: no line of the alert runs past about 24 characters.
    expect(Math.max(...message.body.split('\n').map(line => line.length))).toBeLessThanOrEqual(24);
    expect(new URL(message.url).searchParams.get('q')).toBe('flights from Taipei to Okinawa on 2026-11-01 to 2026-11-07');
  });

  it('adds the cheapest well-rated stay and an estimated trip total when hotel prices are known', () => {
    const hotels = { checkIn: '2026-11-01', checkOut: '2026-11-07', nights: 6, hotels: 20, deals: 2,
      cheapest: { name: 'Budget Inn', nightly: 700, rating: 2.8, badge: null, stars: 2 },
      cheapestGood: { name: 'Rycom Crystal Hotel', nightly: 1319, rating: 3.9, badge: null, stars: 3 } };
    const message = dealMessage({ quote: quote('Okinawa', 5499), usualPrice: 7200, discount: 0.24, samples: 6 }, context, hotels);
    expect(message.body).toContain('🏨 住宿參考 ⭐3.9\nRycom Crystal Hotel');
    expect(message.body).toContain('每晚 NT$1,319・6晚 NT$7,914');
    expect(message.body).toContain('含機票約 NT$13,413');
    expect(message.data).toMatchObject({ hotelNightly: 1319, hotelNights: 6 });
    expect(dealMessage({ quote: quote('Okinawa', 5499), usualPrice: 7200, discount: 0.24, samples: 6 }, context).body).not.toContain('住宿參考');
  });

  it('explains repeated scan failures and the recovery in Chinese', () => {
    const failing = scanFailingMessage(context, 3, 'page.goto: Timeout');
    expect(failing.title).toBe('⚠️ 日本促銷掃描暫時失敗（約一週）');
    expect(failing.body).toContain('連續失敗 3 次');
    expect(failing.body).toContain('page.goto: Timeout');
    expect(scanRecoveredMessage(context, 40).body).toContain('抓到 40 個城市');
  });

  it('writes a numbered Chinese daily list and keeps unknown city names', () => {
    const message = digestMessage([quote('Okinawa', 5499), quote('Wakkanai', 26855, { stops: 1 }), quote('Atlantis', 1)], context, '2026-10-15');
    expect(message.title).toBe('今日日本最便宜機票（約一週）');
    expect(message.body).toContain(['1. 沖繩 NT$5,499', '   11/01–11/07・直飛'].join('\n'));
    expect(message.body).toContain('1. 沖繩');
    expect(message.body).toContain('2. 稚內');
    expect(message.body).toContain('轉機 1 次');
    expect(message.body).toContain('3. Atlantis');
  });
});

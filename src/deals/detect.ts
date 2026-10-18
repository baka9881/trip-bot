import type { ExploreQuote } from './explore-page';

export interface DealRules {
  /** Fraction below the city's usual price that counts as a promotion. */
  dropPct: number;
  /** Earlier scans of a city needed before its usual price is trusted. */
  minSamples: number;
  /** Only scans within this many days form the usual price. */
  historyDays: number;
  /** A city alerted recently is alerted again only after a further drop of this fraction... */
  realertDropPct: number;
  /** ...or once this many days have passed. */
  realertAfterDays: number;
  /**
   * The fare must also be cheap for the region: at most this multiple of the
   * median fare across every city in the same scan. Without it a remote city
   * with a volatile, inflated usual price (e.g. a one-stop route) is called a
   * promotion at a price no traveller would think cheap.
   */
  maxVsRegionMedian: number;
}

export const DEFAULT_DEAL_RULES: DealRules = { dropPct: 0.2, minSamples: 4, historyDays: 30, realertDropPct: 0.05, realertAfterDays: 7, maxVsRegionMedian: 1 };

export interface CityHistory {
  /** Cheapest price of each earlier scan that listed the city. */
  scanPrices: { price: number; scannedAt: Date }[];
  lastAlert: { price: number; at: Date } | null;
}

export interface Deal {
  quote: ExploreQuote;
  usualPrice: number;
  discount: number; // 0..1 below the usual price
  samples: number;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * A promotion is a city whose cheapest round trip now is well below what this
 * scanner usually sees for it, and that is also cheap for the region (no more
 * than the median fare across this scan's cities). The usual price is the
 * median of earlier scans, so one odd scan cannot set the bar, and a new city
 * stays silent until enough history exists. Repeats are suppressed until the
 * price falls further or the last alert is a week old.
 */
export function findDeals(quotes: readonly ExploreQuote[], history: ReadonlyMap<string, CityHistory>, now: Date,
  rules: DealRules = DEFAULT_DEAL_RULES): Deal[] {
  const since = now.getTime() - rules.historyDays * 86_400_000;
  const regionCap = quotes.length ? median(quotes.map(quote => quote.price)) * rules.maxVsRegionMedian : Infinity;
  const deals: Deal[] = [];
  for (const quote of quotes) {
    if (quote.price > regionCap) continue;
    const city = history.get(quote.city);
    const prices = (city?.scanPrices ?? []).filter(scan => scan.scannedAt.getTime() >= since && scan.scannedAt < now).map(scan => scan.price);
    if (prices.length < rules.minSamples) continue;
    const usualPrice = median(prices);
    const discount = 1 - quote.price / usualPrice;
    if (discount < rules.dropPct) continue;
    const last = city?.lastAlert;
    if (last && now.getTime() - last.at.getTime() < rules.realertAfterDays * 86_400_000
      && quote.price > last.price * (1 - rules.realertDropPct)) continue;
    deals.push({ quote, usualPrice, discount, samples: prices.length });
  }
  return deals.sort((a, b) => b.discount - a.discount);
}

/** The daily list: cheapest cities first, ties broken by fewer stops. */
export function cheapestCities(quotes: readonly ExploreQuote[], limit: number): ExploreQuote[] {
  return [...quotes].sort((a, b) => a.price - b.price || a.stops - b.stops || a.city.localeCompare(b.city)).slice(0, limit);
}

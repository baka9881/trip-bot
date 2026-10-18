/** Google's own read of how a fare compares with typical prices for the route. */
export type MarketLevel = 'low' | 'typical' | 'high';

const MARKET_LEVEL_PATTERN = /\bPrices are currently (low|typical|high)\b/gi;

export function isMarketLevel(value: unknown): value is MarketLevel {
  return value === 'low' || value === 'typical' || value === 'high';
}

/**
 * Read the "Price insights" verdict from Google Flights page text (the scraper
 * always loads it with hl=en). Google compares the search against its own
 * market-wide price history, so this is the only market reference the tracker
 * has beyond its self-collected history. The text is untrusted page content:
 * two different verdicts on one page are treated as unknown rather than
 * picking one.
 */
/**
 * How far the search is from usual, as Google words it next to the verdict:
 * "Prices are currently low — NT$1,719 cheaper than usual for your search"
 * gives "NT$1,719 cheaper". Null when Google states no amount.
 */
export function parseMarketDifference(text: string): string | null {
  const match = /Prices are currently \w+\s*[—–-]\s*(\S+) (cheaper|more expensive) than usual/i.exec(text);
  return match ? `${match[1]} ${match[2]!.toLowerCase()}` : null;
}

export function parseGoogleMarketLevel(text: string): MarketLevel | null {
  const levels = new Set<MarketLevel>();
  for (const match of text.matchAll(MARKET_LEVEL_PATTERN)) levels.add(match[1]!.toLowerCase() as MarketLevel);
  return levels.size === 1 ? [...levels][0]! : null;
}

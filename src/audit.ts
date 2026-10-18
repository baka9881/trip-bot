// Checks on what the bot is about to show, built from the mistakes the user had to find
// (2026-10-18): a dorm-bed price passed off as a room, prices that disagree between sources, a
// single room offered to two people, hotels with no photos or no booking site. `deals audit`
// runs them over every cached result; the daily self-check reports what they find.
import type { HotelListQuote, HotelPhotos, SiteOffer } from './deals/hotel-page';
import type { FlightOption } from './deals/flight-list';
import { recommendedSite } from './format';

export interface AuditPick { hotel: Pick<HotelListQuote, 'name' | 'nightly'>; note: string; sites: SiteOffer[]; photos?: HotelPhotos }

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** Problems with one hotel list, each naming the hotel; empty when it looks right. */
export function auditStays(picks: readonly AuditPick[], travelers: number): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    const name = pick.hotel.name;
    if (seen.has(name)) problems.push(`${name}：清單裡重複出現`);
    seen.add(name);
    const site = recommendedSite(pick.sites);
    const quoted = site?.nightly ?? pick.hotel.nightly;
    if (quoted < 300 || quoted > 30_000) problems.push(`${name}：每晚 ${quoted} 不合理`);
    if (!pick.sites.length) problems.push(`${name}：沒有任何訂房網站價格`);
    const prices = pick.sites.map(offer => offer.nightly);
    if (site && prices.length >= 3 && site.nightly > median(prices) * 1.4) {
      problems.push(`${name}：推薦的 ${site.site} 比各網站中間價貴很多`);
    }
    if (travelers >= 2 && /單人房/.test(pick.note)) problems.push(`${name}：列的是單人房，但設定 ${travelers} 人同行`);
    if (/共用衛浴/.test(pick.note)) problems.push(`${name}：房型是共用衛浴`);
    if (!pick.photos || (!pick.photos.rooms.length && !pick.photos.bedroom.length)) problems.push(`${name}：沒有房間照片`);
  }
  return problems;
}

/** Problems with one flight search. */
export function auditFlights(found: { market: unknown; flights: readonly FlightOption[] } | null): string[] {
  if (!found) return ['航班頁沒有讀到'];
  const problems: string[] = [];
  if (!found.flights.length) problems.push('沒有航班');
  if (!found.market) problems.push('沒有 Google 的價格判斷');
  const absurd = found.flights.filter(flight => flight.price < 1_000 || flight.price > 200_000);
  if (absurd.length) problems.push(`有 ${absurd.length} 個航班價格不合理`);
  return problems;
}

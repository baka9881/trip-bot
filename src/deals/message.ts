import type { AlertMessage as ChannelMessage } from '../store';
import { buildCardSearchUrl, type ExploreQuote } from './explore-page';
import type { Deal } from './detect';
import type { HotelSummary } from './hotel-page';

// Google renders Explore cards in English (hl=en); show the common names readers know.
export const CITY_NAMES: Record<string, string> = {
  Tokyo: '東京', Osaka: '大阪', Nagoya: '名古屋', Fukuoka: '福岡', Sapporo: '札幌', Okinawa: '沖繩', Naha: '那霸',
  Kyoto: '京都', Kobe: '神戶', Hiroshima: '廣島', Sendai: '仙台', Kagoshima: '鹿兒島', Kumamoto: '熊本',
  Nagasaki: '長崎', Hakodate: '函館', Aomori: '青森', Akita: '秋田', Niigata: '新潟', Toyama: '富山',
  Okayama: '岡山', Takamatsu: '高松', Matsuyama: '松山', Kochi: '高知', Tokushima: '德島', Miyazaki: '宮崎',
  Oita: '大分', Saga: '佐賀', Kitakyushu: '北九州', Ishigaki: '石垣', Miyakojima: '宮古島', Yakushima: '屋久島',
  Shizuoka: '靜岡', Asahikawa: '旭川', Kushiro: '釧路', Obihiro: '帶廣', Wakkanai: '稚內', Fukushima: '福島',
  Yamagata: '山形', Tottori: '鳥取', Izumo: '出雲', Shirahama: '白濱', Iwakuni: '岩國', Komatsu: '小松',
  Kanazawa: '金澤', Hanamaki: '花卷', Yonago: '米子', Ube: '宇部', Memanbetsu: '女滿別', Matsumoto: '松本',
};

export function cityLabel(city: string): string {
  return CITY_NAMES[city] ?? city;
}

const money = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${Math.round(amount).toLocaleString('en-US')}`; }
};
const dates = (quote: ExploreQuote) => `${quote.outboundDate.slice(5).replace('-', '/')}–${quote.returnDate.slice(5).replace('-', '/')}`;
const stops = (quote: ExploreQuote) => quote.stops === 0 ? '直飛' : `轉機 ${quote.stops} 次`;

export interface DealContext { originLabel: string; origin: string; regionLabel: string; currency: string; tripLabel: string }

/** The stay the traveller would likely pick: the cheapest well-rated hotel, else the cheapest listed. */
function hotelText(summary: HotelSummary, flightPrice: number, currency: string): string {
  const pick = summary.cheapestGood ?? summary.cheapest;
  const stay = pick.nightly * summary.nights;
  const rating = pick.rating !== null ? ` ⭐${pick.rating}` : '';
  return `\n\n🏨 住宿參考${rating}\n${pick.name}\n每晚 ${money(pick.nightly, currency)}・${summary.nights}晚 ${money(stay, currency)}`
    + `\n含機票約 ${money(flightPrice + stay, currency)}`;
}

/** Short lines that fit a phone: route and price, dates, the saving in money, then the hotel reference. */
export function dealMessage(deal: Deal, context: DealContext, hotels: HotelSummary | null = null): ChannelMessage {
  const { quote } = deal;
  const saving = Math.round(deal.usualPrice - quote.price);
  const url = buildCardSearchUrl(context.origin, quote, context.currency);
  return {
    title: `${cityLabel(quote.city)} ${money(quote.price, context.currency)}・${context.tripLabel}促銷`,
    body: `${context.originLabel} → ${cityLabel(quote.city)} 來回 ${money(quote.price, context.currency)}`
      + `\n${dates(quote)}・${stops(quote)}`
      + `\n📉 比平常便宜 ${money(saving, context.currency)}`
      + `\n（常見價 ${money(deal.usualPrice, context.currency)}）`
      + (hotels ? hotelText(hotels, quote.price, context.currency) : '')
      + `\n\n1 人來回、房價 2 人計，訂前請再確認。`,
    url,
    data: { kind: 'region_deal', city: quote.city, price: quote.price, usualPrice: deal.usualPrice, currency: context.currency,
      outboundDate: quote.outboundDate, returnDate: quote.returnDate,
      ...(hotels ? { hotelNightly: (hotels.cheapestGood ?? hotels.cheapest).nightly, hotelNights: hotels.nights } : {}) },
  };
}

export function scanFailingMessage(context: DealContext, failures: number, error: string): ChannelMessage {
  return {
    title: `⚠️ ${context.regionLabel}促銷掃描暫時失敗（${context.tripLabel}）`,
    body: `${context.originLabel} → ${context.regionLabel}的掃描已經連續失敗 ${failures} 次，這段期間不會有促銷通知。`
      + `\n最後的錯誤：${error}`
      + `\n系統會每小時自動重試，恢復後會再通知你。若一直沒恢復，可能是 Google 改版或暫時擋住了查詢。`,
    url: '',
    data: { kind: 'region_scan_failing', failures },
  };
}

export function scanRecoveredMessage(context: DealContext, cities: number): ChannelMessage {
  return {
    title: `✅ ${context.regionLabel}促銷掃描已恢復（${context.tripLabel}）`,
    body: `${context.originLabel} → ${context.regionLabel}的掃描恢復正常，這次抓到 ${cities} 個城市的價格。`,
    url: '',
    data: { kind: 'region_scan_recovered', cities },
  };
}

export function digestMessage(quotes: readonly ExploreQuote[], context: DealContext, day: string): ChannelMessage {
  // Two short lines per city so the list reads cleanly on a phone.
  const lines = quotes.map((quote, index) =>
    `${index + 1}. ${cityLabel(quote.city)} ${money(quote.price, context.currency)}\n   ${dates(quote)}・${stops(quote)}`);
  return {
    title: `今日${context.regionLabel}最便宜機票（${context.tripLabel}）`,
    body: `${context.originLabel}出發・${day.slice(5).replace('-', '/')} 掃描\n\n${lines.join('\n')}\n\n有明顯降價會另外通知你。`,
    url: '',
    data: { kind: 'region_digest', day, count: quotes.length },
  };
}

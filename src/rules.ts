// The user's rules for what the bot sends, each one something they had to point out (dates are when).
// Every message is checked against them before it goes out (problems are logged for the daily
// self-check), and `deals check` renders every command and checks it, so mistakes are found here
// rather than by the user.
import { phoneWidth, PHONE_WIDTH } from './format';

export interface CheckedSegment { text: string; photos: readonly string[] }
export interface RuleContext { travelers: number; nonSmoking: boolean }

const AMOUNT = /NT\$([\d,]+)/;
const amount = (line: string | undefined) => {
  const match = line ? AMOUNT.exec(line) : null;
  return match ? Number(match[1]!.replace(/,/g, '')) : null;
};
const HOTEL_LINE = /^(\d+)\. \[([^\]]+)\]\(/;
const SHOWN_NAME = /^(\d+\. |🏨 )\[|^[\x20-\x7E]+$/; // hotel and room names may wrap; they cannot be shortened

/** Problems with one rendered command output; empty when it follows every rule. */
export function checkOutput(segments: readonly CheckedSegment[], keyboard: readonly (readonly string[])[], context: RuleContext): string[] {
  const problems: string[] = [];
  const text = segments.map(segment => segment.text).filter(Boolean).join('\n');
  const lines = text.split('\n');
  // What the user reads: link text without its URL (URLs hold "%" and are not shown).
  const shown = lines.map(line => line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));

  // Phone layout (2026-10-18, 2026-10-19 twice): no line wraps on a phone.
  lines.forEach((line, index) => { if (!SHOWN_NAME.test(line) && phoneWidth(line) > PHONE_WIDTH) problems.push(`手機會折行：${shown[index]}`); });

  // Amounts, not percentages (2026-10-17).
  for (const line of shown) if (/\d\s?%/.test(line)) problems.push(`用了百分比：${line}`);

  // No smoking rooms (2026-10-19 twice). The notice that a hotel has nothing else is allowed.
  if (context.nonSmoking) {
    for (const line of lines) {
      const smoking = (/\bsmoking\b/i.test(line) && !/\b(non|no)[- ]?smoking\b/i.test(line)) || /🚬|吸菸房/.test(line);
      if (smoking && !/只有吸菸房|沒有禁菸房/.test(line)) problems.push(`出現吸菸房：${line}`);
    }
  }

  // A party of two or more is never offered a single room (2026-10-18).
  if (context.travelers >= 2) for (const line of lines) if (/^⭐.*單人房/.test(line)) problems.push(`${context.travelers} 人同行卻列單人房：${line}`);

  // Separate tickets are two bookings, each with its own link (2026-10-19); each leg shows its time
  // in the air, since local times differ by an hour (2026-10-19).
  const outboundAt = lines.findIndex(line => /^✈️ \[?去 /.test(line));
  const inboundAt = lines.findIndex(line => /^\[?回 /.test(line));
  const outbound = lines[outboundAt];
  const inbound = lines[inboundAt];
  const flies = (at: number) => /飛 \d+h\d\d/.test(`${lines[at]} ${lines[at + 1] ?? ''}`); // on the leg's line or the next
  if (outbound && !flies(outboundAt)) problems.push(`去程沒寫飛行時間：${shown[outboundAt]}`);
  if (inbound && !flies(inboundAt)) problems.push(`回程沒寫飛行時間：${shown[inboundAt]}`);
  if (lines.some(line => /^分開訂兩張票/.test(line)) && !(outbound?.includes('](') && inbound?.includes(']('))) problems.push('分開訂兩張票，但去回沒有各自的訂票連結');
  // Flights fit the hotel's check-in and check-out (2026-10-19).
  for (const line of lines) if (/^⚠️ .*(到飯店|離開飯店)/.test(line)) problems.push(`航班時間不配合入住或退房：${line}`);

  // Each hotel: a photo with its prices (2026-10-17), a booking link (2026-10-17), shown once, and
  // totals that add up (2026-10-18: prices that did not agree).
  const fare = (amount(lines.find(line => /^來回每人 /.test(line))) ?? 0) + (amount(lines.find(line => /^＋托運行李約 /.test(line))) ?? 0);
  const seen = new Set<string>();
  for (const segment of segments) {
    const hotelLines = segment.text.split('\n');
    const head = hotelLines.find(line => HOTEL_LINE.test(line));
    if (!head) continue;
    const name = HOTEL_LINE.exec(head)![2]!;
    if (seen.has(name)) problems.push(`${name}：清單裡重複出現`);
    seen.add(name);
    if (!segment.photos.length) problems.push(`${name}：沒有照片`);
    if (!hotelLines.some(line => /^在 \[[^\]]+\]\(/.test(line))) problems.push(`${name}：沒有訂房連結`);
    const nightly = amount(hotelLines.find(line => /^每晚含稅 /.test(line)));
    const stayLine = hotelLines.find(line => /^\d+晚( \d+間)? NT\$/.test(line));
    const nights = Number(/^(\d+)晚/.exec(stayLine ?? '')?.[1]);
    const rooms = Number(/晚 (\d+)間/.exec(stayLine ?? '')?.[1] ?? 1);
    const stay = amount(stayLine);
    if (nightly !== null && stay !== null && Math.abs(nightly * nights * rooms - stay) > nights * rooms) {
      problems.push(`${name}：每晚 NT$${nightly} × ${nights} 晚 ≠ NT$${stay}`);
    }
    // "2人含機票 NT$y", or for one traveller "4晚 NT$x・含機票 NT$y" on one line.
    const total = amount(hotelLines.find(line => /含機票 NT\$/.test(line))?.replace(/^.*含機票/, ''));
    if (fare && stay !== null && total !== null && Math.abs(stay + fare * context.travelers - total) > context.travelers) {
      problems.push(`${name}：住宿 NT$${stay} ＋ 機票 NT$${fare} × ${context.travelers} ≠ NT$${total}`);
    }
  }

  // Buttons to tap instead of typing (2026-10-17): a list of options always comes with them.
  if (/^\*?[A-C]\d\*? \[|^\d+\. \[/m.test(text) && !keyboard.length) problems.push('有選項但沒有按鈕');
  return problems;
}

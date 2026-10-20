// The checks catch each mistake the user found before (dates in src/rules.ts).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { checkOutput } from './rules';

const context = { travelers: 2, nonSmoking: true, checkIn: '15:00', checkOut: '10:00' };
const hotel = (lines: string[], photos = ['room.jpg', 'bath.jpg']) => ({ text: lines.join('\n'), photos });
const plan = { text: ['✈️ [去 酷航 14:25→18:30](https://scoot)', '飛 3h05・約 21:00 到飯店', '[回 酷航 12:10→15:15](https://scoot)',
  '飛 4h05・08:40 就要離開飯店', '來回每人 NT$7,659', '＋托運行李約 NT$1,800（估算）', '分開訂兩張票・省 NT$1,333'].join('\n'), photos: [] };
const good = hotel(['1. [APA Hotel](https://g)', '⭐4.3・雙人房・📍台東區', '每晚含稅 NT$3,490', '在 [Rakuten Travel](https://r) 訂',
  '6晚 NT$20,940', '2人含機票 NT$39,858', '每人 NT$19,929']);
const keyboard = [['📷 第1間房型']];

test('a list that follows every rule passes', () => {
  assert.deepEqual(checkOutput([plan, good], keyboard, context), []);
});

test('each mistake the user found is caught', () => {
  const problems = (segments: Parameters<typeof checkOutput>[0], keys = keyboard) => checkOutput(segments, keys, context).join('\n');
  assert.match(problems([plan, hotel(['1. [APA](https://g)', 'Double Room - Smoking', '每晚含稅 NT$3,490', '在 [Trip](https://t) 訂'])]), /吸菸房/);
  assert.match(problems([plan, hotel(['1. [APA](https://g)', '⭐4.1・單人房', '每晚含稅 NT$3,490', '在 [Trip](https://t) 訂'])]), /單人房/);
  assert.match(problems([plan, hotel(['1. [APA](https://g)', '每晚含稅 NT$3,490', '在 [Trip](https://t) 訂'], [])]), /沒有照片/);
  assert.match(problems([plan, hotel(['1. [APA](https://g)', '每晚含稅 NT$3,490', '6晚 NT$21,000'])]), /沒有訂房連結/);
  assert.match(problems([plan, hotel(['1. [APA](https://g)', '每晚含稅 NT$3,490', '在 [Trip](https://t) 訂', '6晚 NT$20,940', '2人含機票 NT$45,000'])]), /≠/);
  assert.match(problems([{ ...plan, text: plan.text.replace('[回 酷航 12:10→15:15](https://scoot)', '回 酷航 12:10→15:15') }, good]), /各自的訂票連結/);
  assert.match(problems([{ ...plan, text: plan.text.replace('飛 3h05・', '') }, good]), /去程沒寫飛行時間/);
  assert.match(problems([plan, good, { text: '2 人總共約 NT$31,412・每人 NT$15,706・比平常便宜 NT$800', photos: [] }]), /手機會折行/);
  assert.match(problems([plan, good, { text: '比平常便宜 22%', photos: [] }]), /百分比/);
  assert.match(problems([plan, good], []), /沒有按鈕/);
  assert.match(problems([plan, good, good]), /重複/);
});

test('a percent sign inside a link is not a percentage', () => {
  const linked = hotel(['1. [APA](https://g)', '⭐4.3・📍台東區', '每晚含稅 NT$3,490', '在 [Booking](https://b?x%3D1) 訂']);
  assert.deepEqual(checkOutput([plan, linked], keyboard, context), []);
});

test('dates carry weekdays and ratings a decimal', () => {
  const problems = checkOutput([plan, good, { text: '10/31–11/02・≈ 平常價\n⭐4・雙人房', photos: [] }], keyboard, context).join('\n');
  assert.match(problems, /星期幾/);
  assert.match(problems, /小數/);
  assert.deepEqual(checkOutput([plan, good, { text: '10/31(六)–11/02(一)・≈ 平常價\n⭐4.0・雙人房', photos: [] }], keyboard, context), []);
});

// Tokyo, Oct 29–Nov 7 (2026-10-19): "13:10 離開飯店" under "10:00 退房".
test('hotel times agree with check-in and check-out', () => {
  const late = { ...plan, text: plan.text.replace('08:40 就要離開飯店', '13:10 離開飯店') };
  assert.match(checkOutput([late, good], keyboard, context).join('\n'), /退房 10:00 之後才離開飯店/);
  const early = { ...plan, text: plan.text.replace('約 21:00 到飯店', '約 13:00 到飯店') };
  assert.match(checkOutput([early, good], keyboard, context).join('\n'), /沒說可以先寄放行李/);
  const told = { ...plan, text: plan.text.replace('約 21:00 到飯店', '約 13:00 到飯店\n15:00 才能入住・可先寄放行李')
    .replace('08:40 就要離開飯店', '10:00 退房\n13:10 出發去機場・可寄放行李') };
  assert.deepEqual(checkOutput([told, good], keyboard, context), []);
});

// Tokyo nearby list (2026-10-19): hotel 3 had no room-photo button.
test('every listed hotel has its room-photo button', () => {
  const second = { ...good, text: good.text.replace('1. [APA Hotel]', '2. [Sunroute]') };
  assert.match(checkOutput([plan, good, second], keyboard, context).join('\n'), /第 2 間沒有房型按鈕/);
  assert.deepEqual(checkOutput([plan, good, second], [['📷 第1間房型', '📷 第2間房型']], context), []);
});

// Osaka (2026-10-19): NT$2,980 listed above NT$2,238; the user wants the best value first.
test('hotels are listed cheapest first', () => {
  const pricier = { ...good, text: good.text.replace('1. [APA Hotel]', '2. [SHE]').replace('NT$3,490', 'NT$2,980') };
  const problems = checkOutput([plan, good, pricier], [['📷 第1間房型', '📷 第2間房型']], context).join('\n');
  assert.match(problems, /沒有照價格排/);
});

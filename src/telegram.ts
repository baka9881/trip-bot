// Sends the deals CLI output straight to the trip bot's Telegram chat with buttons inside the message.
// Each button's callback data is "ff:<label>"; the trip profile's flight-deal-buttons plugin turns a
// tap into an ordinary message, so "B4 東京" reaches the agent exactly as if the user had typed it.
// Hermes' own button prompts allow only four choices, too few for a fare list.
import { readFileSync } from 'node:fs';

const PROFILE = 'C:/Users/shiro/AppData/Local/hermes/profiles/trip';
const MAX_TEXT = 4000; // Telegram's limit is 4096 characters per message
const CALLBACK_PREFIX = 'ff:';
const MAX_CALLBACK_BYTES = 64; // Telegram's limit for callback_data

/** "ff:B4 東京", falling back to just the code when a long label passes Telegram's byte limit. */
export function callbackData(label: string): string {
  const data = `${CALLBACK_PREFIX}${label}`;
  return Buffer.byteLength(data) <= MAX_CALLBACK_BYTES ? data : `${CALLBACK_PREFIX}${label.split(' ')[0]}`;
}

function profileFile(name: string): string {
  try { return readFileSync(`${PROFILE}/${name}`, 'utf8'); } catch { return ''; }
}

function botToken(): string | undefined {
  const fromFile = /^TELEGRAM_BOT_TOKEN=(.+)$/m.exec(profileFile('.env'))?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  return process.env.TELEGRAM_BOT_TOKEN || fromFile;
}

function homeChat(): string | undefined {
  return /home_channel:[\s\S]*?chat_id:\s*['"]?(-?\d+)/.exec(profileFile('config.yaml'))?.[1];
}

// Telegram counts the text a message shows, not the URLs behind its links (booking links run to 1,400 characters).
const shownLength = (text: string) => text.replace(/\]\([^)\s]*\)/g, ']').length;

// Telegram also caps the link URLs one message may carry (ENTITIES_TOO_LONG); twelve booking links overran it.
const MAX_LINK_CHARS = 5000;
const linkLength = (text: string) => [...text.matchAll(/\]\(([^)\s]*)\)/g)].reduce((sum, match) => sum + match[1]!.length, 0);

/**
 * Split into messages under Telegram's text and link limits, breaking only
 * between blocks (a hotel "1. …", an area "📍 …") so no hotel is cut in half.
 */
export function chunks(text: string): string[] {
  const blocks: string[] = [];
  for (const line of text.split('\n')) {
    if (!blocks.length || /^(\d+\. |📍)/.test(line)) blocks.push(line);
    else blocks[blocks.length - 1] += `\n${line}`;
  }
  const parts: string[] = [];
  let current = '';
  for (const block of blocks) {
    const joined = current ? `${current}\n${block}` : block;
    if (current && (shownLength(joined) > MAX_TEXT || linkLength(joined) > MAX_LINK_CHARS)) { parts.push(current); current = block; }
    else current = joined;
  }
  if (current) parts.push(current);
  return parts;
}

/** A stretch of the output; one with photos is sent as a photo album captioned by its own text. */
export interface Segment { text: string; photos: string[]; own?: boolean } // own: always its own message (a hotel)

const MAX_CAPTION = 1000; // Telegram shows at most 1024 characters under a photo or album

async function telegram(token: string, method: string, body: object): Promise<{ ok: boolean; detail: string }> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  return response ? { ok: response.ok, detail: response.ok ? '' : await response.text() } : { ok: false, detail: 'no response' };
}

// Legacy Markdown renders the CLI's *bold* and [links](url); fall back to plain text if Telegram rejects it.
const PARSE_MODES = ['Markdown', undefined] as const;

async function sendText(token: string, chatId: string, text: string, replyMarkup?: object): Promise<void> {
  for (const parseMode of PARSE_MODES) {
    const result = await telegram(token, 'sendMessage', { chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true, reply_markup: replyMarkup });
    if (result.ok) return;
    if (!parseMode || !/parse entities/i.test(result.detail)) throw new Error(`Telegram: ${result.detail.slice(0, 200)}`);
  }
}

/** One photo, or an album of up to ten, with the caption under it. False when Telegram could not take it. */
async function sendAlbum(token: string, chatId: string, photos: readonly string[], caption: string): Promise<boolean> {
  for (const parseMode of PARSE_MODES) {
    const result = photos.length === 1
      ? await telegram(token, 'sendPhoto', { chat_id: chatId, photo: photos[0], caption, parse_mode: parseMode })
      : await telegram(token, 'sendMediaGroup', { chat_id: chatId, media: photos.slice(0, 10).map((photo, index) =>
        ({ type: 'photo', media: photo, ...(index === 0 ? { caption, parse_mode: parseMode } : {}) })) });
    if (result.ok) return true;
    if (!parseMode || !/parse entities/i.test(result.detail)) {
      console.error(`[deals] photos not sent for "${caption.split('\n')[0]}": ${result.detail.slice(0, 120)}`);
      return false;
    }
  }
  return false;
}

/**
 * Sends the segments in order: a segment with photos becomes an album whose caption is that
 * segment's text (a hotel's photos with its prices and booking links), text-only segments are
 * joined into messages, and the buttons go on the last message.
 */
export async function sendToTelegram(segments: readonly Segment[], keyboard: readonly (readonly string[])[]): Promise<void> {
  const token = botToken();
  const chatId = homeChat();
  if (!token || !chatId) throw new Error('找不到 trip bot 的 Telegram 設定');
  let pending = '';
  const flush = async (withKeyboard: boolean) => {
    const parts = chunks(pending.trim());
    pending = '';
    for (const [index, part] of parts.entries()) {
      const markup = withKeyboard && index === parts.length - 1 && keyboard.length
        ? { inline_keyboard: keyboard.map(row => row.map(label => ({ text: label, callback_data: callbackData(label) }))) }
        : undefined;
      if (part) await sendText(token, chatId, part, markup);
    }
  };
  for (const segment of segments) {
    const text = segment.text.replace(/^\n+|\n+$/g, '');
    if (!text && !segment.photos.length) continue;
    if (segment.photos.length && shownLength(text) <= MAX_CAPTION) {
      await flush(false);
      if (await sendAlbum(token, chatId, segment.photos, text)) continue;
    }
    // A hotel without photos still stands alone, so the footer that follows does not read as part of it.
    if (segment.own) {
      await flush(false);
      pending = text;
      await flush(false);
      continue;
    }
    pending = pending ? `${pending}\n${text}` : text;
  }
  await flush(true);
}

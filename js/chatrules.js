/**
 * Message rules.
 *   ghost  (no wallet, no hole) ........ cannot send anything (read only)
 *   wallet (wallet, no hole) ........... slow mode, short messages
 *   holder (owns a hole) ............... fast and long messages
 *   staff / owner (admins) ............. no rules except length
 * Everybody except staff/owner: no links, no advertising / scam phrases, spam limits.
 */
export const LIMITS = {
  wallet: { global: { cool: 15000, max: 120, perHour: 25 }, dm: { cool: 30000, max: 120, perHour: 12 }, cafe: { cool: 8000, max: 80, perHour: 60 } },
  holder: { global: { cool: 3000, max: 300, perHour: 200 }, dm: { cool: 3000, max: 300, perHour: 200 }, cafe: { cool: 1500, max: 120, perHour: 600 } }
};
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|xyz|app|gg|me|co|ly|sol|fun|ai|cc|tk|ru|link|site|online|shop|store|club|top|info|dev|page|wtf|lol)\b|\bt\.me\b|discord\.gg|bit\.ly)/i;
const ADS = /(airdrop|giveaway|free\s*(sol|nft|crypto|mint)|white\s*list|pre\s*sale|guaranteed\s*(profit|gain)|join\s+(my|our|the)\s+(group|channel|server|discord|telegram)|follow\s+(me|us)|check\s+(out\s+)?(my|our)\s+\w+|promo(tion)?\b|buy\s+now|click\s+here|referral\s+code|invest(ment)?\s+(now|with)|telegram|whatsapp|dm\s+me\s+for)/i;
const SECRET = /(seed\s*phrase|private\s*key|secret\s*recovery|recovery\s*phrase|send\s+(me\s+)?(sol|crypto|nft))/i;
const EMOJI = /\p{Extended_Pictographic}/gu;

/** Returns an error text, or null if the message is fine. */
export function checkMessage({ text, tier, role, scope, history = [], now = Date.now() }) {
  const staff = role === "owner" || role === "staff";
  if (tier === "ghost" && !staff) return "Ghosts can read but not talk. Connect a wallet to join the chat.";
  const lim = staff ? { max: 300 } : LIMITS[tier]?.[scope] || LIMITS.wallet[scope];
  if (text.length > lim.max) return `Messages are limited to ${lim.max} characters for you.`;
  if (staff) return null;
  const mine = history.filter((m) => now - m.ts < 3600e3);
  const last = history[history.length - 1];
  if (last && now - last.ts < lim.cool) return `Slow mode: wait ${Math.ceil((lim.cool - (now - last.ts)) / 1000)}s before sending again.`;
  if (mine.length >= lim.perHour) return "You reached the hourly message limit. Please try later.";
  if (history.filter((m) => now - m.ts < 20000).length >= 5) return "You are sending too fast.";
  if (SECRET.test(text)) return "Never share secrets or ask for crypto in chat.";
  if (LINK.test(text)) return "Links are not allowed in chat.";
  if (ADS.test(text)) return "Advertising is not allowed in chat.";
  if (/(.)\1{8,}/u.test(text) || /\b(\w+)(\s+\1\b){4,}/i.test(text)) return "Please do not repeat the same characters or words.";
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 12 && letters.replace(/[^A-Z]/g, "").length / letters.length > .7) return "Please do not shout (ALL CAPS).";
  if ((text.match(EMOJI) || []).length > 12) return "Too many emojis in one message.";
  if (history.some((m) => m.text === text && now - m.ts < 60000)) return "You already sent that message.";
  return null;
}

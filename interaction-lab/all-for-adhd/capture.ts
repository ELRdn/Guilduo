/**
 * Reads a date, time, length and #tags out of a captured line (plan §4.4). Words from all nine
 * locales are accepted at once, so a mixed-language line still parses. Anything not understood
 * stays in the title; the line is never lost.
 */

import { addDays } from "./model.ts";

export interface Capture {
  readonly title: string;
  readonly date: string;
  readonly time: string;
  readonly minutes: number;
  readonly tags: readonly string[];
}

// Latin-script words need word edges; CJK words sit inside running text.
const edge = (words: string) => `(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`;
const DAY_WORDS: readonly (readonly [number, string])[] = [
  [0, `今日|오늘|今天|${edge("today|hoy|hoje|aujourd'hui|heute|сегодня")}`],
  [2, `あさって|明後日|모레|后天|${edge("pasado mañana|depois de amanhã|après-demain|übermorgen|послезавтра")}`],
  [1, `明日|あした|내일|明天|${edge("tomorrow|tmrw|mañana|amanhã|demain|morgen|завтра")}`],
];
// Monday first; each entry lists every locale's names for that weekday.
const WEEKDAYS: readonly string[] = [
  `月曜日?|월요일|(?:周|星期)一|${edge("mon(?:day)?|lunes|segunda(?:-feira)?|lundi|montag|понедельник")}`,
  `火曜日?|화요일|(?:周|星期)二|${edge("tue(?:sday)?|martes|terça(?:-feira)?|mardi|dienstag|вторник")}`,
  `水曜日?|수요일|(?:周|星期)三|${edge("wed(?:nesday)?|miércoles|quarta(?:-feira)?|mercredi|mittwoch|среду|среда")}`,
  `木曜日?|목요일|(?:周|星期)四|${edge("thu(?:rsday)?|jueves|quinta(?:-feira)?|jeudi|donnerstag|четверг")}`,
  `金曜日?|금요일|(?:周|星期)五|${edge("fri(?:day)?|viernes|sexta(?:-feira)?|vendredi|freitag|пятницу|пятница")}`,
  `土曜日?|토요일|(?:周|星期)六|${edge("sat(?:urday)?|sábado|samedi|samstag|субботу|суббота")}`,
  `日曜日?|일요일|(?:周|星期)[日天]|${edge("sun(?:day)?|domingo|dimanche|sonntag|воскресенье")}`,
];
const CJK_HOURS = "時間|시간|小时|個小時";
const CJK_MINUTES = "分钟|分鐘|分|분";
const HOURS = "h|hrs?|hours?|horas?|heures?|std|stunden?|ч|час(?:а|ов)?";
const MINUTES = "m|mins?|minutes?|minutos?|minuten?|мин|минут[аы]?";
const MONTH_FIRST = new Set(["ja", "en", "ko", "zh-Hans"]);

const pad = (value: number) => String(value).padStart(2, "0");

export function parseCapture(text: string, today: string, locale = "ja"): Capture {
  let rest = ` ${text} `;
  let date = "", time = "", minutes = 0;
  const take = (pattern: string, use: (match: RegExpExecArray) => boolean) => {
    const match = new RegExp(pattern, "iu").exec(rest);
    if (match && use(match)) rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`;
  };

  for (const [offset, words] of DAY_WORDS) if (!date) take(words, () => { date = addDays(today, offset); return true; });
  WEEKDAYS.forEach((words, index) => {
    if (date) return;
    // The coming weekday, today included.
    const todayIndex = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    take(words, () => { date = addDays(today, (index - todayIndex + 7) % 7); return true; });
  });
  if (!date) take("(\\d{1,2})月(\\d{1,2})日|(\\d{1,2})월\\s*(\\d{1,2})일|(?<![\\d/.])(\\d{1,2})[/.](\\d{1,2})(?![\\d/:])", match => {
    const [m, d] = match[1] ? [match[1], match[2]] : match[3] ? [match[3], match[4]] : MONTH_FIRST.has(locale) ? [match[5], match[6]] : [match[6], match[5]];
    const month = Number(m), day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const year = Number(today.slice(0, 4));
    const candidate = `${year}-${pad(month)}-${pad(day)}`;
    date = candidate < today ? `${year + 1}-${pad(month)}-${pad(day)}` : candidate;
    return true;
  });

  const setTime = (hours: number, mins: number, pm: boolean) => {
    const hour = pm && hours < 12 ? hours + 12 : hours;
    if (hour > 23 || mins > 59) return false;
    time = `${pad(hour)}:${pad(mins)}`;
    return true;
  };
  take("(午後|下午|오후)?\\s*(?<![\\d.,])(\\d{1,2})\\s*(?:時(?!間)|시(?!간)|点|點)(?:\\s*(半)|\\s*(\\d{1,2})\\s*(?:分|분))?", match =>
    setTime(Number(match[2]), match[3] ? 30 : Number(match[4] ?? 0), Boolean(match[1])));
  if (!time) take(edge("(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)"), match => setTime(Number(match[1]) % 12, Number(match[2] ?? 0), match[3]!.toLowerCase() === "pm"));
  if (!time) take("(?<![\\d:])(\\d{1,2}):(\\d{2})(?![\\d:])", match => setTime(Number(match[1]), Number(match[2]), false));

  take(`(?<![\\d.,])(\\d+(?:[.,]\\d)?)\\s*(?:${CJK_HOURS})(?:\\s*(\\d{1,2})\\s*(?:${CJK_MINUTES})?)?|${edge(`(\\d+(?:[.,]\\d)?)\\s*(?:${HOURS})(?:\\s*(\\d{1,2})\\s*(?:${MINUTES})?)?`)}`, match => {
    const hours = Number((match[1] ?? match[3])!.replace(",", "."));
    minutes = Math.round(hours * 60) + Number(match[2] ?? match[4] ?? 0);
    return minutes > 0;
  });
  if (!minutes) take(`(?<![\\d.,:])(\\d+)\\s*(?:${CJK_MINUTES})|${edge(`(\\d+)\\s*(?:${MINUTES})`)}`, match => { minutes = Number(match[1] ?? match[2]); return minutes > 0; });

  const tags: string[] = [];
  rest = rest.replace(/(^|\s)#([^\s#]+)/gu, (_, space: string, tag: string) => { if (tags.length < 6 && !tags.includes(tag)) tags.push(tag); return space; });
  // Particles left behind by the removed words ("明日15時に歯医者").
  const title = rest.replace(/\s+/g, " ").trim().replace(/^[にでから、,・\-–—:]+\s*|\s*[にで、,・\-–—:]+$/u, "").trim();
  return { title: title || text.trim(), date, time, minutes: Math.min(minutes, 1440), tags };
}

/** Big enough to offer splitting into steps: over an hour, or two or more "〜する" in one line. */
export function isBig(title: string, minutes: number): boolean {
  return minutes > 60 || (title.match(/する/g)?.length ?? 0) >= 2;
}

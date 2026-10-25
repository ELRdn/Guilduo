import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCapture } from "../interaction-lab/all-for-adhd/capture.ts";
import { iconChoices, iconFor } from "../interaction-lab/all-for-adhd/emoji.ts";

// 2026-10-18 is a Sunday.
const TODAY = "2026-10-18";
const TOMORROW = "2026-10-19";

test("capture lines read the same way in all nine locales", () => {
  const cases: [string, string, Partial<ReturnType<typeof parseCapture>>][] = [
    ["ja", "明日15時に歯医者 30分 #health", { title: "歯医者", date: TOMORROW, time: "15:00", minutes: 30, tags: ["health"] }],
    ["ja", "午後3時半 会議の準備 1時間", { title: "会議の準備", date: "", time: "15:30", minutes: 60 }],
    ["en", "dentist tomorrow 3pm 30m", { title: "dentist", date: TOMORROW, time: "15:00", minutes: 30 }],
    ["es", "dentista mañana 15:00 30 min", { title: "dentista", date: TOMORROW, time: "15:00", minutes: 30 }],
    ["pt-BR", "dentista amanhã 15:00 1h30", { title: "dentista", date: TOMORROW, time: "15:00", minutes: 90 }],
    ["fr", "dentiste demain 15:00 30 minutes", { title: "dentiste", date: TOMORROW, time: "15:00", minutes: 30 }],
    ["de", "Zahnarzt morgen 15:00 1 Stunde", { title: "Zahnarzt", date: TOMORROW, time: "15:00", minutes: 60 }],
    ["ko", "내일 오후 3시 치과 30분", { title: "치과", date: TOMORROW, time: "15:00", minutes: 30 }],
    ["zh-Hans", "明天下午3点 看牙医 30分钟", { title: "看牙医", date: TOMORROW, time: "15:00", minutes: 30 }],
    ["ru", "стоматолог завтра 15:00 30 мин", { title: "стоматолог", date: TOMORROW, time: "15:00", minutes: 30 }],
  ];
  for (const [locale, text, expected] of cases) {
    const parsed = parseCapture(text, TODAY, locale);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(parsed[key as keyof typeof parsed], value, `${locale}: ${text} → ${key}`);
  }
});

test("weekdays and numeric dates land on the coming day", () => {
  assert.equal(parseCapture("金曜 ゴミ出し", TODAY).date, "2026-10-23");
  assert.equal(parseCapture("call mom friday", TODAY, "en").date, "2026-10-23");
  assert.equal(parseCapture("日曜 掃除", TODAY).date, TODAY);
  assert.equal(parseCapture("10/26 締め切り", TODAY).date, "2026-10-26");
  assert.equal(parseCapture("26/10 rendu", TODAY, "fr").date, "2026-10-26");
  assert.equal(parseCapture("1/5 年賀状", TODAY).date, "2027-01-05");
});

test("unreadable text stays as the title", () => {
  assert.deepEqual(parseCapture("牛乳を買う", TODAY), { title: "牛乳を買う", date: "", time: "", minutes: 0, tags: [] });
  assert.equal(parseCapture("Read chapter 12", TODAY, "en").title, "Read chapter 12");
  assert.equal(parseCapture("monitor the deploy", TODAY, "en").date, "");
  assert.equal(parseCapture("明日", TODAY).title, "明日");
  assert.equal(parseCapture("25:00 の謎", TODAY).time, "");
});

test("titles get an emoji from the dictionary in any locale, or none", () => {
  assert.equal(iconFor("歯医者を予約する"), "🦷");
  assert.equal(iconFor("Call the dentist"), "🦷");
  assert.equal(iconFor("Water the plants"), "🌱");
  assert.equal(iconFor("이메일 답장"), "📧");
  assert.equal(iconFor("Пробежка в парке"), "🏃");
  assert.equal(iconFor("ほげほげ"), "");
  assert.deepEqual(iconChoices("散歩する", ["🎨"], 3), ["🚶", "🎨", "💊"]);
});

test("short English keywords only match whole words", () => {
  assert.equal(iconFor("Review the REST API"), "✅");
  assert.equal(iconFor("Take a nap"), "😴");
  assert.equal(iconFor("Pay bills"), "💰");
});

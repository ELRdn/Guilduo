import {
  closeCaptureSession,
  createCaptureSession,
  ensureDirectory,
  env,
  pause,
  saveScreenshot,
  screenshotPath,
} from "./cdp-capture.mts";

const outputDir = env("QF_LAB_SCREENSHOT_DIR");
await ensureDirectory(outputDir);

const session = await createCaptureSession();
const { client } = session;
try {
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await client.evaluate<void>('localStorage.removeItem("questforge-interaction-settings"); location.reload()');
  await pause();
  await client.evaluate<void>('document.querySelector("[data-view=\\"settings\\"]")?.click()');
  await pause();

  const capture = async (name: string): Promise<Record<string, unknown>> => {
    await saveScreenshot(client, screenshotPath(outputDir, name));
    return client.evaluate<Record<string, unknown>>(`(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return { width: Math.round(box.width), height: Math.round(box.height), fontSize: style.fontSize, lineHeight: style.lineHeight };
      };
      return {
        className: document.body.className,
        body: rect("body"),
        title: rect('[data-panel="today"] h2'),
        questTitle: rect(".quest-row .quest-summary strong"),
        questRow: rect(".quest-row"),
        treeNode: rect(".tree-node"),
        settingRow: rect(".setting-row"),
        settingButton: rect('button[data-setting="typeScale"]'),
      };
    })()`);
  };

  const captures: Record<string, unknown>[] = [];
  captures.push(await capture("settings-standard"));
  await client.evaluate<void>('document.querySelector("[data-setting=\\"typeScale\\"]")?.click()');
  await pause();
  captures.push(await capture("settings-large-type"));
  await client.evaluate<void>('document.querySelector("[data-setting=\\"density\\"]")?.click()');
  await pause();
  captures.push(await capture("settings-large-type-relaxed"));
  await client.evaluate<void>('document.querySelector("[data-setting=\\"typeScale\\"]")?.click()');
  await pause();
  captures.push(await capture("settings-relaxed"));
  await client.evaluate<void>('document.querySelector("[data-view=\\"today\\"]")?.click()');
  await pause();
  captures.push(await capture("today-relaxed"));

  await client.send("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 1, mobile: false });
  await pause();
  captures.push(await capture("today-mobile-relaxed"));
  console.log(JSON.stringify(captures, null, 2));
} finally {
  await closeCaptureSession(session);
}

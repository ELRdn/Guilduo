import {
  closeCaptureSession,
  createCaptureSession,
  ensureDirectory,
  pause,
  saveScreenshot,
  screenshotPath,
} from "./cdp-capture.mts";

const outputDir = process.env.QF_LAB_SCREENSHOT_DIR || ".qa-artifacts/detail-modes";
await ensureDirectory(outputDir);

const session = await createCaptureSession();
const { client } = session;
try {
  await client.send("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 1, mobile: false });
  await pause(250);

  const click = async (selector: string): Promise<void> => {
    await client.evaluate<void>(`document.querySelector(${JSON.stringify(selector)})?.click()`);
    await pause();
  };

  await click('[data-view="settings"]');
  await click('[data-detail-mode="sheet"]');
  await click('[data-view="today"]');
  await click("[data-quest]");
  await click("#selectedSheetToggle");
  await saveScreenshot(client, screenshotPath(outputDir, "quest-detail-bottom-sheet"));
  const sheet = await client.evaluate<Record<string, unknown>>(`(() => {
    const node = document.querySelector(".selected-panel");
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { mode: document.body.className, top: rect.top, bottom: rect.bottom, height: rect.height, transform: getComputedStyle(node).transform };
  })()`);

  await click('[data-view="settings"]');
  await click('[data-detail-mode="modal"]');
  await click('[data-view="today"]');
  await click("[data-quest]");
  await saveScreenshot(client, screenshotPath(outputDir, "quest-detail-popup"));
  const modal = await client.evaluate<Record<string, unknown>>(`(() => {
    const node = document.querySelector(".selected-panel");
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { mode: document.body.className, top: rect.top, bottom: rect.bottom, height: rect.height, transform: getComputedStyle(node).transform, backdropHidden: document.querySelector("#selectedBackdrop")?.hidden ?? true };
  })()`);

  console.log(JSON.stringify({ sheet, modal }, null, 2));
} finally {
  await closeCaptureSession(session);
}

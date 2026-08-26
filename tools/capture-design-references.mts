import {
  closeCaptureSession,
  createCaptureSession,
  ensureDirectory,
  env,
  pause,
  saveScreenshot,
  screenshotPath,
} from "../interaction-lab/cdp-capture.mts";

const outputDir = env("QF_DESIGN_REFERENCE_DIR", "design/reference");
await ensureDirectory(outputDir);

const session = await createCaptureSession();
const { client } = session;

async function setViewport(width: number, height: number): Promise<void> {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.evaluate<void>("location.reload()");
  await pause(500);
}

async function openView(view: string): Promise<void> {
  await client.evaluate<void>(`document.querySelector('[data-view="${view}"]')?.click()`);
  await pause(180);
}

try {
  await setViewport(1440, 900);
  for (const view of ["today", "battle", "party", "integrations", "profile", "settings"]) {
    await openView(view);
    await saveScreenshot(client, screenshotPath(outputDir, `${view}-desktop`));
  }
  await openView("tree");
  await saveScreenshot(client, screenshotPath(outputDir, "quest-tree-desktop"));

  await setViewport(390, 844);
  await openView("today");
  await saveScreenshot(client, screenshotPath(outputDir, "today-mobile"));
} finally {
  await closeCaptureSession(session);
}

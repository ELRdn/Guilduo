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
  await pause(250);

  for (const view of ["tree", "battle", "party", "integrations", "profile", "settings"]) {
    await client.evaluate<void>(`document.querySelector('[data-view="${view}"]')?.click()`);
    await pause(100);
    await saveScreenshot(client, screenshotPath(outputDir, `feedback-${view}`));
  }

  await client.send("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 1, mobile: false });
  await client.evaluate<void>('document.querySelector("#mobileMoreToggle")?.click()');
  await pause(100);
  await saveScreenshot(client, screenshotPath(outputDir, "feedback-mobile-more"));
} finally {
  await closeCaptureSession(session);
}

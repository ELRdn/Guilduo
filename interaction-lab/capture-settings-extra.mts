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
  await client.evaluate<void>('localStorage.setItem("questforge-interaction-settings", JSON.stringify({ typeScale: true, density: true, motion: true, sound: true })); location.reload()');
  await pause();

  for (const view of ["battle", "party", "integrations"]) {
    await client.evaluate<void>(`document.querySelector('[data-view="${view}"]')?.click()`);
    await pause();
    await saveScreenshot(client, screenshotPath(outputDir, `${view}-large-relaxed`));
  }

  await client.send("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 1, mobile: false });
  await client.evaluate<void>('document.querySelector("[data-view=\\"settings\\"]")?.click()');
  await pause();
  await saveScreenshot(client, screenshotPath(outputDir, "settings-mobile-large-relaxed"));
  await client.evaluate<void>('document.querySelector("[data-view=\\"today\\"]")?.click()');
  await pause();
  await saveScreenshot(client, screenshotPath(outputDir, "today-mobile-large-relaxed"));

  console.log("extra settings captures complete");
} finally {
  await closeCaptureSession(session);
}

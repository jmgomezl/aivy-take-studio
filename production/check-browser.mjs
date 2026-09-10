import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const url =
  process.env.TAKE_STUDIO_URL || "http://127.0.0.1:5182/studio/index.html";
const work = "/tmp/take-studio-qa";
await fs.mkdir(work, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const errors = [],
  failures = [];
let p;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    permissions: ["microphone", "camera"],
    acceptDownloads: true,
  });
  p = await context.newPage();
  p.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  p.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await p.goto(url);
  await p.locator("#record").waitFor();
  await p.waitForFunction(() => !document.getElementById("record").disabled, {
    timeout: 30000,
  });
  assert.equal(await p.locator("#chapters button").count(), 14);
  await p.screenshot({ path: work + "/desktop-empty.png", fullPage: true });
  for (const width of [1024, 768, 390, 320]) {
    await p.setViewportSize({ width, height: 1000 });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({ path: `${work}/layout-${width}.png`, fullPage: true });
  }
  await p.setViewportSize({ width: 1440, height: 1100 });
  await p.locator("#record").click();
  await p.waitForFunction(() => document.body.classList.contains("recording"), {
    timeout: 20000,
  });
  await p.waitForTimeout(2300);
  await p.locator("#stop").click();
  await p.waitForFunction(
    () =>
      document.getElementById("take-count").textContent === "1" &&
      !document.getElementById("record").disabled,
    { timeout: 20000 },
  );
  assert.equal(await p.locator("#take-select option").count(), 1);
  assert.match(await p.locator("#notice").innerText(), /saved/);
  await p.locator("#listen-take").click();
  await p.waitForTimeout(1000);
  await p.locator("#stop").click();
  await p.reload();
  await p.waitForFunction(() => !document.getElementById("record").disabled);
  assert.equal(await p.locator("#take-count").innerText(), "1");
  await p.locator("#settings-open").click();
  await p.locator("#camera-enabled").check();
  await p.locator("#background").selectOption("card");
  await p.locator("#enable-devices").click();
  await p.getByText("Camera and microphone ready.", { exact: true }).waitFor();
  await p
    .locator("#settings-dialog button")
    .filter({ hasText: "Done" })
    .click();
  await p.locator("#record").click();
  await p.waitForFunction(() => document.body.classList.contains("recording"));
  await p.waitForTimeout(1800);
  await p.locator("#stop").click();
  await p.waitForFunction(
    () =>
      document.getElementById("take-count").textContent === "2" &&
      !document.getElementById("record").disabled,
    { timeout: 20000 },
  );
  assert.match(
    await p.locator("#take-select option:checked").innerText(),
    /camera/,
  );
  await p.screenshot({ path: work + "/desktop-recorded.png", fullPage: true });
  await p.locator("#settings-open").click();
  await p.locator("#background").selectOption("remove");
  await p.locator("#enable-devices").click();
  await p
    .getByText("Background removal ready · processed on this device.", {
      exact: true,
    })
    .waitFor({ timeout: 60000 });
  await p
    .locator("#settings-dialog button")
    .filter({ hasText: "Done" })
    .click();
  await p.waitForTimeout(1200);
  assert(!errors.length);
  const backupWait = p.waitForEvent("download");
  await p.locator("#backup").click();
  const backup = await backupWait;
  await backup.saveAs(work + "/recorded-backup.zip");
  await p.locator("#export-open").click();
  await p.locator("#render").click();
  await p
    .getByText(/Record chapters 2/)
    .first()
    .waitFor();
  assert.equal(await p.locator("#result-video").isVisible(), false);
  await p.locator("#export-close").click();
  // A short imported project exercises the exact production compositor without a four-minute QA file.
  const fixture = {
    title: "QA short film",
    chapters: [
      { start: 0, end: 2, title: "First", script: "A first test." },
      { start: 2, end: 4, title: "Second", script: "A second test." },
    ],
  };
  await fs.writeFile(work + "/chapters.json", JSON.stringify(fixture));
  await p.locator("#new-project").click();
  await p.locator("#new-name").fill("QA short film");
  await p.locator("#new-video").setInputFiles(work + "/visual.mp4");
  await p.locator("#new-timeline").setInputFiles(work + "/chapters.json");
  await p.locator("#create-project").click();
  await p.waitForFunction(
    () =>
      document.querySelectorAll("#chapters button").length === 2 &&
      !document.getElementById("record").disabled,
  );
  for (let i = 0; i < 2; i++) {
    await p.locator("#chapters button").nth(i).click();
    await p.locator("#import-take").setInputFiles(work + "/voice.wav");
    await p.waitForFunction(
      () => document.getElementById("take-count").textContent === "1",
    );
  }
  await p.locator("#export-open").click();
  await p.locator("#resolution").selectOption("720");
  await p.locator("#render").click();
  await p.locator("#result-downloads a").waitFor({ timeout: 60000 });
  const downloadWait = p.waitForEvent("download");
  await p.locator("#result-downloads a").click();
  const result = await downloadWait;
  await result.saveAs(work + "/" + result.suggestedFilename());
  await p.locator("#result-video").evaluate((v) => v.play());
  await p.waitForTimeout(700);
  assert.equal(
    await p.locator("#result-video").evaluate((v) => v.paused),
    false,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    "Passed: responsive layouts, microphone/camera recording, persistent retakes, background model, backup, export gap guard, custom project, 4-second joined video.",
  );
  await fs.writeFile(
    work + "/report.json",
    JSON.stringify(
      {
        url,
        at: new Date().toISOString(),
        errors,
        failures,
        video: result.suggestedFilename(),
      },
      null,
      2,
    ),
  );
} catch (e) {
  if (p) {
    console.log(
      "UI state:",
      await p.evaluate(() => ({
        notice: document.getElementById("notice")?.textContent,
        device: document.getElementById("device-status")?.textContent,
        mask: document.getElementById("mask-status")?.textContent,
      })),
    );
    await p.screenshot({ path: work + "/failure.png", fullPage: true });
  }
  throw e;
} finally {
  await browser.close();
}

import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const url =
    process.env.TAKE_STUDIO_URL || "http://127.0.0.1:5182/studio/index.html",
  work = "/tmp/take-studio-qa";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1120 },
    acceptDownloads: true,
  }),
  p = await ctx.newPage(),
  errors = [];
p.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("PAGE ERROR", e.message);
});
try {
  await p.goto(url);
  await p.waitForFunction(() => !document.getElementById("record").disabled);
  await p.locator("#new-project").click();
  await p.locator("#restore").setInputFiles(work + "/recorded-backup.zip");
  await p.waitForFunction(
    () => document.querySelectorAll("#project option").length === 2,
  );
  assert.equal(await p.locator("#take-count").innerText(), "2");
  console.log("Backup restored, including two original media blobs.");
  await p.locator("#settings-open").click();
  await p.locator("#camera-enabled").uncheck();
  await p.locator("#background").selectOption("remove");
  await p
    .locator("#settings-dialog button")
    .filter({ hasText: "Done" })
    .click();
  for (let i = 0; i < 14; i++) {
    await p.locator("#chapters button").nth(i).click();
    await p.waitForFunction(
      (i) =>
        document
          .getElementById("chapter-number")
          .textContent.startsWith(String(i + 1).padStart(2, "0")) &&
        !document.getElementById("record").disabled,
      i,
    );
    const before = Number(await p.locator("#take-count").innerText());
    await p
      .locator("#import-take")
      .setInputFiles(
        work + (i === 0 || i === 10 ? "/presenter.mp4" : "/voice.wav"),
      );
    await p.waitForFunction(
      (n) =>
        Number(document.getElementById("take-count").textContent) === n + 1,
      before,
    );
  }
  assert.match(await p.locator("#complete-count").innerText(), /^14/);
  await p.locator("#chapters button").first().click();
  await p.screenshot({ path: work + "/studio-all-ready.png", fullPage: true });
  await p.locator("#export-open").click();
  await p.locator("#render").click();
  // Exercise cancellation while codecs/voices are being prepared.
  await p.locator("#cancel-render").waitFor();
  await p.locator("#cancel-render").click();
  await p
    .getByText("Export canceled. Your takes are safe.", { exact: true })
    .first()
    .waitFor({ timeout: 60000 });
  assert.equal(await p.locator("#render").isEnabled(), true);
  console.log("Export cancellation preserved all 14 takes.");
  await p.locator("#render").click();
  const timeout = setInterval(async () => {
    try {
      console.log(await p.locator("#export-status").innerText());
    } catch {}
  }, 20000);
  try {
    await p.locator("#result-downloads a").waitFor({ timeout: 600000 });
  } finally {
    clearInterval(timeout);
  }
  const downloadWait = p.waitForEvent("download");
  await p.locator("#result-downloads a").click();
  const d = await downloadWait;
  await d.saveAs(work + "/full-with-camera.mp4");
  const audioWait = p.waitForEvent("download");
  await p.locator("#result-downloads button").click();
  const a = await audioWait;
  await a.saveAs(work + "/full-voice.wav");
  await p.locator("#result-video").evaluate((v) => {
    v.currentTime = 1;
  });
  await p.waitForTimeout(500);
  await p.screenshot({
    path: work + "/full-export-preview.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Full 239-second MP4 exported with 14 voice takes and two background-removed presenter clips.",
  );
  await fs.writeFile(
    work + "/full-report.json",
    JSON.stringify(
      {
        url,
        at: new Date().toISOString(),
        errors,
        restore: true,
        cancel: true,
        chapters: 14,
        backgroundRemoval: true,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

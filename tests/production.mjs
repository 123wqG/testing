import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";
import assert from "node:assert/strict";
const root = resolve("dist"),
  prefix = "/study-workbench/";
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(prefix)) throw Error();
    const relative =
        decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html",
      file = resolve(root, relative);
    if (!file.startsWith(root)) throw Error();
    const content = await readFile(file);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      }[extname(file)] || "application/octet-stream",
    );
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((resolve) => server.listen(4188, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const c = await browser.newContext(),
    p = await c.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:4188/study-workbench/#settings");
  await p.locator("#theme").waitFor();
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.locator("#theme").waitFor();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await p.evaluate(async () => {
    const m = document.querySelector("link[rel=manifest]");
    return (await fetch(m.href)).json();
  });
  assert.equal(manifest.start_url, "./#today");
  assert.equal(manifest.icons.length, 2);
  await c.setOffline(true);
  await p.reload();
  await p.locator("#theme").waitFor();
  await p.locator('nav a[href="#today"]').click();
  await p.locator("#quick-task input").fill("离线本地任务");
  await p.locator("#quick-task button").click();
  await p.getByText("离线本地任务", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/production-report.json",
    JSON.stringify(
      {
        time: new Date().toISOString(),
        passed: [
          "Built static app under /study-workbench/ subpath",
          "Hash route reload",
          "Manifest and PNG icons",
          "Service worker activated",
          "Offline shell reload",
          "Offline IndexedDB writes",
        ],
        limitation:
          "Localhost Chromium test, not an installed iOS/Android app test",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS production subpath, hash routes, PWA, offline local writes",
  );
} finally {
  await browser.close();
  server.close();
}

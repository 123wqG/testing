import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const url = "https://study-test.supabase.co",
  userId = "11111111-1111-4111-8111-111111111111";
const db = Object.fromEntries(
  [
    "tasks",
    "daily_task_templates",
    "study_materials",
    "material_images",
    "study_sessions",
  ].map((t) => [t, []]),
);
const user = {
  id: userId,
  email: "tester@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const jwt = [
  { alg: "HS256", typ: "JWT" },
  {
    sub: userId,
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  "test",
]
  .map((v) =>
    Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString(
      "base64url",
    ),
  )
  .join(".");
const token = {
  access_token: jwt,
  refresh_token: "refresh-test",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user,
};
let rejectUpload = false,
  rejectRequests = false;
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function newClient() {
  const c = await browser.newContext();
  await c.addInitScript(
    ({ url }) => {
      localStorage.setItem(
        "study-cloud-config",
        JSON.stringify({ url, key: "sb_publishable_test" }),
      );
      localStorage.setItem("study-mode", "cloud");
    },
    { url },
  );
  await c.route(url + "/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      path = u.pathname,
      method = req.method();
    if (rejectRequests) return route.abort("internetdisconnected");
    let body;
    try {
      body = req.postDataJSON();
    } catch {}
    const reply = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (path.includes("/auth/v1/token")) return reply(token);
    if (path.includes("/auth/v1/user")) return reply(user);
    if (path.includes("/auth/v1/logout")) return route.fulfill({ status: 204 });
    if (path.includes("/storage/v1/object/sign/") && method === "POST")
      return reply({
        signedURL: path.replace("/storage/v1", "") + "?token=test",
      });
    if (path.includes("/storage/v1/object/sign/") && method === "GET")
      return route.fulfill({
        contentType: "image/png",
        body: await readFile("public/icon-192.png"),
      });
    if (path.includes("/storage/v1/object/"))
      return rejectUpload
        ? reply(
            {
              statusCode: "500",
              error: "test upload failure",
              message: "模拟上传失败",
            },
            500,
          )
        : reply({ Key: path });
    const table = path.split("/").pop();
    if (path.includes("/rpc/save_study_material")) {
      const m = body.p_material,
        i = db.study_materials.findIndex((r) => r.id === m.id);
      if (i < 0) db.study_materials.push(m);
      else db.study_materials[i] = m;
      db.material_images = db.material_images.filter(
        (r) => !body.p_deleted_ids.includes(r.id),
      );
      for (const image of body.p_images) {
        const ix = db.material_images.findIndex((r) => r.id === image.id);
        if (ix < 0) db.material_images.push(image);
        else db.material_images[ix] = image;
      }
      return reply(null);
    }
    if (db[table]) {
      if (method === "GET") return reply(db[table]);
      if (method === "POST") {
        for (const row of Array.isArray(body) ? body : [body]) {
          const ix = db[table].findIndex((r) => r.id === row.id);
          if (ix < 0) db[table].push(row);
          else db[table][ix] = row;
        }
        return reply(null, 201);
      }
    }
    return reply({ message: "unhandled " + path }, 400);
  });
  const p = await c.newPage();
  await p.goto("http://localhost:5178");
  await p.locator("#login [name=email]").fill(user.email);
  await p.locator("#login [name=password]").fill("test-password");
  await p.locator("#login button[type=submit]").click();
  await p.locator("#quick-task").waitFor();
  return { c, p };
}
const a = await newClient(),
  b = await newClient();
await a.p.locator("#quick-task input").fill("云端练习");
await a.p.locator("#quick-task button").click();
await a.p.getByText("云端练习", { exact: true }).waitFor();
await b.p.reload();
await b.p.getByText("云端练习", { exact: true }).waitFor();
await a.p.goto("http://localhost:5178/#library/" + encodeURIComponent("申论"));
await a.p.locator("[data-action=new-material]").first().click();
await a.p.locator("#material-form [name=title]").fill("申论云图片");
await a.p.locator("#image-files").setInputFiles("public/icon-192.png");
await a.p.getByText("已准备 1 张新图片", { exact: false }).waitFor();
rejectUpload = true;
await a.p.getByRole("button", { name: "保存资料", exact: true }).click();
await a.p
  .getByText("保存未完成，编辑内容已保留，请重试。", { exact: true })
  .waitFor();
assert.equal(db.study_materials.length, 0);
assert.equal(
  await a.p.locator("#material-form [name=title]").inputValue(),
  "申论云图片",
);
rejectUpload = false;
await a.p.getByRole("button", { name: "保存资料", exact: true }).click();
await a.p.locator("dialog").waitFor({ state: "hidden" });
assert.equal(db.study_materials.length, 1);
await b.p.goto("http://localhost:5178/#library/" + encodeURIComponent("申论"));
await b.p.reload();
await b.p.locator(".material-card").waitFor();
await b.p.waitForFunction(
  () => document.querySelector(".material-card img")?.naturalWidth > 0,
);
await a.p.goto("http://localhost:5178/#today");
rejectRequests = true;
await a.c.setOffline(true);
await a.p.locator("#quick-task input").fill("离线不应伪保存");
await a.p.locator("#quick-task button").click();
await a.p.locator("#toast.show").waitFor();
assert.equal(db.tasks.length, 1);
assert.equal(await a.p.locator(".task-row").count(), 1);
rejectRequests = false;
await a.c.setOffline(false);
await a.p.goto("http://localhost:5178/#settings");
await a.p.locator("[data-action=logout]").click();
await a.p.locator("#login").waitFor();
assert.equal(await a.p.locator(".task-row").count(), 0);
await writeFile(
  "test-results/cloud-contract-report.json",
  JSON.stringify(
    {
      time: new Date().toISOString(),
      passed: [
        "Password login and persisted session",
        "Two browser contexts read shared task on refresh",
        "Failed upload retains draft and publishes no metadata",
        "Retry stores material and image references",
        "Second context loads signed image",
        "Offline save does not fake success",
        "Logout clears visible private data",
      ],
      limitation:
        "Supabase HTTP endpoints simulated; real project credentials were not supplied",
    },
    null,
    2,
  ),
);
console.log(
  "PASS cloud adapter contract: login, two contexts, upload failure/retry, signed image, offline, logout",
);
await browser.close();

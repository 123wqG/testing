import "./styles.css";
import { LocalRepository } from "./data/local.js";
import {
  SupabaseRepository,
  connect,
  readConfig,
  validateConfig,
} from "./data/supabase.js";
import { Store } from "./store.js";
import {
  alive,
  clockText,
  dateKey,
  elapsed,
  id,
  now,
  shiftDate,
  taskSeconds,
  duration,
  validateMinutes,
} from "./core.js";
import { esc, icon, shell, today, library, history, settings } from "./ui.js";
import { prepareImage } from "./images.js";

const app = document.querySelector("#app"),
  dialog = document.querySelector("#dialog");
let store,
  client,
  route = "today",
  section = "",
  selectedDate = dateKey(),
  month = selectedDate.slice(0, 7),
  filter = {},
  busy = false,
  draft = null,
  viewer = null,
  toastTimeout;
let renderedDay = dateKey();
const urls = new Map();
const themeQuery = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const choice = localStorage.getItem("study-theme") || "light";
  document.documentElement.dataset.theme =
    choice === "system" ? (themeQuery.matches ? "dark" : "light") : choice;
}
applyTheme();
themeQuery.addEventListener("change", applyTheme);
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("show"), 4500);
}
function report(error) {
  console.error(error);
  const msg = error.message || "操作失败，请重试。";
  toast(msg);
  if (dialog.open) {
    let el = dialog.querySelector(".error-message");
    if (!el) {
      el = document.createElement("p");
      el.className = "error-message";
      el.setAttribute("role", "alert");
      dialog.append(el);
    }
    el.textContent = msg;
  }
  return msg;
}
async function run(action) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll("button")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    await action();
  } catch (e) {
    report(e);
  } finally {
    busy = false;
    buttons.forEach((b) => {
      if (b.isConnected) b.disabled = false;
    });
  }
}
function parseRoute() {
  const parts = location.hash.slice(1).split("/");
  route = ["today", "library", "history", "settings"].includes(parts[0])
    ? parts[0]
    : "today";
  try {
    section = decodeURIComponent(parts[1] || "");
  } catch {
    section = "";
  }
  if (!["行测", "申论"].includes(section)) section = "";
}
function render() {
  if (!store) return;
  parseRoute();
  const body =
    route === "today"
      ? today(store)
      : route === "library"
        ? library(store, section, filter)
        : route === "history"
          ? history(store, month, selectedDate)
          : settings(store);
  app.innerHTML = shell(route, body, store);
  if (route === "settings")
    document.querySelector("#theme").value =
      localStorage.getItem("study-theme") || "light";
  renderTimer();
  hydrateImages(app);
}
async function imageURL(path) {
  const cached = urls.get(path);
  if (cached && cached.expiry > Date.now()) return cached.url;
  if (cached?.url.startsWith("blob:")) URL.revokeObjectURL(cached.url);
  const url = await store.repo.imageURL(path);
  urls.set(path, { url, expiry: Date.now() + 50 * 60 * 1000 });
  return url;
}
async function hydrateImages(root) {
  for (const img of root.querySelectorAll("img[data-image]")) {
    const item = store.data.material_images.find(
      (i) => i.id === img.dataset.image,
    );
    if (!item) continue;
    try {
      const url = await imageURL(
        img.dataset.full ? item.path : item.thumbnail_path,
      );
      if (img.isConnected) img.src = url;
    } catch {
      img.alt = "图片加载失败，点击刷新数据后重试";
    }
  }
}
function clearUrls() {
  for (const { url } of urls.values())
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  urls.clear();
}
function renderTimer() {
  const slot = document.querySelector("#timer-slot");
  if (!slot) return;
  const t = store.timer;
  slot.innerHTML = t
    ? `<div class="timer-bar" role="region" aria-label="学习计时器"><span class="timer-title">${esc(t.title)}${t.started_at ? " · 专注中" : " · 已暂停"}</span><strong id="timer-value">${clockText(elapsed(t))}</strong><button data-action="${t.started_at ? "pause-timer" : "resume-timer"}">${t.started_at ? "暂停" : "继续"}</button><button class="end-timer" data-action="end-timer">结束并记录</button></div>`
    : "";
}
function cleanDraft() {
  if (draft) for (const item of draft.added) URL.revokeObjectURL(item.url);
  draft = null;
  viewer = null;
}
function closeDialog() {
  dialog.close();
  cleanDraft();
}
function openDialog(title, content) {
  dialog.innerHTML = `<div class="dialog-heading"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close-dialog" aria-label="关闭弹窗">×</button></div>${content}`;
  if (!dialog.open) dialog.showModal();
}
dialog.addEventListener("cancel", (e) => {
  if (busy) {
    e.preventDefault();
    return;
  }
  cleanDraft();
});
function taskDialog(taskId) {
  const t = store.task(taskId),
    rows = alive(store.data.tasks)
      .filter((x) => x.date === t.date)
      .sort((a, b) => a.position - b.position);
  openDialog(
    "编辑任务",
    `<form id="edit-task" data-id="${t.id}" class="form-stack"><label>任务名称<input name="title" required maxlength="180" value="${esc(t.title)}"></label><div class="form-grid"><label>预计时长（分钟）<input name="estimated_minutes" type="number" min="0" max="1440" step="1" value="${t.estimated_minutes || 0}"></label><label>手动补记（分钟）<input name="manual_minutes" type="number" min="0" max="1440" step="1" value="${t.manual_minutes || 0}"></label></div><p class="help">已计时 ${duration(taskSeconds({ ...t, manual_minutes: 0 }, store.data.study_sessions))}；总时长 = 手动补记 + 计时记录。计时记录按计时开始的日期统计。</p><label>备注<textarea name="note" maxlength="5000">${esc(t.note)}</textarea></label><p class="help">所属日期：${t.date} · 创建于 ${new Date(t.created_at).toLocaleString("zh-CN")}</p><div class="dialog-actions"><button type="button" class="danger" data-action="delete-task" data-id="${t.id}">删除</button>${rows.indexOf(t) > 0 ? `<button type="button" class="secondary" data-action="move-up" data-id="${t.id}">上移</button>` : ""}${!t.done ? `<button type="button" class="secondary" data-action="roll-task" data-id="${t.id}">顺延一天</button>` : ""}<button class="primary" type="submit">保存修改</button></div></form>`,
  );
}
function templateDialog(templateId) {
  const t = store.data.daily_task_templates.find(
    (t) => t.id === templateId,
  ) || { title: "", note: "", estimated_minutes: 0 };
  openDialog(
    templateId ? "编辑固定任务" : "添加固定任务",
    `<form id="template-form" data-id="${templateId || ""}" class="form-stack"><label>任务名称<input name="title" required maxlength="180" value="${esc(t.title)}" placeholder="例如：复习错题"></label><label>预计时长（分钟）<input name="estimated_minutes" type="number" min="0" max="1440" step="1" value="${t.estimated_minutes}"></label><label>备注<textarea name="note" maxlength="5000">${esc(t.note)}</textarea></label><p class="help">模板修改、关闭或删除不会改变已生成的任务。新模板立即加入今天。</p><div class="dialog-actions">${templateId ? `<button type="button" class="danger" data-action="delete-template" data-id="${templateId}">删除模板</button>` : ""}<button class="primary" type="submit">保存固定任务</button></div></form>`,
  );
}
function materialDialog(materialId) {
  const m = store.data.study_materials.find((m) => m.id === materialId) || {
    id: id(),
    section: section || "行测",
    title: "",
    note: "",
    tags: [],
    created_at: now(),
  };
  draft = {
    material: m,
    existing: store.data.material_images
      .filter((i) => i.material_id === m.id)
      .sort((a, b) => a.position - b.position),
    added: [],
    removed: [],
    reading: false,
  };
  openDialog(
    materialId ? "编辑资料" : "新增学习资料",
    `<form id="material-form" class="form-stack"><label>标题<input name="title" required maxlength="180" value="${esc(m.title)}" placeholder="给这次收获起个名字"></label><div class="form-grid"><label>板块<select name="section"><option ${m.section === "行测" ? "selected" : ""}>行测</option><option ${m.section === "申论" ? "selected" : ""}>申论</option></select></label><label>标签（逗号分隔）<input name="tags" maxlength="500" value="${esc(m.tags.join("，"))}" placeholder="例如：错题，增长率"></label></div><label>备注<textarea name="note" maxlength="20000" placeholder="记下思路，或提醒未来的自己…">${esc(m.note)}</textarea></label><div class="upload-zone"><div class="upload-actions"><button class="secondary" type="button" data-action="choose-images">${icon("plus")} 选择图片</button><button class="secondary" type="button" data-action="take-photo">拍照</button></div><p class="help">一次可选多张 · 每张最多 20MB<br>支持 JPG / PNG / WebP / GIF，保留原图</p><input hidden style="display:none" id="image-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple><input hidden style="display:none" id="camera-file" type="file" accept="image/*" capture="environment"><div id="upload-preview" class="upload-preview"></div></div><p id="upload-status" class="upload-status" aria-live="polite"></p><div class="dialog-actions"><button type="button" class="secondary" data-action="close-dialog">取消</button><button class="primary" type="submit">保存资料</button></div></form>`,
  );
  renderPreviews();
}
async function renderPreviews() {
  const el = document.querySelector("#upload-preview");
  if (!el || !draft) return;
  el.innerHTML =
    draft.existing
      .filter((i) => !draft.removed.includes(i.id))
      .map(
        (i) =>
          `<div class="preview-image"><img data-image="${i.id}" alt="已保存图片"><button type="button" data-action="remove-existing" data-id="${i.id}" aria-label="删除此图片">×</button></div>`,
      )
      .join("") +
    draft.added
      .map(
        (i, index) =>
          `<div class="preview-image"><img src="${i.url}" alt="待上传 ${esc(i.file.name)}"><button type="button" data-action="remove-added" data-index="${index}" aria-label="移除 ${esc(i.file.name)}">×</button></div>`,
      )
      .join("");
  await hydrateImages(el);
}
async function addFiles(files) {
  if (!draft) return;
  const current = draft;
  current.reading = true;
  const status = document.querySelector("#upload-status");
  try {
    for (const file of files) {
      if (draft !== current) return;
      status.textContent = `正在准备 ${file.name}…`;
      try {
        const item = await prepareImage(file);
        if (draft !== current) {
          URL.revokeObjectURL(item.url);
          return;
        }
        current.added.push(item);
      } catch (e) {
        report(e);
      }
    }
    if (draft === current) {
      await renderPreviews();
      status.textContent = `已准备 ${current.added.length} 张新图片，保存后写入${store.mode === "cloud" ? "云端" : "本地"}。`;
    }
  } finally {
    current.reading = false;
  }
}
async function saveMaterial(form) {
  if (!draft || draft.reading) throw new Error("图片正在准备，请稍后保存。");
  const values = Object.fromEntries(new FormData(form));
  const m = {
    ...draft.material,
    user_id: store.user.id,
    title: values.title.trim(),
    section: values.section,
    note: values.note,
    tags: [
      ...new Set(
        values.tags
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
    updated_at: now(),
    deleted_at: null,
  };
  if (!m.title) throw new Error("请填写资料标题");
  const status = document.querySelector("#upload-status"),
    addedRows = [];
  try {
    for (let index = 0; index < draft.added.length; index++) {
      const item = draft.added[index];
      // Stable IDs and upload flags make retries safe when a network response is lost.
      if (!item.row) {
        const imageId = id(),
          base = `${store.user.id}/${m.id}/${imageId}`;
        item.row = {
          id: imageId,
          user_id: store.user.id,
          material_id: m.id,
          path: `${base}/original`,
          thumbnail_path: `${base}/thumb.webp`,
          position: draft.existing.length + index,
          created_at: now(),
        };
      }
      status.textContent = `正在保存图片 ${index + 1} / ${draft.added.length}…`;
      if (!item.originalUploaded) {
        await store.repo.upload(item.row.path, item.file);
        item.originalUploaded = true;
      }
      if (!item.thumbnailUploaded) {
        await store.repo.upload(item.row.thumbnail_path, item.thumbnail);
        item.thumbnailUploaded = true;
      }
      addedRows.push(item.row);
    }
    status.textContent = "正在保存资料…";
    const retained = draft.existing.filter(
        (i) => !draft.removed.includes(i.id),
      ),
      deleted = draft.existing.filter((i) => draft.removed.includes(i.id));
    await store.repo.saveMaterial(
      m,
      [...retained, ...addedRows],
      draft.removed,
    );
    try {
      await store.repo.deleteFiles(
        deleted.flatMap((i) => [i.path, i.thumbnail_path]),
      );
    } catch {
      toast("资料已保存，旧图片清理失败，可稍后在存储中清理。");
    }
    closeDialog();
    await store.load();
    render();
    toast("资料已保存");
  } catch (e) {
    // Do not delete uploaded objects: the metadata transaction may have committed even if its response was lost.
    if (status.isConnected)
      status.textContent = "保存未完成，编辑内容已保留，请重试。";
    throw e;
  }
}

function viewMaterial(materialId) {
  const m = store.data.study_materials.find(
    (m) => m.id === materialId && !m.deleted_at,
  );
  if (!m) throw new Error("资料不存在，请刷新。");
  const images = store.data.material_images
    .filter((i) => i.material_id === m.id)
    .sort((a, b) => a.position - b.position);
  openDialog(
    m.title,
    `<p class="help">${esc(m.section)} · ${new Date(m.created_at).toLocaleString("zh-CN")}</p><div class="tags">${m.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div><p class="details-note">${esc(m.note || "暂无备注")}</p><div class="detail-images">${images.map((i, index) => `<button data-action="view-image" data-id="${m.id}" data-index="${index}" aria-label="放大图片 ${index + 1}"><img data-image="${i.id}" data-full="1" alt="${esc(m.title)} 图片 ${index + 1}" loading="lazy"></button>`).join("")}</div><div class="dialog-actions"><button class="danger" data-action="delete-material" data-id="${m.id}">删除资料</button><button class="primary" data-action="edit-material" data-id="${m.id}">编辑资料</button></div>`,
  );
  hydrateImages(dialog);
}
async function showViewer(materialId, index) {
  const images = store.data.material_images
    .filter((i) => i.material_id === materialId)
    .sort((a, b) => a.position - b.position);
  index = (index + images.length) % images.length;
  viewer = { materialId, index };
  openDialog(
    "图片查看",
    `<div class="viewer"><img id="full-image" alt="原图 ${index + 1}"><div class="viewer-controls"><button data-action="prev-image" aria-label="上一张">←</button><span>${index + 1} / ${images.length}</span><button data-action="next-image" aria-label="下一张">→</button></div><button class="quiet" data-action="back-material" data-id="${materialId}">返回资料详情</button><p class="help">可使用左右方向键切换；手机可双指缩放。</p><a id="original-link" class="quiet" target="_blank" rel="noopener">在新窗口打开原图</a></div>`,
  );
  const url = await imageURL(images[index].path);
  if (viewer?.materialId === materialId && viewer.index === index) {
    document.querySelector("#full-image").src = url;
    document.querySelector("#original-link").href = url;
  }
}
async function refresh() {
  try {
    await store.load();
    clearUrls();
    render();
  } catch (e) {
    store.status = "同步失败 · 点击重试";
    render();
    throw e;
  }
}
function configForm() {
  openDialog(
    "连接个人云端",
    `<form id="cloud-config" class="form-stack"><p class="help">先按项目中的《使用说明》创建 Supabase 项目、执行数据库脚本并创建个人账号。这里只需要允许公开使用的项目 URL 与 publishable / anon key。</p><label>项目 URL<input name="url" type="url" required placeholder="https://你的项目.supabase.co" value="${esc(readConfig().url)}"></label><label>Publishable / anon key<input name="key" type="text" required autocomplete="off" value="${esc(readConfig().key)}"></label><p class="help">配置只保存在当前浏览器。请勿输入 service_role 或 secret key。</p><div class="dialog-actions"><button class="primary" type="submit">保存并前往登录</button></div></form>`,
  );
}
function loginScreen() {
  app.innerHTML = `<div class="login-wrap"><span class="brand-icon">${icon("book")}</span><h1>回到你的学习空间。</h1><p class="subtitle">登录个人账号，让电脑和手机保持同步。</p><form id="login" class="form-stack"><label>邮箱<input name="email" type="email" autocomplete="username" required placeholder="你的邮箱"></label><label>密码<input name="password" type="password" autocomplete="current-password" required minlength="6" placeholder="输入密码"></label><p id="login-error" class="error-message" role="alert"></p><button type="submit" class="primary">登录</button></form><div class="notice">这里没有开放注册。请在 Supabase 控制台创建你的个人账号。</div><button class="quiet" data-action="local-mode">进入本地验收模式</button><button class="quiet" data-action="configure">修改连接配置</button></div>`;
}
async function enterLocal() {
  clearUrls();
  localStorage.setItem("study-mode", "local");
  store = new Store(new LocalRepository(), { configured: !!readConfig().url });
  await store.load();
  render();
}
async function enterCloud(session) {
  clearUrls();
  localStorage.setItem("study-mode", "cloud");
  store = new Store(new SupabaseRepository(client), {
    mode: "cloud",
    user: session.user,
    configured: true,
  });
  await store.load();
  render();
}
async function boot() {
  app.innerHTML = '<div class="login-wrap"><p>正在打开你的工作台…</p></div>';
  const config = readConfig();
  if (config.url && config.key) {
    try {
      client = connect(config);
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (localStorage.getItem("study-mode") !== "local") {
        if (data.session) {
          await enterCloud(data.session);
          return;
        }
        loginScreen();
        return;
      }
    } catch (e) {
      app.innerHTML = `<div class="login-wrap"><h1>暂时无法连接云端</h1><p class="error-message">${esc(e.message)}</p><button class="primary" data-action="reload">重新连接</button><button class="secondary" data-action="configure">检查配置</button><button class="quiet" data-action="local-mode">进入本地验收模式</button></div>`;
      return;
    }
  }
  await enterLocal();
}

document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  run(async () => {
    if (form.id === "quick-task") {
      await store.addTask(form.elements.title.value);
      render();
      document.querySelector("#quick-task input")?.focus();
    } else if (form.id === "edit-task") {
      const values = Object.fromEntries(new FormData(form));
      await store.editTask(form.dataset.id, values);
      closeDialog();
      render();
      toast("任务已更新");
    } else if (form.id === "template-form") {
      const values = Object.fromEntries(new FormData(form));
      values.title = values.title.trim();
      if (!values.title) throw new Error("请填写任务名称");
      await store.saveTemplate(values, form.dataset.id || undefined);
      closeDialog();
      render();
      toast("固定任务已保存");
    } else if (form.id === "material-form") await saveMaterial(form);
    else if (form.id === "cloud-config") {
      const values = Object.fromEntries(new FormData(form));
      values.url = values.url.trim().replace(/\/$/, "");
      values.key = values.key.trim();
      validateConfig(values);
      localStorage.setItem("study-cloud-config", JSON.stringify(values));
      closeDialog();
      client = connect(readConfig());
      loginScreen();
    } else if (form.id === "login") {
      try {
        const values = Object.fromEntries(new FormData(form));
        const { data, error } = await client.auth.signInWithPassword(values);
        if (error) throw error;
        await enterCloud(data.session);
      } catch (e) {
        const el = document.querySelector("#login-error");
        if (el) el.textContent = "登录或加载失败：" + e.message;
        throw e;
      }
    }
  });
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id: targetId, index } = button.dataset;
  if (action === "choose-images") {
    document.querySelector("#image-files").click();
    return;
  }
  if (action === "take-photo") {
    document.querySelector("#camera-file").click();
    return;
  }
  run(async () => {
    switch (action) {
      case "close-dialog":
        closeDialog();
        break;
      case "toggle":
        await store.toggle(targetId);
        render();
        break;
      case "edit-task":
        taskDialog(targetId);
        break;
      case "delete-task":
        if (confirm("删除这项任务？已记录的计时时长仍保留在历史统计中。")) {
          await store.deleteTask(targetId);
          closeDialog();
          render();
        }
        break;
      case "roll-task":
        await store.roll([targetId]);
        closeDialog();
        render();
        toast("已顺延一天");
        break;
      case "roll-all": {
        const ids = alive(store.data.tasks)
          .filter((t) => t.date === dateKey() && !t.done)
          .map((t) => t.id);
        if (!ids.length) {
          toast("没有需要顺延的任务");
          break;
        }
        if (confirm(`将 ${ids.length} 项未完成任务移到明天？`)) {
          await store.roll(ids);
          render();
          toast("未完成任务已移到明天");
        }
        break;
      }
      case "move-up": {
        const task = store.task(targetId),
          rows = alive(store.data.tasks)
            .filter((t) => t.date === task.date)
            .sort((a, b) => a.position - b.position),
          i = rows.findIndex((t) => t.id === targetId);
        if (i > 0) await store.reorder(targetId, rows[i - 1].id);
        closeDialog();
        render();
        break;
      }
      case "new-template":
        templateDialog();
        break;
      case "edit-template":
        templateDialog(targetId);
        break;
      case "toggle-template": {
        const t = store.data.daily_task_templates.find(
          (t) => t.id === targetId,
        );
        await store.saveTemplate({ enabled: !t.enabled }, targetId);
        render();
        break;
      }
      case "delete-template":
        if (confirm("删除固定任务模板？已经生成的每日任务会保留。")) {
          await store.saveTemplate(
            { deleted_at: now(), enabled: false },
            targetId,
          );
          closeDialog();
          render();
        }
        break;
      case "timer":
        store.startTimer(targetId);
        renderTimer();
        break;
      case "pause-timer":
        store.pauseTimer();
        renderTimer();
        break;
      case "resume-timer":
        store.startTimer(store.timer.task_id);
        renderTimer();
        break;
      case "end-timer":
        await store.finishTimer();
        render();
        toast("学习时长已记录");
        break;
      case "new-material":
        materialDialog();
        break;
      case "edit-material":
        materialDialog(targetId);
        break;
      case "view-material":
        viewMaterial(targetId);
        break;
      case "remove-added":
        URL.revokeObjectURL(draft.added[+index].url);
        draft.added.splice(+index, 1);
        await renderPreviews();
        break;
      case "remove-existing":
        draft.removed.push(targetId);
        await renderPreviews();
        break;
      case "delete-material":
        if (confirm("删除这条资料及其全部图片？此操作不可撤销。")) {
          await store.deleteMaterial(targetId);
          closeDialog();
          render();
          toast("资料已删除");
        }
        break;
      case "view-image":
        await showViewer(targetId, +index);
        break;
      case "next-image":
        await showViewer(viewer.materialId, viewer.index + 1);
        break;
      case "prev-image":
        await showViewer(viewer.materialId, viewer.index - 1);
        break;
      case "back-material":
        viewer = null;
        viewMaterial(targetId);
        break;
      case "select-date":
        selectedDate = button.dataset.date;
        render();
        break;
      case "prev-month":
      case "next-month": {
        const d = new Date(month + "-01T12:00:00");
        d.setMonth(d.getMonth() + (action === "next-month" ? 1 : -1));
        month = dateKey(d).slice(0, 7);
        render();
        break;
      }
      case "refresh":
        await refresh();
        toast(store.mode === "cloud" ? "已读取最新云端数据" : "本地数据已刷新");
        break;
      case "login-screen":
        if (store.timer) {
          toast("请先结束当前计时，再切换空间。");
          break;
        }
        if (readConfig().url && readConfig().key) {
          client ??= connect(readConfig());
          loginScreen();
        } else configForm();
        break;
      case "configure":
        configForm();
        break;
      case "local-mode":
        await enterLocal();
        break;
      case "reload":
        location.reload();
        break;
      case "logout":
        if (store.timer) {
          toast("请先结束并保存计时，再退出登录。");
          break;
        }
        await store.repo.logout();
        store = null;
        clearUrls();
        loginScreen();
        break;
      case "export": {
        const blob = new Blob(
            [
              JSON.stringify(
                { exported_at: now(), mode: store.mode, data: store.data },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
          url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = `备考记录-${dateKey()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("已导出文字记录，不包含图片文件");
        break;
      }
    }
  });
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.id === "theme") {
    localStorage.setItem("study-theme", el.value);
    applyTheme();
  }
  if (el.id === "tag-filter") {
    filter.tag = el.value;
    render();
  }
  if (el.id === "sort-filter") {
    filter.sort = el.value;
    render();
  }
  if (["image-files", "camera-file"].includes(el.id)) {
    const files = [...el.files];
    el.value = "";
    run(() => addFiles(files));
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    const input = event.target,
      pos = input.selectionStart;
    filter.q = input.value;
    render();
    const next = document.querySelector("#search");
    next.focus();
    try {
      next.setSelectionRange(pos, pos);
    } catch {}
  }
});
let dragged;
document.addEventListener("dragstart", (e) => {
  const row = e.target.closest('.task-row[draggable="true"]');
  if (row) {
    dragged = row.dataset.id;
    e.dataTransfer.setData("text/plain", dragged);
    e.dataTransfer.effectAllowed = "move";
  }
});
document.addEventListener("dragover", (e) => {
  if (dragged && e.target.closest(".task-row")) e.preventDefault();
});
document.addEventListener("drop", (e) => {
  const row = e.target.closest(".task-row");
  if (dragged && row) {
    e.preventDefault();
    const source = dragged;
    dragged = null;
    run(async () => {
      await store.reorder(source, row.dataset.id);
      render();
    });
  }
});
document.addEventListener("dragend", () => (dragged = null));
document.addEventListener("keydown", (e) => {
  if (viewer && dialog.open && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    run(() =>
      showViewer(
        viewer.materialId,
        viewer.index + (e.key === "ArrowRight" ? 1 : -1),
      ),
    );
  }
});
window.addEventListener("hashchange", () => {
  if (dialog.open && !busy) closeDialog();
  filter = {};
  render();
});
window.addEventListener("focus", () => {
  if (store && !busy && !dialog.open) run(refresh);
});
window.addEventListener("online", () => {
  if (store && !busy && !dialog.open) run(refresh);
});
window.addEventListener("offline", () => {
  if (store?.mode === "cloud") {
    store.status = "离线 · 无法云端保存";
    render();
  }
});
window.addEventListener("storage", (e) => {
  if (store && e.key === store.timerKey) {
    try {
      store.timer = JSON.parse(e.newValue) || null;
    } catch {}
    renderTimer();
  }
});
setInterval(() => {
  const el = document.querySelector("#timer-value");
  if (el && store?.timer) el.textContent = clockText(elapsed(store.timer));
  if (store && dateKey() !== renderedDay && !busy && !dialog.open) {
    renderedDay = dateKey();
    run(refresh);
  }
}, 1000);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(console.warn),
  );
boot().catch(report);

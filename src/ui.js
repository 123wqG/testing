import {
  alive,
  dateKey,
  prettyDate,
  duration,
  taskSeconds,
  dayStats,
  streak,
  shiftDate,
} from "./core.js";
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  today: "M4 5h16v15H4z M8 3v4m8-4v4M4 10h16m-12 4h3m2 0h3",
  library: "M4 4h6v16H4z M14 4l5-1 3 16-5 1z",
  history: "M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  arrow: "m9 5 7 7-7 7",
  plus: "M12 5v14M5 12h14",
  play: "m8 5 11 7-11 7z",
  edit: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z",
  book: "M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2v15",
  check: "m5 12 4 4L19 6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  cloud: "M6 18a5 5 0 1 1 1-10 6 6 0 0 1 11 1 4 4 0 0 1 0 9H6",
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(
    paths[name] || paths.book
  )
    .split("||")
    .map((d) => `<path d="${d}"/>`)
    .join("")}</svg>`;
export function shell(route, body, store) {
  return `<aside class="sidebar"><a class="brand" href="#today"><span class="brand-icon">${icon("book")}</span><span>备考工作台<small>把每一天，慢慢积累。</small></span></a><nav aria-label="主导航">${[
    ["today", "今日"],
    ["library", "资料库"],
    ["history", "历史"],
    ["settings", "设置"],
  ]
    .map(
      ([key, name]) =>
        `<a href="#${key}" class="nav-item ${route === key ? "active" : ""}" ${route === key ? 'aria-current="page"' : ""}>${icon(key)}<span>${name}</span></a>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-note"><span class="status-dot"></span>${store.mode === "cloud" ? "个人云端空间" : "本地验收空间"}<small>${store.mode === "cloud" ? "学习记录，只属于你。" : "数据保存在此浏览器"}</small></div></aside><main id="main"><div class="topbar"><span>我的学习空间</span><button class="quiet sync-label" data-action="refresh">${icon("cloud")}<span>${esc(store.status)}</span></button></div>${body}<footer>不必一步到位，今天继续往前一点。</footer></main><div id="timer-slot"></div>`;
}
export function taskList(store, date, editable = true) {
  const tasks = alive(store.data.tasks)
    .filter((t) => t.date === date)
    .sort((a, b) => a.position - b.position);
  return `<div class="task-list">${tasks.length ? tasks.map((t, i) => `<article class="task-row ${t.done ? "completed" : ""}" draggable="${editable}" data-id="${t.id}"><button class="checkbox ${t.done ? "checked" : ""}" data-action="toggle" data-id="${t.id}" aria-label="${t.done ? "取消完成" : "完成"} ${esc(t.title)}" aria-pressed="${t.done}">${t.done ? icon("check") : ""}</button><button class="task-content" data-action="edit-task" data-id="${t.id}"><span class="task-title">${esc(t.title)}</span><span class="task-meta">${t.template_id ? "<span>每日固定</span>" : ""}${t.note ? `<span>${esc(t.note)}</span>` : ""}${t.estimated_minutes ? `<span>预计 ${t.estimated_minutes}min</span>` : ""}</span></button><span class="task-time">${taskSeconds(t, store.data.study_sessions) ? duration(taskSeconds(t, store.data.study_sessions)) : "—"}</span><button class="icon-btn" data-action="timer" data-id="${t.id}" aria-label="计时 ${esc(t.title)}">${icon("play")}</button><button class="icon-btn" data-action="edit-task" data-id="${t.id}" aria-label="编辑 ${esc(t.title)}">${icon("edit")}</button></article>`).join("") : `<div class="empty"><span class="empty-icon">${icon("today")}</span><h3>${date === dateKey() ? "今天，从一件小事开始" : "这一天还没有任务"}</h3><p>写下要学的内容，完成一项就轻轻勾掉。</p></div>`}</div>`;
}
export function sectionLinks(store) {
  return `<div class="section-links">${["行测", "申论"]
    .map((s, i) => {
      const ms = alive(store.data.study_materials).filter(
        (m) => m.section === s,
      );
      return `<a href="#library/${encodeURIComponent(s)}" class="section-link"><div class="subject-mark">${i ? "论" : "测"}</div><div><h3>${s}资料</h3><p>${ms.length ? `已收藏 ${ms.length} 条资料` : "把值得回看的知识留在这里"}</p></div>${icon("arrow")}</a>`;
    })
    .join("")}</div>`;
}
export function today(store) {
  const date = dateKey(),
    s = dayStats(store.data, date);
  return `<header class="page-heading"><div><p class="eyebrow">${prettyDate(date)}</p><h1>今天继续往前一点。</h1><p class="subtitle">专注眼前的一件事，积累看得见的进步。</p></div><div class="date-stamp"><strong>${new Date().getDate()}</strong><span>${new Date().getMonth() + 1} 月</span></div></header><div class="daily-summary"><span>今日完成 <strong>${s.done}<i> / ${s.total}</i></strong></span><span>累计学习 <strong>${duration(s.seconds)}</strong></span><span>连续记录 <strong>${streak(store.data)} <i>天</i></strong></span></div><section class="tasks-section"><div class="section-heading"><h2>今日任务 <span class="count">${s.total}</span></h2><div class="row-actions"><button class="quiet" data-action="roll-all">顺延未完成</button><a class="quiet" href="#settings">固定任务</a></div></div><form id="quick-task" class="quick-add">${icon("plus")}<input name="title" required maxlength="180" placeholder="添加今日任务，按 Enter 保存" aria-label="添加今日任务" autocomplete="off"><button type="submit">添加</button></form>${taskList(store, date)}<div class="task-foot"><span>${s.total ? `${s.done} / ${s.total} 已完成` : "为今天留一点清晰的安排"}</span><div class="progress-track"><span style="width:${s.total ? (s.done / s.total) * 100 : 0}%"></span></div></div></section><section class="quick-library"><div class="section-heading"><h2>学习资料</h2><a class="quiet" href="#library">查看全部 ${icon("arrow")}</a></div>${sectionLinks(store)}</section>`;
}
export function library(store, section, filter = {}) {
  let rows = alive(store.data.study_materials).filter(
    (m) => m.section === section,
  );
  const tags = [...new Set(rows.flatMap((m) => m.tags || []))];
  const q = (filter.q || "").toLowerCase();
  rows = rows
    .filter(
      (m) =>
        (m.title + " " + m.note).toLowerCase().includes(q) &&
        (!filter.tag || (m.tags || []).includes(filter.tag)),
    )
    .sort((a, b) =>
      filter.sort === "old"
        ? a.created_at.localeCompare(b.created_at)
        : b.created_at.localeCompare(a.created_at),
    );
  return `<header class="page-heading"><div><p class="eyebrow">让知识有处可寻</p><h1>学习资料库</h1><p class="subtitle">收好当下的理解，留给下一次复习。</p></div>${section ? `<button class="primary" data-action="new-material">${icon("plus")} 新增资料</button>` : ""}</header>${
    !section
      ? sectionLinks(store) +
        `<div class="library-intro">${icon("book")}<p>选择一个板块，开始整理你的截图与笔记。<br>支持多图上传、标签整理和全文备注搜索。</p></div>`
      : `<div class="tabs"><a class="${section === "行测" ? "selected" : ""}" href="#library/${encodeURIComponent("行测")}">行测</a><a class="${section === "申论" ? "selected" : ""}" href="#library/${encodeURIComponent("申论")}">申论</a></div><div class="filters"><input id="search" type="search" placeholder="搜索标题或备注" aria-label="搜索标题或备注" value="${esc(filter.q || "")}"><select id="tag-filter" aria-label="标签筛选"><option value="">全部标签</option>${tags.map((t) => `<option ${filter.tag === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><select id="sort-filter" aria-label="排序"><option value="new">最新在前</option><option value="old" ${filter.sort === "old" ? "selected" : ""}>最早在前</option></select></div><p class="result-count">${rows.length} 条资料</p><div class="material-grid">${rows
          .map((m) => {
            const images = store.data.material_images
              .filter((i) => i.material_id === m.id)
              .sort((a, b) => a.position - b.position);
            return `<button class="material-card" data-action="view-material" data-id="${m.id}">${images.length ? `<div class="cover"><img data-image="${images[0].id}" alt="${esc(m.title)}" loading="lazy"><span>${images.length} 张图片</span></div>` : `<div class="cover text-cover">${icon("book")}<span>文字笔记</span></div>`}<div class="material-info"><h3>${esc(m.title)}</h3><p>${esc(m.note || "暂无备注")}</p><div class="tags">${(m.tags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div><small>${new Date(m.created_at).toLocaleDateString("zh-CN")}</small></div></button>`;
          })
          .join(
            "",
          )}</div>${rows.length ? "" : `<div class="empty"><span class="empty-icon">${icon("book")}</span><h3>${q || filter.tag ? "没有找到匹配的资料" : "留住一个值得复习的知识点"}</h3><p>${q || filter.tag ? "试试其他关键词或标签。" : "课堂截图、解题思路，都可以收藏在这里。"}</p><button class="primary" data-action="new-material">添加第一条资料</button></div>`}`
  }`;
}
export function history(store, month, selected) {
  const d = new Date(month + "-01T12:00:00"),
    year = d.getFullYear(),
    mon = d.getMonth(),
    offset = (d.getDay() + 6) % 7,
    days = new Date(year, mon + 1, 0).getDate(),
    s = dayStats(store.data, selected);
  const todayDate = dateKey(),
    weekday = (new Date().getDay() + 6) % 7,
    monday = shiftDate(todayDate, -weekday);
  let seconds = 0,
    done = 0;
  for (let i = 0; i < 7; i++) {
    const v = dayStats(store.data, shiftDate(monday, i));
    seconds += v.seconds;
    done += v.done;
  }
  return `<header class="page-heading"><div><p class="eyebrow">每一步，都算数</p><h1>学习的足迹</h1><p class="subtitle">本周已学习 ${duration(seconds)}，完成 ${done} 项任务。</p></div></header><div class="history-layout"><section class="calendar"><div class="section-heading"><button class="icon-btn" data-action="prev-month" aria-label="上个月">‹</button><h2>${year} 年 ${mon + 1} 月</h2><button class="icon-btn" data-action="next-month" aria-label="下个月">›</button></div><div class="calendar-grid">${["一", "二", "三", "四", "五", "六", "日"].map((w) => `<span class="weekday">${w}</span>`).join("")}${"<span></span>".repeat(offset)}${Array.from(
    { length: days },
    (_, i) => {
      const key = `${month}-${String(i + 1).padStart(2, "0")}`,
        s = dayStats(store.data, key);
      return `<button class="calendar-day ${key === selected ? "selected" : ""} ${key === todayDate ? "is-today" : ""}" data-action="select-date" data-date="${key}" aria-label="${key}${s.total || s.seconds ? " 有记录" : ""}" aria-pressed="${key === selected}">${i + 1}${s.total || s.seconds ? "<i></i>" : ""}</button>`;
    },
  ).join(
    "",
  )}</div><p class="calendar-hint"><span class="status-dot"></span>有学习记录的日子</p></section><section class="history-tasks"><div class="section-heading"><h2>${prettyDate(selected)}</h2></div><p class="subtitle">${s.done} / ${s.total} 项完成 · 学习 ${duration(s.seconds)}</p>${taskList(store, selected, false)}</section></div>`;
}
export function settings(store) {
  return `<header class="page-heading"><div><p class="eyebrow">按照自己的节奏</p><h1>工作台设置</h1><p class="subtitle">把重复的安排交给模板，把时间留给学习。</p></div></header><section class="settings-section"><div class="section-heading"><div><h2>固定每日任务</h2><p class="subtitle">开启后每天生成一份独立任务，不影响历史记录。</p></div><button class="primary" data-action="new-template">${icon("plus")} 添加</button></div><div class="template-list">${
    alive(store.data.daily_task_templates)
      .map(
        (t) =>
          `<div class="template-row"><button class="switch ${t.enabled ? "on" : ""}" data-action="toggle-template" data-id="${t.id}" role="switch" aria-checked="${t.enabled}" aria-label="启用 ${esc(t.title)}"><span></span></button><button class="template-title" data-action="edit-template" data-id="${t.id}">${esc(t.title)}<small>${t.estimated_minutes ? `预计 ${t.estimated_minutes}min` : "未设置预计时长"}</small></button><button class="quiet" data-action="edit-template" data-id="${t.id}">编辑</button></div>`,
      )
      .join("") ||
    '<p class="muted">尚未设置固定任务。添加你每天都会学习的内容。</p>'
  }</div></section><section class="settings-section"><h2>外观</h2><div class="setting-row"><span>显示模式</span><select id="theme" aria-label="显示模式"><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></div></section><section class="settings-section"><h2>账号与同步</h2><div class="setting-row"><span>${store.mode === "cloud" ? esc(store.user.email) : "本地验收模式"}<small>${store.mode === "cloud" ? "数据库与图片使用个人云端空间" : "任务和图片仅保存在当前浏览器，尚未云端同步"}</small></span><span class="badge">${store.mode === "cloud" ? "已登录" : "未连接"}</span></div><div class="setting-row"><span>同步状态<small>${esc(store.status)}</small></span><button class="secondary" data-action="refresh">刷新数据</button></div>${store.mode === "cloud" ? '<button class="secondary" data-action="logout">退出登录</button>' : `<button class="primary" data-action="login-screen">${store.configured ? "登录云端账号" : "配置并登录 Supabase"}</button><p class="help">本地验收数据与云端账号分开保存，不会自动上传。连接后使用云端数据。</p>`}</section><section class="settings-section"><h2>本地与安装</h2><p class="help">可使用浏览器的“添加到主屏幕”。基础离线打开需在 HTTPS 或 localhost 下使用；云模式离线时不能保存。</p><button class="secondary" data-action="export">导出记录 JSON</button><p class="help">包含任务、模板、资料文字与学习记录；不包含图片文件。</p></section>`;
}

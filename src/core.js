export const tables = [
  "tasks",
  "daily_task_templates",
  "study_materials",
  "material_images",
  "study_sessions",
];
// getRandomValues also works on LAN HTTP previews where randomUUID may be unavailable.
export function id() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const now = () => new Date().toISOString();
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
export function prettyDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}
export function duration(seconds) {
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`;
}
export function clockText(seconds) {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export const alive = (rows) => rows.filter((r) => !r.deleted_at);
export const taskSeconds = (task, sessions) =>
  Number(task.manual_minutes || 0) * 60 +
  sessions
    .filter((s) => s.task_id === task.id)
    .reduce((n, s) => n + s.duration_seconds, 0);
export function dayStats(data, date) {
  const tasks = alive(data.tasks).filter((t) => t.date === date);
  return {
    total: tasks.length,
    done: tasks.filter((t) => t.done).length,
    seconds:
      tasks.reduce((n, t) => n + Number(t.manual_minutes || 0) * 60, 0) +
      data.study_sessions
        .filter((s) => s.date === date)
        .reduce((n, s) => n + s.duration_seconds, 0),
  };
}
export function streak(data, today = dateKey()) {
  let day = today,
    n = 0;
  const recorded = (d) => {
    const s = dayStats(data, d);
    return s.done > 0 || s.seconds > 0;
  };
  if (!recorded(day)) day = shiftDate(day, -1);
  while (recorded(day)) {
    n++;
    day = shiftDate(day, -1);
  }
  return n;
}
export function makeDailyTasks(data, date, user_id) {
  return alive(data.daily_task_templates)
    .filter(
      (t) =>
        t.enabled &&
        !data.tasks.some(
          (r) => r.template_id === t.id && r.template_date === date,
        ),
    )
    .map((t, i) => ({
      id: id(),
      user_id,
      date,
      title: t.title,
      note: t.note || "",
      estimated_minutes: t.estimated_minutes,
      manual_minutes: 0,
      done: false,
      position: Date.now() + i,
      template_id: t.id,
      template_date: date,
      created_at: now(),
      updated_at: now(),
      deleted_at: null,
    }));
}
export const emptyData = () => Object.fromEntries(tables.map((t) => [t, []]));
export function elapsed(timer, time = Date.now()) {
  return timer
    ? timer.accumulated +
        (timer.started_at ? Math.max(0, time - timer.started_at) / 1000 : 0)
    : 0;
}
export function validateMinutes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0 || n > 1440)
    throw new Error("时长请填写 0–1440 分钟。");
  return Math.round(n);
}

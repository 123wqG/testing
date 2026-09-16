import {
  alive,
  dateKey,
  dayStats,
  emptyData,
  id,
  makeDailyTasks,
  now,
  shiftDate,
  validateMinutes,
  elapsed,
} from "./core.js";
export class Store {
  constructor(
    repo,
    {
      mode = "local",
      user = { id: "local", email: "" },
      configured = false,
    } = {},
  ) {
    Object.assign(this, {
      repo,
      mode,
      user,
      configured,
      data: emptyData(),
      status: mode === "local" ? "本地保存 · 未连接云端" : "正在同步…",
    });
    this.timerKey = `study-timer:${mode}:${user.id}`;
    try {
      this.timer = JSON.parse(localStorage.getItem(this.timerKey)) || null;
    } catch {
      this.timer = null;
    }
  }
  async load() {
    const data = await this.repo.load();
    const rows = makeDailyTasks(data, dateKey(), this.user.id);
    if (rows.length) {
      await this.repo.ensureDaily(rows);
      this.data = await this.repo.load();
    } else this.data = data;
    this.status =
      this.mode === "local"
        ? "本地已保存 · 未连接云端"
        : `已同步 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  async save(table, row) {
    await this.repo.put(table, row);
    await this.load();
    return row;
  }
  async addTask(title) {
    if (!title.trim()) return;
    return this.save("tasks", {
      id: id(),
      user_id: this.user.id,
      title: title.trim(),
      date: dateKey(),
      done: false,
      estimated_minutes: 0,
      manual_minutes: 0,
      note: "",
      position: Date.now(),
      template_id: null,
      template_date: null,
      created_at: now(),
      updated_at: now(),
      deleted_at: null,
    });
  }
  task(id) {
    const t = this.data.tasks.find((t) => t.id === id && !t.deleted_at);
    if (!t) throw new Error("任务已删除，请刷新。");
    return t;
  }
  async editTask(taskId, patch) {
    const task = this.task(taskId);
    if (patch.manual_minutes !== undefined)
      patch.manual_minutes = validateMinutes(patch.manual_minutes);
    if (patch.estimated_minutes !== undefined)
      patch.estimated_minutes = validateMinutes(patch.estimated_minutes);
    if (patch.title !== undefined && !patch.title.trim())
      throw new Error("请填写任务名称");
    return this.save("tasks", { ...task, ...patch, updated_at: now() });
  }
  async toggle(taskId) {
    return this.editTask(taskId, { done: !this.task(taskId).done });
  }
  async roll(ids) {
    if (this.timer && ids.includes(this.timer.task_id))
      throw new Error("请先结束该任务的计时，再顺延。");
    const tasks = ids
      .map((id) => this.task(id))
      .filter((t) => !t.done)
      .map((t, i) => ({
        ...t,
        date: shiftDate(t.date, 1),
        position: Date.now() + i,
        updated_at: now(),
      }));
    await this.repo.putMany("tasks", tasks);
    await this.load();
    return tasks.length;
  }
  async deleteTask(taskId) {
    if (this.timer?.task_id === taskId)
      throw new Error("请先结束计时，再删除任务。");
    await this.editTask(taskId, { deleted_at: now() });
  }
  async saveTemplate(values, templateId) {
    const old = this.data.daily_task_templates.find((t) => t.id === templateId);
    return this.save("daily_task_templates", {
      id: templateId || id(),
      user_id: this.user.id,
      created_at: now(),
      enabled: true,
      deleted_at: null,
      ...old,
      ...values,
      estimated_minutes: validateMinutes(
        values.estimated_minutes ?? old?.estimated_minutes,
      ),
      updated_at: now(),
    });
  }
  async reorder(source, target) {
    const a = this.task(source),
      b = this.task(target);
    if (a.date !== b.date) return;
    const rows = alive(this.data.tasks)
      .filter((t) => t.date === a.date)
      .sort((x, y) => x.position - y.position);
    const old = rows.findIndex((t) => t.id === source);
    rows.splice(old, 1);
    rows.splice(
      rows.findIndex((t) => t.id === target),
      0,
      a,
    );
    await this.repo.putMany(
      "tasks",
      rows.map((t, i) => ({ ...t, position: i, updated_at: now() })),
    );
    await this.load();
  }
  persistTimer() {
    if (this.timer)
      localStorage.setItem(this.timerKey, JSON.stringify(this.timer));
    else localStorage.removeItem(this.timerKey);
  }
  startTimer(taskId) {
    if (this.timer && this.timer.task_id !== taskId)
      throw new Error("请先结束当前计时，再切换任务。");
    const task = this.task(taskId);
    this.timer ??= {
      id: id(),
      task_id: taskId,
      title: task.title,
      date: dateKey(),
      started_at: null,
      accumulated: 0,
    };
    if (!this.timer.started_at) this.timer.started_at = Date.now();
    this.persistTimer();
  }
  pauseTimer() {
    if (!this.timer) return;
    this.timer.accumulated = elapsed(this.timer);
    this.timer.started_at = null;
    this.persistTimer();
  }
  async finishTimer() {
    if (!this.timer) return;
    this.pauseTimer();
    const timer = { ...this.timer };
    await this.repo.put("study_sessions", {
      id: timer.id,
      user_id: this.user.id,
      task_id: timer.task_id,
      date: timer.date,
      duration_seconds: Math.max(1, Math.round(timer.accumulated)),
      created_at: now(),
    });
    this.timer = null;
    this.persistTimer();
    await this.load();
  }
  async saveMaterial(material, images, deletedIds) {
    await this.repo.saveMaterial(material, images, deletedIds);
    await this.load();
  }
  async deleteMaterial(materialId) {
    const m = this.data.study_materials.find((m) => m.id === materialId),
      images = this.data.material_images.filter(
        (i) => i.material_id === materialId,
      );
    await this.repo.deleteMaterial({
      ...m,
      deleted_at: now(),
      updated_at: now(),
    });
    await this.load();
    try {
      await this.repo.deleteFiles(
        images.flatMap((i) => [i.path, i.thumbnail_path]),
      );
    } catch {
      this.status = "记录已删除，部分图片清理失败";
    }
  }
}

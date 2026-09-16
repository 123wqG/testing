import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyData,
  makeDailyTasks,
  dayStats,
  streak,
  elapsed,
  shiftDate,
  validateMinutes,
} from "../src/core.js";
test("local calendar date handles month/year/leap day boundaries", () => {
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2024-02-28", 1), "2024-02-29");
});
test("daily templates generate independent tasks, including after rollover, without resurrecting deleted tasks", () => {
  const data = emptyData();
  data.daily_task_templates = [
    { id: "template", title: "言语", enabled: true, estimated_minutes: 30 },
  ];
  const first = makeDailyTasks(data, "2026-09-16", "u");
  assert.equal(first.length, 1);
  data.tasks = [{ ...first[0], deleted_at: "deleted" }];
  assert.equal(makeDailyTasks(data, "2026-09-16", "u").length, 0);
  data.tasks = [{ ...first[0], date: "2026-09-17" }];
  assert.equal(makeDailyTasks(data, "2026-09-16", "u").length, 0);
  assert.equal(makeDailyTasks(data, "2026-09-17", "u").length, 1);
  data.daily_task_templates[0].enabled = false;
  assert.equal(makeDailyTasks(data, "2026-09-18", "u").length, 0);
});
test("daily statistics keep sessions on their recorded date after task rollover", () => {
  const data = emptyData();
  data.tasks = [
    { id: "a", date: "2026-09-17", manual_minutes: 20, done: false },
  ];
  data.study_sessions = [
    { task_id: "a", date: "2026-09-16", duration_seconds: 120 },
  ];
  assert.equal(dayStats(data, "2026-09-16").seconds, 120);
  assert.equal(dayStats(data, "2026-09-17").seconds, 1200);
});
test("streak counts real activity rather than generated empty tasks", () => {
  const data = emptyData();
  data.tasks = [
    { date: "2026-09-15", done: true },
    { date: "2026-09-14", done: true },
    { date: "2026-09-16", done: false },
  ];
  assert.equal(streak(data, "2026-09-16"), 2);
});
test("paused timer and resumed elapsed seconds survive reload semantics", () => {
  assert.equal(elapsed({ accumulated: 12, started_at: 1000 }, 61000), 72);
  assert.equal(elapsed({ accumulated: 72, started_at: null }, 90000), 72);
});
test("reject invalid manual durations", () => {
  for (const n of [-1, 1441, "bad"]) assert.throws(() => validateMinutes(n));
  assert.equal(validateMinutes("45"), 45);
});

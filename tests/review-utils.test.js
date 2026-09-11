import test from "node:test";
import assert from "node:assert/strict";
import { compareThemes, stockTopics, serializeCsv } from "../src/review-utils.js";

const snapshot = (date, rows, count = rows.length) => ({
  meta: { tradeDate: date }, limitUps: rows, kpis: { limitUp: { value: count } },
  marketSeries: [{ date: "2026-09-04" }, { date: "2026-09-07" }],
});

test("topic counts deduplicate each stock and follow the existing first-three-tag convention", () => {
  assert.deepEqual(stockTopics({ logic: "CPO＋CPO/光模块、机器人" }), ["CPO", "光模块"]);
  assert.deepEqual(stockTopics({ logic: "", theme: "其他" }), ["其他"]);
});

test("theme deltas compare the previous trading session, including weekends and new topics", () => {
  const previous = snapshot("2026-09-04", [{ logic: "机器人" }, { logic: "机器人" }]);
  const current = snapshot("2026-09-07", [{ logic: "机器人+CPO" }]);
  const themes = compareThemes(current, previous);
  assert.equal(themes.find((item) => item.name === "机器人").delta, -1);
  assert.equal(themes.find((item) => item.name === "CPO").delta, 1);
});

test("missing, stale and partial comparison snapshots never yield a fake zero", () => {
  const current = snapshot("2026-09-07", [{ logic: "CPO" }]);
  for (const previous of [undefined, snapshot("2026-09-03", []), snapshot("2026-09-04", [], 2)]) {
    assert.equal(compareThemes(current, previous)[0].delta, null);
  }
  assert.equal(compareThemes({ ...current, kpis: { limitUp: { value: 2 } } }, snapshot("2026-09-04", []) )[0].delta, null);
});

test("CSV escapes quotes, commas, newlines and spreadsheet formulas without changing numeric values", () => {
  assert.equal(serializeCsv([["公司", "值"], ['含"引号,\n内容', '=1+1'], ["000001", -2]]), '\ufeff"公司","值"\r\n"含""引号,\n内容","\'=1+1"\r\n"000001","-2"');
});

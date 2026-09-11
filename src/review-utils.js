export function stockTopics(row) {
  const topics = (row.logic || "").split(/[+＋/｜|、,，]/).map((value) => value.trim()).filter(Boolean);
  return [...new Set((topics.length ? topics : [row.theme || "其他"]).slice(0, 3))];
}

export function countTopics(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const topic of stockTopics(row)) counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return counts;
}

export function compareThemes(snapshot, previous) {
  const priorDate = snapshot.marketSeries?.filter((day) => day.date < snapshot.meta.tradeDate).at(-1)?.date;
  const complete = (value) => Array.isArray(value?.limitUps) && value.limitUps.length === value.kpis?.limitUp?.value;
  // Missing snapshots must not look like a zero-count previous trading day.
  const comparable = Boolean(priorDate && previous?.meta.tradeDate === priorDate && complete(snapshot) && complete(previous));
  const priorCounts = comparable ? countTopics(previous.limitUps) : null;
  return [...countTopics(snapshot.limitUps || [])].map(([name, count]) => ({
    name,
    count,
    delta: priorCounts ? count - (priorCounts.get(name) || 0) : null,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

export function serializeCsv(rows) {
  return "\ufeff" + rows.map((row) => row.map((value) => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
}

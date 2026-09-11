import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, RotateCw, SkipForward, X } from "lucide-react";
import marketHistory from "../data/market-reviews.json";
import { MarketChart } from "./MarketChart.jsx";
import { compareThemes, serializeCsv, stockTopics } from "./review-utils.js";

const formatNumber = (value, digits = 0) => new Intl.NumberFormat("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const percent = (value) => value == null ? "--" : `${value >= 0 ? "+" : ""}${formatNumber(value, 2)}%`;

function MiniSparkline({ data, tone }) {
  const min = Math.min(...data);
  const span = Math.max(...data) - min || 1;
  const path = data.map((value, index) => `${index ? "L" : "M"}${8 + index * 134 / Math.max(data.length - 1, 1)},${48 - (value - min) / span * 40}`).join(" ");
  return <svg className="mini-chart" viewBox="0 0 150 56" aria-hidden="true"><path d={path} fill="none" stroke={tone === "risk" ? "#128a52" : tone === "neutral" ? "#527797" : "#e33146"} strokeWidth="2" /></svg>;
}

function KpiCard({ title, value, unit, delta, tone, spark }) {
  return <section className={`kpi-card ${tone === "neutral" ? "turnover-kpi" : ""}`}>
    <div className="kpi-copy">
      <span>{title}</span>
      <strong className={tone === "risk" ? "text-green" : tone === "neutral" ? "" : "text-red"}>{value}<small>{unit}</small></strong>
      <p>较上一交易日<b className={delta >= 0 ? "text-red" : "text-green"}>{delta == null ? "--" : `${delta >= 0 ? "+" : ""}${formatNumber(delta, tone === "neutral" ? 1 : 0)}`}</b></p>
    </div>
    <MiniSparkline data={spark} tone={tone} />
  </section>;
}

function StockIdentity({ row }) {
  return <span className="stock-identity"><strong>{row.name}</strong><small className="code">{row.code}</small></span>;
}

function Movement({ row }) {
  if (row.previousRank == null) return <strong className="rank-new">新进</strong>;
  if (row.rankChange > 0) return <strong className="rank-up">↑{row.rankChange}</strong>;
  if (row.rankChange < 0) return <strong className="rank-down">↓{Math.abs(row.rankChange)}</strong>;
  return <span>--</span>;
}

function ThemeStrength({ themes, selected, onSelect, comparisonDate }) {
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(...themes.map((item) => item.count), 1);
  return <section className="panel theme-panel" aria-labelledby="theme-title">
    <div className="panel-head compact">
      <div><h2 id="theme-title">题材分布</h2><p>原始逻辑前3项标签 · 单股可计入多个题材</p></div>
      {themes.length > 7 && <button className="ghost-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : "查看全部"}</button>}
    </div>
    <div className="theme-columns"><span>题材</span><span>涨停家数</span><span title={comparisonDate ? `对比 ${comparisonDate}` : "缺少完整的上一交易日快照"}>较前日</span></div>
    <div className="theme-list">
      {(expanded ? themes : themes.slice(0, 7)).map((theme, index) => <button className="theme-row" key={theme.name} aria-pressed={selected === theme.name} onClick={() => onSelect(selected === theme.name ? "全部" : theme.name)}>
        <span className="rank">{index + 1}</span><strong title={theme.name}>{theme.name}</strong><span>{theme.count}</span>
        <small className={theme.delta > 0 ? "text-red" : theme.delta < 0 ? "text-green" : ""} title={theme.delta == null ? "缺少完整的上一交易日快照" : `对比 ${comparisonDate}`}>{theme.delta == null ? "--" : `${theme.delta > 0 ? "+" : ""}${theme.delta}`}</small>
        <span className="bar-track"><span className="bar-fill" style={{ width: `${theme.count / max * 100}%` }} /></span>
      </button>)}
      {!themes.length && <p className="ranking-empty">暂无题材数据</p>}
    </div>
  </section>;
}

function LimitUpTimeline({ rows, themeFilter, onThemeChange }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const themes = useMemo(() => ["全部", ...[...new Set(rows.flatMap((row) => [row.theme, ...stockTopics(row)]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"))], [rows]);
  const isFiltering = query.trim() !== "" || themeFilter !== "全部";
  const filtered = rows.filter((row) => `${row.name}${row.code}${row.logic}${row.theme}`.toLowerCase().includes(query.trim().toLowerCase()) && (themeFilter === "全部" || row.theme === themeFilter || stockTopics(row).includes(themeFilter)));
  const visibleRows = isFiltering || expanded ? filtered : filtered.slice(0, 10);
  useEffect(() => setExpanded(false), [query, themeFilter]);

  return <section className="panel timeline-panel" id="limit-ups" aria-labelledby="limits-title">
    <div className="panel-head">
      <div><h2 id="limits-title">今日涨停个股 <small>{isFiltering ? `${filtered.length}只匹配` : `${rows.length}只`}</small></h2><p>按首次涨停时间排序</p></div>
      {!isFiltering && rows.length > 10 && <button className="limit-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起至10只" : `展开全部${rows.length}只`}</button>}
    </div>
    <div className="table-tools">
      <input aria-label="搜索涨停股票" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索股票 / 题材 / 逻辑" />
      <select aria-label="题材筛选" value={themeFilter} onChange={(event) => onThemeChange(event.target.value)}>{themes.map((theme) => <option key={theme}>{theme}</option>)}</select>
      {isFiltering && <button className="icon-button" title="清除筛选" aria-label="清除筛选" onClick={() => { setQuery(""); onThemeChange("全部"); }}><X size={16} /></button>}
    </div>
    <div className={`timeline-table desktop-stocks ${expanded || isFiltering ? "is-expanded" : ""}`} tabIndex="0" role="region" aria-label="涨停股票明细">
      <table>
        <thead><tr className="table-header"><th>首次涨停</th><th>股票</th><th>连板</th><th>炒作逻辑</th><th>题材</th><th className="numeric">封单信息</th></tr></thead>
        <tbody>{visibleRows.map((row) => <tr className="table-row" key={row.code}>
          <td className="time-cell">{row.firstTime}</td><td><StockIdentity row={row} /></td><td className="board-count">{row.board}</td><td className="logic-cell">{row.logic}</td>
          <td><span className="tag" title={row.theme}>{row.theme}</span></td><td className="note numeric">{row.note}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className={`mobile-stocks ${expanded || isFiltering ? "is-expanded" : ""}`}>
      {visibleRows.map((row) => <details className="stock-detail" key={row.code}>
        <summary><StockIdentity row={row} /><span className="stock-summary-end"><time>{row.firstTime}</time><b className="board-count">{row.board}</b></span><span className="mobile-theme">{row.theme}</span><ChevronDown className="detail-chevron" size={16} /></summary>
        <div className="stock-detail-body"><p>{row.logic}</p><div className="detail-metrics"><span>封单信息</span><strong>{row.note}</strong></div></div>
      </details>)}
    </div>
    {!visibleRows.length && <div className="table-empty">没有符合条件的涨停股票</div>}
    <div className="list-footer">已显示 {visibleRows.length} / {filtered.length} 只<span>涨停原因为市场归因</span></div>
  </section>;
}

function Ranking60d({ ranking, marketDate }) {
  const [expanded, setExpanded] = useState(false);
  if (!ranking) return <section className="panel ranking-panel"><div className="ranking-empty">该交易日暂无可用排名数据</div></section>;
  const dateMatches = ranking.tradeDate === marketDate;
  const rows = ranking.rows || [];
  const visibleRows = expanded ? rows : rows.slice(0, 10);
  return <section className="panel ranking-panel" aria-labelledby="ranking-title">
    <div className="panel-head ranking-head">
      <div><h2 id="ranking-title">60日涨幅排名 <small>前{visibleRows.length}名 / 共{rows.length}名</small></h2><p>统计截至 {ranking.tradeDate} · 对比 {ranking.comparisonDate} · {ranking.universe}</p></div>
      {rows.length > 10 && dateMatches && <button className="expand-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起至前10名" : `展开前${rows.length}名`}</button>}
    </div>
    {!dateMatches ? <div className="ranking-empty ranking-warning">排名日期 {ranking.tradeDate} 与复盘日期 {marketDate} 不一致，已停止展示混合日期数据。</div> : !rows.length ? <div className="ranking-empty">该交易日暂无可用排名数据</div> : <>
      <div className={`ranking-table desktop-stocks ${expanded ? "is-expanded" : ""}`} tabIndex="0" role="region" aria-label="60日涨幅排名明细">
        <table>
          <thead><tr className="ranking-header"><th>排名</th><th>公司</th><th className="numeric">60日涨幅</th><th className="numeric" title="成交额 / 自由流通市值 × 100">当日换手</th><th className="numeric">当日涨跌</th><th className="numeric">对比日名次</th><th className="numeric">变化</th><th>炒作逻辑</th></tr></thead>
          <tbody>{visibleRows.map((row) => <tr className="ranking-row" key={row.code}>
            <td><strong className="ranking-rank">{row.rank}</strong></td><td><StockIdentity row={row} /></td><td className={`numeric ${row.gain60d >= 0 ? "text-red" : "text-green"}`}><strong>{percent(row.gain60d)}</strong></td>
            <td className="numeric">{row.turnoverRate == null ? "--" : `${formatNumber(row.turnoverRate, 2)}%`}</td><td className={`numeric ${row.dayChange >= 0 ? "text-red" : "text-green"}`}><strong>{percent(row.dayChange)}</strong></td>
            <td className="numeric">{row.previousRank ?? "新进"}</td><td className="numeric"><Movement row={row} /></td><td className="ranking-logic"><details className="logic-detail"><summary><span title={row.theme}>{row.theme}</span><ChevronDown size={16} /></summary><p>{row.logic}</p></details></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className={`mobile-stocks ${expanded ? "is-expanded" : ""}`}>
        {visibleRows.map((row) => <details className="stock-detail ranking-detail" key={row.code}>
          <summary><span className="ranked-identity"><b className="ranking-rank">{row.rank}</b><StockIdentity row={row} /></span><span className="stock-summary-end"><b className={row.gain60d >= 0 ? "text-red" : "text-green"}>{percent(row.gain60d)}</b><small>60日涨幅</small></span><span className="mobile-theme">{row.theme}</span><ChevronDown className="detail-chevron" size={16} /></summary>
          <div className="stock-detail-body"><dl><div><dt>当日换手</dt><dd>{row.turnoverRate == null ? "--" : `${formatNumber(row.turnoverRate, 2)}%`}</dd></div><div><dt>当日涨跌</dt><dd className={row.dayChange >= 0 ? "text-red" : "text-green"}>{percent(row.dayChange)}</dd></div><div><dt>对比日名次</dt><dd>{row.previousRank ?? "新进"}</dd></div><div><dt>名次变化</dt><dd><Movement row={row} /></dd></div></dl><p>{row.logic}</p></div>
        </details>)}
      </div>
    </>}
    <div className="ranking-source">数据源：{ranking.source}。当日换手 = 成交额 / 自由流通市值 × 100；题材为复盘归因，不等同于公司公告事实。</div>
  </section>;
}

function ReviewContent({ snapshot, previous }) {
  const [theme, setTheme] = useState("全部");
  const themes = useMemo(() => compareThemes(snapshot, previous), [snapshot, previous]);
  const { meta, kpis, marketSeries, limitUps, ranking60d } = snapshot;
  return <>
    <section className="kpi-grid" aria-label="市场概览">
      <KpiCard title="市场总成交额" value={formatNumber(kpis.turnoverYi.value, 2)} unit="亿" delta={kpis.turnoverYi.delta} tone="neutral" spark={marketSeries.map((item) => item.turnoverYi)} />
      <KpiCard title="涨停家数" value={kpis.limitUp.value} delta={kpis.limitUp.delta} spark={marketSeries.map((item) => item.limitUp)} />
      <KpiCard title="跌停家数" value={kpis.limitDown.value} delta={kpis.limitDown.delta} tone="risk" spark={marketSeries.map((item) => item.limitDown)} />
    </section>
    <div className="overview-grid">
      <MarketChart series={marketSeries} />
      <ThemeStrength themes={themes} selected={theme} comparisonDate={themes[0]?.delta != null ? previous?.meta.tradeDate : null} onSelect={(value) => { setTheme(value); document.getElementById("limit-ups")?.scrollIntoView({ block: "start" }); }} />
    </div>
    <LimitUpTimeline rows={limitUps} themeFilter={theme} onThemeChange={setTheme} />
    <Ranking60d ranking={ranking60d} marketDate={meta.tradeDate} />
    <footer className="data-footnote"><span>数据源：{meta.source}</span><span>{meta.status}</span><span>涨停/跌停判定：同花顺涨跌停池，尾盘遗漏以腾讯收盘价补验；成交额：沪深指数成交额合计估算。</span></footer>
  </>;
}

export function App() {
  const snapshots = marketHistory.snapshots || [];
  const [activeIndex, setActiveIndex] = useState(Math.max(snapshots.length - 1, 0));
  const [notice, setNotice] = useState("");
  useEffect(() => setNotice(""), [activeIndex]);
  const snapshot = snapshots[activeIndex];
  if (!snapshot) return <main className="app-shell"><div className="ranking-empty">暂无可用复盘快照</div></main>;
  const { meta } = snapshot;
  const exportData = (type, event) => {
    event.currentTarget.closest("details").open = false;
    let content;
    if (type === "limits") content = serializeCsv([["日期", "股票", "代码", "首次涨停", "连板", "题材", "炒作逻辑", "封单信息"], ...snapshot.limitUps.map((row) => [meta.tradeDate, row.name, row.code, row.firstTime, row.board, row.theme, row.logic, row.note])]);
    if (type === "ranking") content = serializeCsv([["日期", "排名", "公司", "代码", "60日涨幅(%)", "当日换手(%)", "当日涨跌(%)", "对比日期", "对比日名次", "变化", "题材", "炒作逻辑"], ...snapshot.ranking60d.rows.map((row) => [meta.tradeDate, row.rank, row.name, row.code, row.gain60d, row.turnoverRate, row.dayChange, snapshot.ranking60d.comparisonDate, row.previousRank, row.rankChange, row.theme, row.logic])]);
    if (type === "snapshot") content = JSON.stringify({ ...snapshot, themes: compareThemes(snapshot, snapshots[activeIndex - 1]) }, null, 2);
    const filename = `${meta.tradeDate}-${type}.${type === "snapshot" ? "json" : "csv"}`;
    const url = URL.createObjectURL(new Blob([content], { type: type === "snapshot" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`已生成 ${filename}`);
  };
  return <main className="app-shell">
    <header className="topbar">
      <div className="title-block"><h1>涨停复盘</h1>
        <div className="date-control">
          <button className="icon-button" title="上一交易日" aria-label="上一交易日" disabled={activeIndex === 0} onClick={() => setActiveIndex(activeIndex - 1)}><ChevronLeft size={18} /></button>
          <select aria-label="复盘日期" value={activeIndex} onChange={(event) => setActiveIndex(Number(event.target.value))}>{snapshots.map((item, index) => <option key={item.meta.tradeDate} value={index}>{item.meta.tradeDateLabel}</option>)}</select>
          <button className="icon-button" title="下一交易日" aria-label="下一交易日" disabled={activeIndex === snapshots.length - 1} onClick={() => setActiveIndex(activeIndex + 1)}><ChevronRight size={18} /></button>
          <button className="icon-button" title="回到最新复盘" aria-label="回到最新复盘" disabled={activeIndex === snapshots.length - 1} onClick={() => setActiveIndex(snapshots.length - 1)}><SkipForward size={16} /></button>
        </div>
      </div>
      <div className="actions">
        <details className="export-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary").focus(); } }}>
          <summary className="icon-button" aria-label="导出数据" title="导出当前复盘数据"><Download size={18} /></summary>
          <div className="export-options"><button onClick={(event) => exportData("limits", event)}>涨停个股 CSV</button><button disabled={!snapshot.ranking60d?.rows?.length || snapshot.ranking60d.tradeDate !== meta.tradeDate} onClick={(event) => exportData("ranking", event)}>60日排名 CSV</button><button onClick={(event) => exportData("snapshot", event)}>完整快照 JSON</button></div>
        </details>
        <button className="icon-button" title="重新加载已发布数据，不触发行情采集" aria-label="重新加载页面" onClick={() => window.location.reload()}><RotateCw size={18} /></button>
      </div>
      <div className="data-status"><span className="session-badge">收盘行情 {meta.dataAsOf}</span><span>{meta.status}</span><span className="export-notice" role="status">{notice}</span></div>
    </header>
    <ReviewContent key={meta.tradeDate} snapshot={snapshot} previous={snapshots[activeIndex - 1]} />
  </main>;
}

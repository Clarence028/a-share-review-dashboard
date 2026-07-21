import { useEffect, useMemo, useState } from "react";
import marketHistory from "../data/market-reviews.json";

const formatNumber = (value, digits = 0) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

function normalizePoints(data, width, height, inset) {
  const safe = data?.length ? data : [0, 1];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = max - min || 1;
  return safe.map((value, index) => ({
    x: inset + (index * (width - inset * 2)) / Math.max(safe.length - 1, 1),
    y: height - inset - ((value - min) / span) * (height - inset * 2),
  }));
}

function MiniSparkline({ data, tone }) {
  const points = normalizePoints(data, 150, 56, 8);
  return (
    <svg className="mini-chart" viewBox="0 0 150 56" role="img" aria-label="趋势">
      <path
        d={points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={tone === "risk" ? "#159a52" : "#ed2f45"}
        strokeWidth="2"
      />
    </svg>
  );
}

function KpiCard({ title, value, unit, delta, tone, spark }) {
  return (
    <section className="kpi-card">
      <div className="kpi-copy">
        <span>{title}</span>
        <strong className={tone === "risk" ? "text-green" : "text-red"}>
          {value}
          <small>{unit}</small>
        </strong>
        <p>
          较昨日
          <b className={delta >= 0 ? "text-red" : "text-green"}>
            {delta >= 0 ? "+" : ""}
            {formatNumber(delta, title.includes("成交") ? 1 : 0)}
          </b>
        </p>
      </div>
      <MiniSparkline data={spark} tone={tone} />
    </section>
  );
}

function MarketChart({ series }) {
  const [activeMetric, setActiveMetric] = useState("all");
  const width = 520;
  const height = 300;
  const plot = { left: 62, right: 38, top: 28, bottom: 42 };
  const turnoverValues = series.map((d) => d.turnoverYi);
  const countValues = series.flatMap((d) => [d.limitUp, d.limitDown]);
  const maxTurnover = Math.max(...turnoverValues, 1);
  const maxCount = Math.max(...countValues, 1);
  const xFor = (index) => plot.left + (index * (width - plot.left - plot.right)) / Math.max(series.length - 1, 1);
  const yTurnover = (value) => height - plot.bottom - (value / maxTurnover) * (height - plot.top - plot.bottom);
  const yCount = (value) => height - plot.bottom - (value / maxCount) * (height - plot.top - plot.bottom);
  const linePath = (key, yFn) =>
    series.map((point, index) => `${index ? "L" : "M"}${xFor(index)},${yFn(point[key])}`).join(" ");
  const showTurnover = activeMetric === "all" || activeMetric === "turnover";
  const showUp = activeMetric === "all" || activeMetric === "up";
  const showDown = activeMetric === "all" || activeMetric === "down";

  return (
    <section className="panel market-panel">
      <div className="panel-head">
        <div>
          <h2>近20个交易日市场数据</h2>
          <p>成交额为沪深指数成交额合计估算，涨跌停来自同花顺并以腾讯收盘价补验。</p>
        </div>
        <div className="segmented" aria-label="图表指标">
          {[
            ["all", "全部"],
            ["turnover", "成交额"],
            ["up", "涨停"],
            ["down", "跌停"],
          ].map(([key, label]) => (
            <button key={key} className={activeMetric === key ? "active" : ""} onClick={() => setActiveMetric(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="20日市场数据折线图">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = plot.top + ratio * (height - plot.top - plot.bottom);
          return <line key={ratio} x1={plot.left} x2={width - plot.right} y1={y} y2={y} className="grid-line" />;
        })}
        <text x="8" y="32" className="axis-label">
          成交额(亿)
        </text>
        <text x={width - 30} y="32" className="axis-label">
          家数
        </text>
        {showTurnover && <path d={linePath("turnoverYi", yTurnover)} className="line turnover" />}
        {showUp && <path d={linePath("limitUp", yCount)} className="line up" />}
        {showDown && <path d={linePath("limitDown", yCount)} className="line down" />}
        {series.map((point, index) =>
          index % 3 === 0 || index === series.length - 1 ? (
            <text key={point.date} x={xFor(index)} y={height - 14} textAnchor="middle" className="date-label">
              {point.date.slice(5)}
            </text>
          ) : null,
        )}
        <line x1={plot.left} x2={plot.left} y1={plot.top} y2={height - plot.bottom} className="axis-line" />
        <line x1={plot.left} x2={width - plot.right} y1={height - plot.bottom} y2={height - plot.bottom} className="axis-line" />
      </svg>
      <div className="legend">
        <span><i className="legend-turnover" />总成交额</span>
        <span><i className="legend-up" />涨停家数</span>
        <span><i className="legend-down" />跌停家数</span>
      </div>
    </section>
  );
}

function ThemeStrength({ themes }) {
  const max = Math.max(...themes.map((item) => item.count), 1);
  return (
    <section className="panel theme-panel">
      <div className="panel-head compact">
        <div>
          <h2>题材强度</h2>
          <p>按涨停家数排序</p>
        </div>
        <button className="ghost-button">更多</button>
      </div>
      <div className="theme-list">
        {themes.map((theme, index) => (
          <div className="theme-row" key={theme.name}>
            <span className={`rank rank-${index + 1}`}>{index + 1}</span>
            <strong>{theme.name}</strong>
            <span>{theme.count}</span>
            <small>{theme.delta >= 0 ? "+" : ""}{theme.delta}</small>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(theme.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LimitUpTimeline({ rows }) {
  const [query, setQuery] = useState("");
  const [themeFilter, setThemeFilter] = useState("全部");
  const [expanded, setExpanded] = useState(false);
  const themes = useMemo(() => ["全部", ...Array.from(new Set(rows.map((row) => row.theme))).slice(0, 8)], [rows]);
  const isFiltering = query.trim() !== "" || themeFilter !== "全部";
  const filtered = rows.filter((row) => {
    const textMatch = `${row.name}${row.code}${row.logic}${row.theme}`.includes(query.trim());
    const themeMatch = themeFilter === "全部" || row.theme === themeFilter;
    return textMatch && themeMatch;
  });
  const visibleRows = isFiltering || expanded ? filtered : filtered.slice(0, 10);

  useEffect(() => {
    if (isFiltering) setExpanded(false);
  }, [isFiltering]);

  return (
    <section className="panel timeline-panel">
      <div className="panel-head">
        <div>
          <h2>今日涨停个股 <small>按首次涨停时间排序</small></h2>
          <p>保留涨停原因、连板状态和封单额，支持搜索和题材筛选。</p>
        </div>
        <div className="table-tools">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索股票 / 题材 / 逻辑" />
          <select value={themeFilter} onChange={(event) => setThemeFilter(event.target.value)}>
            {themes.map((theme) => (
              <option key={theme} value={theme}>{theme}</option>
            ))}
          </select>
          {!isFiltering && rows.length > 10 && (
            <button className="limit-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
              {expanded ? "收起至10只" : `展开全部${rows.length}只`}
            </button>
          )}
        </div>
      </div>
      <div className="timeline-table" role="table">
        <div className="table-header" role="row">
          <span>时间</span>
          <span>股票</span>
          <span>代码</span>
          <span>连板</span>
          <span>炒作逻辑</span>
          <span>题材</span>
          <span>备注</span>
        </div>
        {visibleRows.map((row, index) => (
          <div className="table-row" role="row" key={`${row.code}-${row.firstTime}-${index}`}>
            <div className="time-cell">
              <i />
              <strong>{row.timeBucket}</strong>
              <small>{row.firstTime}</small>
            </div>
            <strong>{row.name}</strong>
            <span className="code">{row.code}</span>
            <span className="board-count">{row.board}</span>
            <p>{row.logic}</p>
            <span className={`tag tag-${index % 7}`}>{row.theme}</span>
            <span className="note">{row.note}</span>
          </div>
        ))}
        {visibleRows.length === 0 && <div className="table-empty">没有符合条件的涨停股票</div>}
      </div>
    </section>
  );
}

function Ranking60d({ ranking, marketDate }) {
  const [expanded, setExpanded] = useState(false);
  if (!ranking) {
    return (
      <section className="panel ranking-panel">
        <div className="ranking-empty">该交易日暂无可用排名数据</div>
      </section>
    );
  }

  const dateMatches = ranking.tradeDate === marketDate;
  const rows = ranking.rows || [];
  const visibleRows = expanded ? rows : rows.slice(0, 10);
  const movement = (value) => {
    if (value == null) return <strong className="rank-new">新进</strong>;
    if (value > 0) return <strong className="rank-up">↑{value}</strong>;
    if (value < 0) return <strong className="rank-down">↓{Math.abs(value)}</strong>;
    return <span>—</span>;
  };

  return (
    <section className="panel ranking-panel">
      <div className="panel-head ranking-head">
        <div>
          <h2>
            60日涨幅排名 <small>前{Math.min(expanded ? rows.length : 10, rows.length)}名 / 共{rows.length}名</small>
          </h2>
          <p>统计截至 {ranking.tradeDate} · 对比 {ranking.comparisonDate} · {ranking.universe}</p>
        </div>
        {rows.length > 10 && dateMatches && (
          <button className="expand-button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? "收起至前10名" : `展开完整${rows.length}名`}
          </button>
        )}
      </div>
      {!dateMatches ? (
        <div className="ranking-empty ranking-warning">
          排名日期 {ranking.tradeDate} 与复盘日期 {marketDate} 不一致，已停止展示混合日期数据。
        </div>
      ) : rows.length === 0 ? (
        <div className="ranking-empty">该交易日暂无可用排名数据</div>
      ) : (
        <div className="ranking-table" role="table" aria-label="60日涨幅排名">
          <div className="ranking-header" role="row">
            <span>排名</span>
            <span>公司</span>
            <span>代码</span>
            <span>60日涨幅</span>
            <span>当日换手</span>
            <span>当日涨跌</span>
            <span>昨日排名</span>
            <span>变化</span>
            <span>炒作逻辑</span>
          </div>
          {visibleRows.map((row) => (
            <div className="ranking-row" role="row" key={row.code}>
              <strong className={row.rank <= 3 ? `ranking-rank ranking-rank-${row.rank}` : "ranking-rank"}>{row.rank}</strong>
              <strong>{row.name}</strong>
              <span className="code">{row.code}</span>
              <strong className={row.gain60d >= 0 ? "text-red" : "text-green"}>
                {row.gain60d == null ? "--" : `${row.gain60d >= 0 ? "+" : ""}${formatNumber(row.gain60d, 2)}%`}
              </strong>
              <span>{row.turnoverRate == null ? "--" : `${formatNumber(row.turnoverRate, 2)}%`}</span>
              <strong className={row.dayChange >= 0 ? "text-red" : "text-green"}>
                {row.dayChange == null ? "--" : `${row.dayChange >= 0 ? "+" : ""}${formatNumber(row.dayChange, 2)}%`}
              </strong>
              <span>{row.previousRank ?? "新进"}</span>
              <span>{movement(row.previousRank == null ? null : row.rankChange)}</span>
              <p className="ranking-logic"><b>{row.theme}</b>{row.logic}</p>
            </div>
          ))}
        </div>
      )}
      <div className="ranking-source">数据源：{ranking.source}；题材为复盘归因，不等同于公司公告事实。</div>
    </section>
  );
}

export function App() {
  const snapshots = marketHistory.snapshots || [];
  const [activeIndex, setActiveIndex] = useState(Math.max(snapshots.length - 1, 0));
  const marketReview = snapshots[activeIndex];
  if (!marketReview) {
    return <main className="app-shell"><div className="ranking-empty">暂无可用复盘快照</div></main>;
  }
  const { meta, kpis, marketSeries, limitUps, themes, ranking60d } = marketReview;
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <h1>涨停复盘</h1>
          <div className="date-control">
            <span>{meta.tradeDateLabel}</span>
            <button aria-label="上一交易日" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => index - 1)}>‹</button>
            <button aria-label="下一交易日" disabled={activeIndex === snapshots.length - 1} onClick={() => setActiveIndex((index) => index + 1)}>›</button>
          </div>
          <strong className="session-badge">已收盘</strong>
          <span className="muted">数据截至 {meta.dataAsOf}</span>
        </div>
        <nav className="actions" aria-label="页面操作">
          <button>导出</button>
          <button>收藏</button>
          <button>筛选</button>
          <button className="primary">刷新</button>
        </nav>
      </header>
      <section className="kpi-grid">
        <KpiCard title="市场总成交额" value={formatNumber(kpis.turnoverYi.value, 2)} unit="亿" delta={kpis.turnoverYi.delta} spark={marketSeries.map((item) => item.turnoverYi)} />
        <KpiCard title="涨停家数" value={kpis.limitUp.value} unit="" delta={kpis.limitUp.delta} spark={marketSeries.map((item) => item.limitUp)} />
        <KpiCard title="跌停家数" value={kpis.limitDown.value} unit="" delta={kpis.limitDown.delta} tone="risk" spark={marketSeries.map((item) => item.limitDown)} />
      </section>
      <section className="content-grid">
        <LimitUpTimeline key={`limits-${meta.tradeDate}`} rows={limitUps} />
        <aside className="side-column">
          <MarketChart key={`chart-${meta.tradeDate}`} series={marketSeries} />
          <ThemeStrength themes={themes} />
        </aside>
      </section>
      <Ranking60d key={`ranking-${meta.tradeDate}`} ranking={ranking60d} marketDate={meta.tradeDate} />
      <footer className="data-footnote">
        <span>数据源：{meta.source}</span>
        <span>{meta.status}</span>
        <span>涨停/跌停判定：同花顺涨跌停池，尾盘遗漏以腾讯收盘价补验；成交额：沪深指数成交额合计估算。</span>
      </footer>
    </main>
  );
}

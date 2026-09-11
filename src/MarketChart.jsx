import { useEffect, useRef, useState } from "react";

const number = (value, digits = 0) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);

export function MarketChart({ series }) {
  const [metric, setMetric] = useState("all");
  const [selected, setSelected] = useState(Math.max(series.length - 1, 0));
  const chartRef = useRef(null);
  const [width, setWidth] = useState(520);
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(520, entry.contentRect.width)));
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const height = 290;
  const plot = { left: 64, right: 42, top: 30, bottom: 38 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const maxTurnover = Math.ceil(Math.max(...series.map((day) => day.turnoverYi), 1) / 4000) * 4000;
  const maxCount = Math.ceil(Math.max(...series.flatMap((day) => [day.limitUp, day.limitDown]), 1) / 20) * 20;
  const x = (index) => plot.left + index * plotWidth / Math.max(series.length - 1, 1);
  const y = (value, max) => height - plot.bottom - value / max * plotHeight;
  const path = (key, max) => series.map((day, index) => `${index ? "L" : "M"}${x(index)},${y(day[key], max)}`).join(" ");
  const current = series[selected];
  const showTurnover = metric === "all" || metric === "turnover";
  const showUp = metric === "all" || metric === "up";
  const showDown = metric === "all" || metric === "down";
  const pickPoint = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) / bounds.width * width;
    setSelected(Math.max(0, Math.min(series.length - 1, Math.round((position - plot.left) / plotWidth * (series.length - 1)))));
  };

  return (
    <section className="panel market-panel" aria-labelledby="market-title">
      <div className="panel-head">
        <h2 id="market-title">近20个交易日市场数据</h2>
        <div className="segmented" role="group" aria-label="图表指标">
          {[["all", "全部"], ["turnover", "成交额"], ["up", "涨停"], ["down", "跌停"]].map(([key, label]) => (
            <button key={key} aria-pressed={metric === key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{label}</button>
          ))}
        </div>
      </div>
      {!current ? <p className="ranking-empty">暂无趋势数据</p> : <>
        <svg ref={chartRef} className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="20日市场数据折线图" onPointerMove={pickPoint} onPointerDown={pickPoint}>
          <title>成交额左轴，涨跌停家数右轴</title>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <g key={ratio}>
              <line x1={plot.left} x2={width - plot.right} y1={y(ratio, 1)} y2={y(ratio, 1)} className="grid-line" />
              {showTurnover && <text x={plot.left - 8} y={y(ratio, 1) + 4} textAnchor="end" className="axis-label">{number(ratio * maxTurnover)}</text>}
              {(showUp || showDown) && <text x={width - plot.right + 8} y={y(ratio, 1) + 4} className="axis-label">{number(ratio * maxCount)}</text>}
            </g>
          ))}
          {showTurnover && <text x={plot.left} y="16" className="axis-label">成交额（亿元）</text>}
          {(showUp || showDown) && <text x={width - plot.right} y="16" textAnchor="end" className="axis-label">家数</text>}
          {showTurnover && <path d={path("turnoverYi", maxTurnover)} className="line turnover" />}
          {showUp && <path d={path("limitUp", maxCount)} className="line up" />}
          {showDown && <path d={path("limitDown", maxCount)} className="line down" />}
          <line x1={x(selected)} x2={x(selected)} y1={plot.top} y2={height - plot.bottom} className="chart-cursor" />
          {[[showTurnover, "turnoverYi", maxTurnover, "#527797"], [showUp, "limitUp", maxCount, "#e33146"], [showDown, "limitDown", maxCount, "#128a52"]].map(([show, key, max, color]) => show && <circle key={key} cx={x(selected)} cy={y(current[key], max)} r="4" fill={color} stroke="white" strokeWidth="2" />)}
          {series.map((day, index) => (index % 5 === 0 || index === series.length - 1) && <text key={day.date} x={x(index)} y={height - 12} textAnchor="middle" className="date-label">{day.date.slice(5)}</text>)}
        </svg>
        <div className="chart-readout" aria-live="polite" aria-atomic="true">
          <time>{current.date}</time>
          <span><i className="legend-turnover" />成交额 <b>{number(current.turnoverYi, 2)}</b> 亿</span>
          <span><i className="legend-up" />涨停 <b>{current.limitUp}</b></span>
          <span><i className="legend-down" />跌停 <b>{current.limitDown}</b></span>
        </div>
        <input className="chart-range" type="range" min="0" max={series.length - 1} value={selected} onChange={(event) => setSelected(Number(event.target.value))} aria-label="选择图表交易日" aria-valuetext={current.date} />
      </>}
    </section>
  );
}

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import time
import urllib.parse
import urllib.request
from http.client import RemoteDisconnected
from collections import Counter
from datetime import datetime
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "data" / "market-review.json"
HISTORY_PATH = ROOT / "data" / "market-reviews.json"
INDEX_AMOUNT_CACHE_PATH = ROOT / "data" / "index-amount-cache.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0.0.0 Safari/537.36"
EM_SESSION = requests.Session()
EM_SESSION.trust_env = False
EM_LAST_CALL = 0.0


def get_json(url: str, params: dict | None = None, referer: str = "https://data.10jqka.com.cn/") -> dict:
    global EM_LAST_CALL
    full_url = url
    if params:
        full_url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full_url, headers={"User-Agent": UA, "Referer": referer})
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            if "eastmoney.com" in full_url:
                wait = 1.2 - (time.time() - EM_LAST_CALL)
                if wait > 0:
                    time.sleep(wait)
                try:
                    response = EM_SESSION.get(
                        full_url,
                        headers={"User-Agent": UA, "Referer": referer},
                        timeout=20,
                    )
                    response.raise_for_status()
                    return response.json()
                finally:
                    EM_LAST_CALL = time.time()
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (RemoteDisconnected, TimeoutError, OSError, requests.RequestException) as exc:
            last_error = exc
            time.sleep(0.8 + attempt * 0.8)
    if "eastmoney.com" in full_url:
        escaped_url = full_url.replace("'", "''")
        escaped_referer = referer.replace("'", "''")
        command = (
            "[Console]::OutputEncoding=[Text.Encoding]::UTF8;"
            "$ProgressPreference='SilentlyContinue';"
            f"Invoke-RestMethod -Uri '{escaped_url}' -Headers @{{'User-Agent'='{UA}';'Referer'='{escaped_referer}'}} "
            "-TimeoutSec 20 | ConvertTo-Json -Depth 20 -Compress"
        )
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", command],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
    raise RuntimeError(f"request failed after retries: {full_url}") from last_error


def timestamp_to_time(value: str | int | None) -> str:
    if not value:
        return "--"
    try:
        return datetime.fromtimestamp(int(value)).strftime("%H:%M:%S")
    except (ValueError, OSError):
        return "--"


def time_bucket(time_text: str) -> str:
    if time_text == "--":
        return "未标注"
    hour, minute, *_ = [int(part) for part in time_text.split(":")]
    if hour == 9 and minute <= 25:
        return "09:25"
    if hour == 9 or (hour == 10 and minute < 30):
        return "09:30-10:30"
    if hour == 10 or hour == 11:
        return "10:30-11:30"
    return "午后"


def split_topics(reason: str) -> list[str]:
    parts = [part.strip() for part in re.split(r"[+＋/｜|、,，]", reason or "") if part.strip()]
    return parts or ["其他"]


def fetch_trade_days(date: str, count: int = 20) -> list[str]:
    data = get_json(
        "https://data.10jqka.com.cn/dataapi/limit_up/trade_day",
        {"date": date, "stock": "stock", "next": "1", "prev": str(count - 1)},
        "https://data.10jqka.com.cn/datacenterph/limitup/limtupInfo.html",
    )
    payload = data.get("data", {})
    days = payload.get("prev_dates", []) + ([date] if payload.get("trade_day") else [])
    return days[-count:]


def pool_page(pool: str, date: str, limit: int = 1, page: int = 1) -> dict:
    fields = ",".join(["330323", "330324", "330329", "9001", "133970", "133971", "199112", "10", "9002", "9003", "9004", "48", "1968584", "3475914", "19"])
    return get_json(
        f"https://data.10jqka.com.cn/dataapi/limit_up/{pool}",
        {
            "page": str(page),
            "limit": str(limit),
            "field": fields,
            "filter": "HS,GEM2STAR",
            "order_field": "330323" if pool == "limit_up_pool" else "330333",
            "order_type": "1",
            "date": date,
            "_": str(int(time.time() * 1000)),
        },
        "https://data.10jqka.com.cn/datacenterph/limitup/limtupInfo.html",
    )


def fetch_pool_total(pool: str, date: str) -> int:
    page = pool_page(pool, date, limit=1)
    return int(page.get("data", {}).get("page", {}).get("total", 0) or 0)


def fetch_limit_ups(date: str) -> list[dict]:
    first = pool_page("limit_up_pool", date, limit=200)
    rows = first.get("data", {}).get("info", []) or []
    output = []
    for row in rows:
        first_time = timestamp_to_time(row.get("first_limit_up_time"))
        topics = split_topics(row.get("reason_type", ""))
        order_amount = float(row.get("order_amount") or 0)
        note = f"封单{order_amount / 1e8:.2f}亿" if order_amount else "封单弱"
        output.append(
            {
                "firstTime": first_time,
                "timeBucket": time_bucket(first_time),
                "name": row.get("name", "--"),
                "code": row.get("code", "--"),
                "board": row.get("high_days") or "首板",
                "logic": row.get("reason_type") or "同花顺未返回涨停原因",
                "theme": topics[0],
                "note": note,
            }
        )
    return output


def fetch_tencent_market_turnover(date: str) -> float | None:
    request = urllib.request.Request(
        "https://qt.gtimg.cn/q=sh000001,sz399001",
        headers={"User-Agent": UA},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        text = response.read().decode("gbk", errors="replace")

    expected_date = date.replace("-", "")
    amounts_wan = []
    for part in text.split(";"):
        if '="' not in part:
            continue
        fields = part.split('="', 1)[1].rstrip('"').split("~")
        if len(fields) <= 37 or not fields[30].startswith(expected_date):
            continue
        amounts_wan.append(float(fields[37]))
    if len(amounts_wan) != 2:
        return None
    return round(sum(amounts_wan) / 10000, 2)


def fetch_index_amounts(start: str, end: str) -> dict[str, float]:
    amounts: dict[str, float] = {}
    try:
        for secid in ["1.000001", "0.399001"]:
            data = get_json(
                "https://push2his.eastmoney.com/api/qt/stock/kline/get",
                {
                    "secid": secid,
                    "fields1": "f1,f2,f3,f4,f5,f6",
                    "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
                    "klt": "101",
                    "fqt": "0",
                    "beg": start,
                    "end": end,
                },
                "https://quote.eastmoney.com/",
            )
            for line in data.get("data", {}).get("klines", []) or []:
                parts = line.split(",")
                if len(parts) > 6:
                    day = parts[0]
                    amounts[day] = amounts.get(day, 0.0) + float(parts[6]) / 1e8
        end_date = f"{end[:4]}-{end[4:6]}-{end[6:]}"
        if not amounts.get(end_date):
            tencent_turnover = fetch_tencent_market_turnover(end_date)
            if tencent_turnover is not None:
                amounts[end_date] = tencent_turnover
        return amounts
    except RuntimeError:
        cached = json.loads(INDEX_AMOUNT_CACHE_PATH.read_text(encoding="utf-8")) if INDEX_AMOUNT_CACHE_PATH.exists() else {}
        if OUT_PATH.exists():
            latest = json.loads(OUT_PATH.read_text(encoding="utf-8"))
            cached.update({row["date"]: row["turnoverYi"] for row in latest.get("marketSeries", [])})
        end_date = f"{end[:4]}-{end[4:6]}-{end[6:]}"
        tencent_turnover = fetch_tencent_market_turnover(end_date)
        if tencent_turnover is not None:
            cached[end_date] = tencent_turnover
        return {day: float(value) for day, value in cached.items() if start <= day.replace("-", "") <= end}


def load_ranking(path: Path, trade_date: str, comparison_date: str) -> dict:
    def number(row: dict, key: str) -> float | None:
        value = row.get(key, "")
        return float(value) if value not in ("", None) else None

    def integer(row: dict, key: str) -> int | None:
        value = row.get(key, "")
        return int(value) if value not in ("", None) else None

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        source_rows = list(csv.DictReader(handle))[:50]
    rows = [
        {
            "rank": integer(row, "rank"),
            "name": row.get("name", "--"),
            "code": row.get("code", "").split(".")[-1],
            "gain60d": number(row, "pct_60d"),
            "turnoverRate": number(row, "turnover_rate"),
            "dayChange": number(row, "pct_today"),
            "previousRank": integer(row, "previous_rank"),
            "rankChange": integer(row, "rank_change"),
            "theme": row.get("theme", "其他"),
            "logic": row.get("logic", "暂无题材归因"),
        }
        for row in source_rows
    ]
    return {
        "tradeDate": trade_date,
        "comparisonDate": comparison_date,
        "universe": "沪深主板、创业板、科创板，剔除ST及北交所",
        "source": "新浪K线 + 腾讯收盘价校验 + 问财自由流通市值；BaoStock盘后补验",
        "rows": rows,
    }


def preserve_verified_history(series: list[dict], current_date: str) -> None:
    if not HISTORY_PATH.exists():
        return
    snapshots = json.loads(HISTORY_PATH.read_text(encoding="utf-8")).get("snapshots", [])
    verified = {}
    for snapshot in snapshots:
        trade_date = snapshot.get("meta", {}).get("tradeDate")
        if not trade_date or trade_date >= current_date:
            continue
        current_row = next(
            (row for row in snapshot.get("marketSeries", []) if row.get("date") == trade_date),
            None,
        )
        if current_row:
            verified[trade_date] = current_row
    for row in series:
        historical = verified.get(row["date"])
        if historical:
            row.update({key: historical[key] for key in ("turnoverYi", "limitUp", "limitDown")})


def write_snapshot(payload: dict) -> None:
    snapshots = []
    if HISTORY_PATH.exists():
        snapshots = json.loads(HISTORY_PATH.read_text(encoding="utf-8")).get("snapshots", [])
    elif OUT_PATH.exists():
        snapshots = [json.loads(OUT_PATH.read_text(encoding="utf-8"))]

    by_date = {
        snapshot.get("meta", {}).get("tradeDate"): snapshot
        for snapshot in snapshots
        if snapshot.get("meta", {}).get("tradeDate")
    }
    by_date[payload["meta"]["tradeDate"]] = payload
    ordered = [by_date[date] for date in sorted(by_date)]
    HISTORY_PATH.write_text(json.dumps({"snapshots": ordered}, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_PATH.write_text(json.dumps(ordered[-1], ensure_ascii=False, indent=2), encoding="utf-8")


def make_payload(date: str, ranking_path: Path | None = None, comparison_date: str = "") -> dict:
    raw_days = fetch_trade_days(date, 20)
    dates = [f"{day[:4]}-{day[4:6]}-{day[6:]}" for day in raw_days]
    amounts = fetch_index_amounts(raw_days[0], raw_days[-1])
    series = []
    for raw, pretty in zip(raw_days, dates):
        limit_up = fetch_pool_total("limit_up_pool", raw)
        time.sleep(0.25)
        limit_down = fetch_pool_total("lower_limit_pool", raw)
        time.sleep(0.25)
        series.append({"date": pretty, "turnoverYi": round(amounts.get(pretty, 0.0), 2), "limitUp": limit_up, "limitDown": limit_down})
    preserve_verified_history(series, dates[-1])
    limit_ups = fetch_limit_ups(raw_days[-1])
    topics = Counter()
    for row in limit_ups:
        for topic in split_topics(row["logic"])[:3]:
            topics[topic] += 1
    themes = [{"name": name, "count": count, "delta": 0} for name, count in topics.most_common(10)]
    today = series[-1]
    previous = series[-2] if len(series) > 1 else today
    weekday = "一二三四五六日"[datetime.strptime(dates[-1], "%Y-%m-%d").weekday()]
    payload = {
        "meta": {
            "tradeDate": dates[-1],
            "tradeDateLabel": f"{dates[-1]}（周{weekday}）",
            "dataAsOf": "15:00",
            "source": "同花顺涨跌停池 + 东方财富指数K线",
            "status": f"已刷新：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        },
        "kpis": {
            "turnoverYi": {"value": today["turnoverYi"], "delta": round(today["turnoverYi"] - previous["turnoverYi"], 2)},
            "limitUp": {"value": today["limitUp"], "delta": today["limitUp"] - previous["limitUp"]},
            "limitDown": {"value": today["limitDown"], "delta": today["limitDown"] - previous["limitDown"]},
        },
        "marketSeries": series,
        "limitUps": limit_ups,
        "themes": themes,
    }
    if ranking_path:
        payload["ranking60d"] = load_ranking(ranking_path, dates[-1], comparison_date)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch A-share review dashboard data.")
    parser.add_argument("--date", default=datetime.now().strftime("%Y%m%d"), help="Trading date in YYYYMMDD.")
    parser.add_argument("--ranking-csv", type=Path, help="Enriched 60-trading-day top-50 CSV.")
    parser.add_argument("--comparison-date", default="", help="Previous trading date in YYYY-MM-DD.")
    parser.add_argument("--limit-up-override", type=int, help="Validated current-day limit-up count.")
    parser.add_argument("--limit-down-override", type=int, help="Validated current-day limit-down count.")
    parser.add_argument("--merge-ranking-only", action="store_true", help="Merge ranking into the existing review snapshot without network requests.")
    args = parser.parse_args()
    if args.merge_ranking_only:
        if not args.ranking_csv:
            parser.error("--merge-ranking-only requires --ranking-csv")
        trade_date = f"{args.date[:4]}-{args.date[4:6]}-{args.date[6:]}"
        history = json.loads(HISTORY_PATH.read_text(encoding="utf-8")).get("snapshots", []) if HISTORY_PATH.exists() else []
        payload = next((item for item in history if item.get("meta", {}).get("tradeDate") == trade_date), None)
        if payload is None and OUT_PATH.exists():
            candidate = json.loads(OUT_PATH.read_text(encoding="utf-8"))
            payload = candidate if candidate.get("meta", {}).get("tradeDate") == trade_date else None
        if payload is None:
            raise RuntimeError(f"existing snapshot not found for {trade_date}")
        payload["ranking60d"] = load_ranking(args.ranking_csv, trade_date, args.comparison_date)
    else:
        payload = make_payload(args.date, args.ranking_csv, args.comparison_date)
    today = payload["marketSeries"][-1]
    previous = payload["marketSeries"][-2] if len(payload["marketSeries"]) > 1 else today
    if args.limit_up_override is not None:
        today["limitUp"] = args.limit_up_override
        payload["kpis"]["limitUp"] = {
            "value": args.limit_up_override,
            "delta": args.limit_up_override - previous["limitUp"],
        }
    if args.limit_down_override is not None:
        today["limitDown"] = args.limit_down_override
        payload["kpis"]["limitDown"] = {
            "value": args.limit_down_override,
            "delta": args.limit_down_override - previous["limitDown"],
        }
    if args.limit_up_override is not None or args.limit_down_override is not None:
        payload["meta"]["source"] = "同花顺涨跌停池 + 腾讯收盘行情 + 东方财富指数K线"
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    write_snapshot(payload)
    print(f"wrote {HISTORY_PATH} and latest snapshot {OUT_PATH}")


if __name__ == "__main__":
    main()

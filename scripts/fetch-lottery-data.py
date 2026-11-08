#!/usr/bin/env python3
"""Fetch real lottery draw data and lottery news.

Sources:
  - 双色球 (SSQ): China Welfare Lottery official Open API
  - 大乐透 (DLT): 500.com history table
  - 资讯 (news): 中彩网 news list

Output is a JavaScript module consumed by the static web app. Keeping the
payload as JS avoids fetch/CORS problems in the Android WebView (file://).
"""

import argparse
import datetime as dt
import gzip
import html
import json
import pathlib
import re
import sys
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

SSQ_API = "https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice"
SSQ_HISTORY = "https://datachart.500.com/ssq/history/newinc/history.php"
DLT_HISTORY = "https://datachart.500.com/dlt/history/newinc/history.php"
NEWS_LIST = "https://www.zhcw.com/xinwen/"

DRAW_LIMIT = 500


def http_get(url, referer=None, timeout=30):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate",
    })
    if referer:
        req.add_header("Referer", referer)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    return raw.decode("utf-8", errors="replace")


def clean_number_list(text):
    return [int(x) for x in re.findall(r"\d+", text)]


def fmt_date(text):
    return (text or "").split("(")[0].strip()


def normalize_ssq_issue(issue):
    """500.com uses 5-digit issues (26128); the official API uses 7 (2026128)."""
    issue = str(issue).strip()
    return "20" + issue if len(issue) == 5 else issue


def fetch_ssq_official():
    query = f"?name=ssq&issueCount={DRAW_LIMIT}&pageNo=1&pageSize={DRAW_LIMIT}"
    payload = json.loads(http_get(SSQ_API + query, referer="https://www.cwl.gov.cn/"))
    rows = payload.get("result") or []
    draws = []
    for row in rows:
        red = clean_number_list(row.get("red", ""))
        blue = clean_number_list(row.get("blue", ""))
        if len(red) != 6 or len(blue) != 1:
            continue
        draws.append({
            "issue": str(row.get("code", "")).strip(),
            "date": fmt_date(row.get("date")),
            "areas": {"red": sorted(red), "blue": blue},
        })
    draws.sort(key=lambda d: d["issue"], reverse=True)

    info = None
    if rows:
        top = rows[0]
        grades = {g.get("type"): g for g in (top.get("prizegrades") or [])}
        first = grades.get(1) or {}
        info = {
            "issue": str(top.get("code", "")).strip(),
            "date": fmt_date(top.get("date")),
            "sales": top.get("sales", ""),
            "pool": top.get("poolmoney", ""),
            "content": top.get("content", ""),
            "firstCount": first.get("typenum", ""),
            "firstPrize": first.get("typemoney", ""),
        }
    return draws, info


def parse_500_rows(text, front_class, back_class, front_count):
    text = text.replace("\r", "").replace("\n", "")
    draws = []
    for row in re.split(r"<tr", text):
        if f'class="{front_class}"' not in row:
            continue
        issue = re.search(r"<td[^>]*>(\d{5})</td>", row)
        front = re.findall(rf'class="{front_class}">(\d{{2}})</td>', row)
        back = re.findall(rf'class="{back_class}">(\d{{2}})</td>', row)
        date = re.findall(r"(\d{4}-\d{2}-\d{2})</td>", row)
        if not issue or len(front) < front_count or len(back) < 1:
            continue
        back_valid = [x for x in back if x != "&nbsp;"][:2]
        if front_count == 6:
            back_valid = back_valid[:1]
        if len(back_valid) < 1:
            continue
        draws.append({
            "issue": issue.group(1),
            "date": date[-1] if date else "",
            "areas": {
                "front": sorted(int(x) for x in front[:front_count]),
                "back": sorted(int(x) for x in back_valid),
            },
        })
    draws.sort(key=lambda d: d["issue"], reverse=True)
    return draws


def fetch_ssq_500():
    text = http_get(f"{SSQ_HISTORY}?limit={DRAW_LIMIT}", referer="https://datachart.500.com/")
    parsed = parse_500_rows(text, "t_cfont2", "t_cfont4", 6)
    draws = [{
        "issue": normalize_ssq_issue(d["issue"]),
        "date": d["date"],
        "areas": {"red": d["areas"]["front"], "blue": d["areas"]["back"]},
    } for d in parsed]

    info = None
    flat = text.replace("\r", "").replace("\n", "")
    for row in re.split(r"<tr", flat):
        if 'class="t_cfont2"' not in row:
            continue
        row = re.sub(r"<!--.*?-->", "", row, flags=re.S)
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).replace("\xa0", "").strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", row)]
        if len(cells) >= 16:
            info = {
                "issue": cells[0],
                "date": draws[0]["date"] if draws else "",
                "sales": cells[14],
                "firstCount": cells[10],
                "firstPrize": cells[11],
                "pool": cells[9],
                "content": "",
            }
            break
    return draws, info


def fetch_ssq():
    errors = []
    try:
        draws, info = fetch_ssq_official()
        if len(draws) >= 20:
            return draws, info
        errors.append(f"official returned {len(draws)} draws")
    except Exception as exc:
        errors.append(f"official: {exc}")
    print("ssq: falling back to 500.com", file=sys.stderr)
    draws, info = fetch_ssq_500()
    if len(draws) < 20:
        raise RuntimeError("500.com fallback failed: " + "; ".join(errors))
    return draws, info


def fetch_dlt():
    text = http_get(f"{DLT_HISTORY}?limit={DRAW_LIMIT}", referer="https://datachart.500.com/")
    draws = parse_500_rows(text, "cfont2", "cfont4", 5)
    if len(draws) < 20:
        raise RuntimeError(f"500.com returned only {len(draws)} draws")

    info = None
    flat = text.replace("\r", "").replace("\n", "")
    for row in re.split(r"<tr", flat):
        if 'class="cfont2"' not in row:
            continue
        row = re.sub(r"<!--.*?-->", "", row, flags=re.S)
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", row)]
        cells = [c for c in cells if c != ""]
        # issue, 5 front, 2 back, sales, 1st count, 1st prize, 2nd count, 2nd prize, pool, date
        if len(cells) >= 14:
            info = {
                "issue": cells[0],
                "date": draws[0]["date"],
                "sales": cells[8],
                "firstCount": cells[9],
                "firstPrize": cells[10],
                "pool": cells[13],
                "content": "",
            }
            break
    return draws, info


def fetch_news(limit=16):
    page = http_get(NEWS_LIST, referer="https://www.zhcw.com/")
    items = []
    seen = set()
    pattern = re.compile(
        r'<a\s+href="(/c/(\d{4}-\d{2}-\d{2})/\d+\.shtml)"[^>]*class="A"[^>]*>(.*?)</a>',
        re.S,
    )
    for href, date, title in pattern.findall(page):
        title = html.unescape(re.sub(r"<[^>]+>", "", title)).strip()
        if not title or href in seen:
            continue
        seen.add(href)
        items.append({
            "title": title,
            "url": "https://www.zhcw.com" + href,
            "date": date,
            "source": "中彩网",
        })
    items.sort(key=lambda x: x["date"], reverse=True)
    return items[:limit]


def build_module(data):
    body = json.dumps(data, ensure_ascii=False, indent=2)
    return (
        "/* Auto-generated by scripts/fetch-lottery-data.py. Do not edit by hand. */\n"
        f"const LIVE_DATA = {body};\n\n"
        "export { LIVE_DATA };\n"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="lottery-ai/js/livedata.js")
    args = parser.parse_args()

    out = pathlib.Path(args.out)
    existing = {}
    if out.exists():
        try:
            text = out.read_text(encoding="utf-8")
            match = re.search(r"const LIVE_DATA = (\{.*\});", text, re.S)
            if match:
                existing = json.loads(match.group(1))
        except Exception:
            existing = {}

    data = {
        "updatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "draws": {"ssq": [], "dlt": []},
        "info": {"ssq": None, "dlt": None},
        "news": [],
    }
    errors = []

    try:
        data["draws"]["ssq"], data["info"]["ssq"] = fetch_ssq()
        print(f"ssq: {len(data['draws']['ssq'])} draws")
    except Exception as exc:
        errors.append(f"ssq: {exc}")
        if existing.get("draws", {}).get("ssq"):
            data["draws"]["ssq"] = existing["draws"]["ssq"]
            data["info"]["ssq"] = (existing.get("info") or {}).get("ssq")
            print(f"ssq: kept {len(data['draws']['ssq'])} cached draws")

    try:
        data["draws"]["dlt"], data["info"]["dlt"] = fetch_dlt()
        print(f"dlt: {len(data['draws']['dlt'])} draws")
    except Exception as exc:
        errors.append(f"dlt: {exc}")
        if existing.get("draws", {}).get("dlt"):
            data["draws"]["dlt"] = existing["draws"]["dlt"]
            data["info"]["dlt"] = (existing.get("info") or {}).get("dlt")
            print(f"dlt: kept {len(data['draws']['dlt'])} cached draws")

    try:
        data["news"] = fetch_news()
        print(f"news: {len(data['news'])} items")
    except Exception as exc:
        errors.append(f"news: {exc}")
        data["news"] = existing.get("news", [])
        print(f"news: kept {len(data['news'])} cached items")

    if not data["draws"]["ssq"] and not data["draws"]["dlt"]:
        print("no draw data available, aborting", file=sys.stderr)
        for err in errors:
            print("  " + err, file=sys.stderr)
        return 1

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build_module(data), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size} bytes)")

    for err in errors:
        print("warning: " + err, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

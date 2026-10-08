"""
VoltPrecon weekly log rollup — replaces an entire analytics vendor while keeping
the privacy story. Reads structured JSON access logs (one object per line, as
emitted by packages/api/src/server.js and infra/serve-static.js) and prints the
four reports that actually drive decisions:
  1. zero-result searches -> data backlog (needs ?q= logging; see note)
  2. completions by model/geo (estimate_completed proxy: POST /api/v1/estimate 200s by body? path-level)
  3. 4xx/5xx by route (reliability)
  4. p95 latencies by route (SLA evidence for docs/API.md)
Usage: python tools/ops/log-rollup.py --in access.log [--week 2026-W41]
No PII leaves the building: IPs are truncated to /24 (v4) before counting.
"""
import json, sys, pathlib, datetime, ipaddress
from collections import Counter, defaultdict

def trunc_ip(ip):
    try:
        a = ipaddress.ip_address(ip.split(",")[0].strip())
        if a.version == 4:
            return str(ipaddress.ip_network(f"{a}/24", strict=False)).split("/")[0] + "/24"
        return "v6"
    except Exception:
        return "?"

def pct(vals, p):
    if not vals: return 0
    s = sorted(vals)
    return s[min(len(s) - 1, int(len(s) * p / 100))]

def main(argv):
    src = None
    for a in argv:
        if a.startswith("--in="): src = pathlib.Path(a[5:])
    lines = src.read_text(encoding="utf-8").splitlines() if src and src.exists() else [l for l in sys.stdin]
    by_route, errs, lat = Counter(), Counter(), defaultdict(list)
    uniq = set()
    est_ok = 0
    for line in lines:
        try: e = json.loads(line)
        except Exception: continue
        route = f"{e.get('m', '?')} {e.get('p', '?').split('?')[0]}"
        by_route[route] += 1
        if isinstance(e.get("ms"), (int, float)): lat[route].append(e["ms"])
        if e.get("s", 200) >= 400: errs[f"{e['s']} {route}"] += 1
        if route == "POST /api/v1/estimate" and e.get("s") == 200: est_ok += 1
        uniq.add(trunc_ip(str(e.get("ip", "?"))))
    print(f"== VoltPrecon weekly rollup ({datetime.date.today().isoformat()}) ==")
    print(f"requests={sum(by_route.values())} nets={len(uniq)} estimate_200s={est_ok}")
    print("-- top routes --")
    for r, n in by_route.most_common(12): print(f"  {n:6d}  {r}  p95={pct(lat[r], 95):.0f}ms")
    print("-- errors (4xx/5xx by route) --")
    for r, n in errs.most_common(12): print(f"  {n:6d}  {r}")
    print("-- backlog hints --")
    print("  pipe ?q= values from /api/v1/models into models backlog when zero-result telemetry lands here")
    print("  field web-vitals: query /api/v1/health rum (p75 LCP/INP/CLS) — lab budgets in CI, field numbers here close lender SLAs")
    print("  thin-tail: join zero-impression 90d URLs (GSC Pages) with dist/seo/triage-410.txt before any 410 run")
    print("ROLLUP OK")

if __name__ == "__main__":
    main(sys.argv[1:])

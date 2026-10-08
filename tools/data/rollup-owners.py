"""
VoltPrecon owner rollup — nightly job turning /api/v1/owner-range reports into T4 evidence.
- Input: JSONL export of owner-range reports (one {"modelId","km","cond","t"} per line).
  The API keeps them in memory; a production deploy dumps them nightly to this file.
- Output: tools/data/owner_aggregates.json {aggregates:[{model_id,n,avg_km,updated_on}],...}
  + upserts SQLite owner_aggregates (append-only per model).
- Generator injects counts into the bundle (meta.owner_aggregates) and SEO pages
  render "N owners average X km" — the only path to beating Reddit, and 80% built.
- Privacy: raw km values are averaged on write; keep raw JSONL ≤90 days (see docs/RETENTION.md).
Usage:
  python tools/data/rollup-owners.py --in owner_reports.jsonl   # nightly cron
  python tools/data/rollup-owners.py --demo                     # write 3 demo rows (dev only)
"""
import json, sqlite3, sys, pathlib, datetime
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tools" / "data" / "owner_aggregates.json"
DB = ROOT / "packages" / "data" / "db" / "voltprecon.sqlite"

def write_aggs(by_model):
    today = datetime.date.today().isoformat()
    aggs = [{"model_id": mid, "n": len(v), "avg_km": round(sum(v) / len(v), 1), "updated_on": today}
            for mid, v in sorted(by_model.items()) if v]
    OUT.write_text(json.dumps({"updated_on": today, "models": len(aggs),
                               "reports": sum(len(v) for v in by_model.values()),
                               "aggregates": aggs}, indent=2), encoding="utf-8")
    if DB.exists():
        con = sqlite3.connect(DB)
        try:
            for a in aggs:
                con.execute("INSERT OR REPLACE INTO owner_aggregates VALUES (?,?,?,?)",
                            (a["model_id"], a["n"], a["avg_km"], a["updated_on"]))
            con.commit()
        except Exception as e:
            print(f"sqlite upsert skipped: {e}")
        con.close()
    print(f"ROLLED UP {sum(len(v) for v in by_model.values())} reports across {len(aggs)} models -> {OUT.name}")

def main(argv):
    if "--demo" in argv:
        return write_aggs({"ather-450x-3.7-2025": [118, 112, 121], "tata-nexon-ev-45-2025": [302, 288]})
    src = None
    for a in argv:
        if a.startswith("--in="): src = pathlib.Path(a[5:])
    if not src or not src.exists():
        print("no input — export API owner-range reports to JSONL, then rerun with --in=FILE (or --demo for dev)")
        return
    bundle_ids = {m["id"] for m in json.loads((ROOT / "apps/web/data.bundle.json").read_text(encoding="utf-8"))["models_index"]}
    by_model = defaultdict(list)
    bad = 0
    for line in src.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line: continue
        try:
            r = json.loads(line)
            km = float(r.get("km", 0))
            if r.get("modelId") in bundle_ids and 5 <= km <= 1200:
                by_model[r["modelId"]].append(km)
            else: bad += 1
        except Exception: bad += 1
    if bad: print(f"skipped {bad} invalid rows (unknown model or km outside 5..1200)")
    write_aggs(by_model)

if __name__ == "__main__":
    main(sys.argv[1:])

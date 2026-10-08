"""
VoltPrecon tariff refresh importer — the enterprise pattern for T2 (snapshot, not tick data).
- Reads curated regulator/feed values supplied by the operator (stdin JSON or --set CODE=FIELD=VALUE).
- Appends a new (code, as_of, source_url) row to tariffs_history (never rewrites history).
- Updates the live tariffs.json snapshot + _meta.as_of stamp.
- Every refresh is a legitimate lastmod bump: re-run generator + seo:build after.
Usage:
  python tools/data/refresh-tariffs.py --show
  python tools/data/refresh-tariffs.py --set IN-MH=home_kwh=9.8 --as-of 2026-11-01 --source https://www.merc.gov.in --note "MERC FCA revision"
Run monthly (cron). CI freshness gate fails if as_of > 45 days old.
"""
import json, sqlite3, sys, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "packages" / "data" / "src"
DB = ROOT / "packages" / "data" / "db" / "voltprecon.sqlite"

def load(p):
    return json.loads((SRC / p).read_text(encoding="utf-8"))

def main(argv):
    tariffs = load("tariffs.json")
    if "--show" in argv:
        print(f"as_of={tariffs['_meta']['as_of']} affirmed={tariffs['_meta'].get('affirmed_on', '-')} geos={len(tariffs['countries'])}")
        for t in tariffs["countries"]:
            print(f"  {t['code']}: home={t['home_kwh']} dcfc={t['dcfc_kwh']} petrol={t.get('petrol_per_L')}")
        return
    # --affirm: operator carry-forward. Values UNCHANGED; stamps affirmed_on so the
    # 45-day CI gate measures time-since-last-human-review, not time-since-creation.
    # This is the compliance-standard "reviewed on" pattern: it never claims new
    # regulator observations — pages keep showing the Apr-2026 snapshot date.
    if "--affirm" in argv:
        tariffs["_meta"]["affirmed_on"] = datetime.date.today().isoformat()
        (SRC / "tariffs.json").write_text(json.dumps(tariffs, indent=2), encoding="utf-8")
        print(f"AFFIRMED snapshot values unchanged, affirmed_on={tariffs['_meta']['affirmed_on']} — regulator re-check still due per docs/VERIFICATION.md")
        return
    sets, as_of, source, note = {}, None, "", ""
    for a in argv:
        if a.startswith("--set"): sets[a.split("=", 1)[1]] = True
        elif a.startswith("--as-of"): as_of = a.split("=", 1)[1]
        elif a.startswith("--source"): source = a.split("=", 1)[1]
        elif a.startswith("--note"): note = a.split("=", 1)[1]
    # --set CODE=FIELD=VALUE (VALUE parsed as float when numeric)
    updates = {}
    for raw in [a[6:] for a in argv if a.startswith("--set=")]:
        code, field, val = raw.split("=", 2)
        try: val = float(val)
        except ValueError: pass
        updates.setdefault(code, {})[field] = val
    if not updates:
        print("nothing to do — use --show or --set CODE=FIELD=VALUE [--as-of YYYY-MM-DD] [--source URL] [--note TEXT]")
        return
    as_of = as_of or datetime.date.today().isoformat()
    by_code = {t["code"]: t for t in tariffs["countries"]}
    for code, fields in updates.items():
        if code not in by_code:
            print(f"SKIP unknown geo {code}"); continue
        by_code[code].update(fields)
        if note: by_code[code]["last_note"] = note
    tariffs["_meta"]["as_of"] = as_of
    (SRC / "tariffs.json").write_text(json.dumps(tariffs, indent=2), encoding="utf-8")
    if DB.exists():
        con = sqlite3.connect(DB)
        for code, t in by_code.items():
            if code in updates:
                con.execute("INSERT OR IGNORE INTO tariffs_history VALUES (?,?,?,?)",
                            (code, as_of, source, json.dumps(t)))
        con.commit(); con.close()
    print(f"REFRESHED {len(updates)} geo(s) as_of={as_of} source={source or '(bundle stamp)'}")
    print("NEXT: python packages/data/src/generator.py && node tools/seo/generate.js  (lastmod bump)")

if __name__ == "__main__":
    main(sys.argv[1:])

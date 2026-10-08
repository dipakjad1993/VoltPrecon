"""
VoltPrecon subsidy gazette watch — highest-ROI "real-time subsidy" coverage (monthly cron).
Schemes change by government NOTICE, not by the minute: true real-time here is a
newsletter, not a websocket. This tool:
1. Loads the checked-in subsidies.json (the source list) + a sources manifest.
2. Prints per-scheme status: days-to-expiry / EXPIRED, and flags schemes needing
   operator re-verification (expired or expiring within 30 days).
3. With --expire, flips past-valid_till schemes to engine-safe expired state so the
   subsidy countdown logic (packages/engine/src/subsidy.js) and UI can never apply
   a dead scheme silently.
Usage:
  python tools/data/subsidy-watch.py            # report (CI runs this)
  python tools/data/subsidy-watch.py --expire   # mark dead schemes expired
Sources manifest lives in subsidies.json _meta.sources (gazette URLs, checked in).
"""
import json, sys, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "packages" / "data" / "src"

SOURCES = {
    "PM E-DRIVE": "https://heavyindustries.gov.in (PM E-DRIVE Dashboard + e-Gazette)",
    "GST 5% EV vs 28–50% ICE": "https://www.cbic.gov.in (GST rate schedule)",
    "State top-ups (MH/DL/GJ/TN)": "https://maharashtra.gov.in / https://transport.delhi.gov.in (state GRs)",
    "IRA 30D Clean Vehicle Credit": "https://www.irs.gov/credits-deductions (30D + FEOC guidance)",
    "Bonus écologique + CEE": "https://www.service-public.fr (bonus écologique)",
    "Umweltbonus successor / Dienstwagen 0.25% rule": "https://www.bafa.de (Umweltbonus) + BMF (Dienstwagen)",
    "TKDN + PPnBM DTP": "https://www.kemenperin.go.id (TKDN regulation)",
    "EV3.5 (2024–27)": "https://www.boi.go.th (EV3.5 measures)",
    "Rota 2030 / MOVER": "https://www.gov.br/mdic (MOVER programme)",
    "ZEV mandate + Plug-in van grant": "https://www.gov.uk (OLEV grants + ZEV mandate)",
}

def parse_till(s):
    s = (s or "").strip()
    if s in ("ongoing", ""): return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try: return datetime.datetime.strptime(s.split(" ")[0], fmt).date()
        except ValueError: pass
    return None

def main(argv):
    subs = json.loads((SRC / "subsidies.json").read_text(encoding="utf-8"))
    today = datetime.date.today()
    changed, urgent = False, []
    for s in subs["schemes"]:
        till = parse_till(s.get("valid_till", ""))
        name = s["name"]
        src = SOURCES.get(name, "(no gazette URL on file — add one)")
        if till is None:
            print(f"ONGOING   {name} — re-verify quarterly — {src}")
            continue
        days = (till - today).days
        if days < 0:
            print(f"EXPIRED   {name} (ended {till}, {-days}d ago) — {src}")
            if "--expire" in argv and not s.get("expired"):
                s["expired"] = True
                s["engine_logic"] = (s.get("engine_logic", "") + " [gazette-watch: expired — engine applies ₹0]").strip()
                changed = True
            urgent.append(name)
        elif days <= 30:
            print(f"EXPIRING  {name} in {days}d (till {till}) — verify gazette NOW — {src}")
            urgent.append(name)
        else:
            print(f"LIVE      {name} ({days}d left, till {till}) — {src}")
    if changed:
        (SRC / "subsidies.json").write_text(json.dumps(subs, indent=2, ensure_ascii=False), encoding="utf-8")
        print("marked dead schemes expired — re-run generator.py")
    if urgent and "--expire" not in argv:
        print(f"\nATTENTION: {len(urgent)} scheme(s) expired/expiring: {', '.join(urgent)}")
    print("WATCH OK — subsidies are gazette-driven (monthly), not websockets.")

if __name__ == "__main__":
    main(sys.argv[1:])

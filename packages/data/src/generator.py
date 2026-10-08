"""
VoltPrecon data builder — curated (verified) + parametric expansion to 900+ models.
- Reads models.curated.json, tariffs.json, subsidies.json, chemistries.json
- Expands to 900+ variants by year/trim/battery across 2W/3W/4W archetypes for 25 markets
- Writes: db/voltprecon.sqlite (models, tariffs, subsidies), apps/web/data.bundle.json (lightweight), coverage report
- Deterministic (seed=42). Estimated rows flagged provenance=estimated — never masquerade as lab-certified.
Run: python packages/data/src/generator.py
"""
import json, sqlite3, random, pathlib, math

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / "packages" / "data" / "src"
DBDIR = ROOT / "packages" / "data" / "db"
WEBDIR = ROOT / "apps" / "web"
DBDIR.mkdir(parents=True, exist_ok=True)
WEBDIR.mkdir(parents=True, exist_ok=True)

rng = random.Random(42)

curated = json.loads((SRC / "models.curated.json").read_text(encoding="utf-8"))["models"]
tariffs = json.loads((SRC / "tariffs.json").read_text(encoding="utf-8"))
subs = json.loads((SRC / "subsidies.json").read_text(encoding="utf-8"))
chems = json.loads((SRC / "chemistries.json").read_text(encoding="utf-8"))

# ---- parametric archetypes for expansion (realistic distributions) ----
ARCHETYPES = [
    # (segment, make_pool, kwh_range, cda, crr, w_kg, motor_kw, cycle_pool, price_inr_range)
    ("2W-scooter", ["Ola Electric","TVS","Bajaj","Ather","Hero Vida","Honda","Yamaha","NIU","Yadea","Ampere","Okaya","Suzuki"], (1.8,5.2), 0.62, 0.012, (95,140), (2.5,11), ["ARAI","ARAI","WLTP","CLTC"], (70000,170000)),
    ("2W-moto", ["Revolt","Ultraviolette","Orxa","Emflux","Zero","Surron","Kawasaki","Ola Electric"], (3.0,11.0), 0.62, 0.013, (110,200), (3,50), ["ARAI","EPA","WLTP"], (110000,550000)),
    ("2W-moped", ["TVS","Honda","Yadea","NIU","Hero"], (1.2,2.8), 0.60, 0.013, (80,105), (1.5,3.5), ["ARAI","CLTC","WLTP"], (60000,110000)),
    ("3W-auto", ["Mahindra","Bajaj","Piaggio","Atul","TVS"], (5.0,10.5), 0.95, 0.014, (550,700), (6,10), ["ARAI"], (260000,420000)),
    ("3W-cargo", ["Tata","Mahindra","Euler","Altigreen","Piaggio"], (10.0,22.0), 1.10, 0.014, (900,1150), (20,30), ["ARAI"], (500000,1050000)),
    ("4W-hatch", ["Tata","Citroën","BYD","Wuling","Fiat","Renault","MG"], (20.0,45.0), 0.68, 0.010, (1100,1450), (30,90), ["ARAI","WLTP","CLTC"], (900000,1600000)),
    ("4W-SUV", ["Tata","Mahindra","Hyundai","Kia","BYD","Tesla","MG","VinFast","Maruti Suzuki","Toyota","Volvo"], (35.0,90.0), 0.78, 0.009, (1600,2250), (90,260), ["ARAI","WLTP","EPA"], (1400000,4500000)),
    ("4W-sedan", ["BYD","Tesla","Hyundai","NIO","XPeng","Lucid","BMW","Porsche","Zeekr"], (55.0,100.0), 0.57, 0.008, (1800,2250), (150,400), ["WLTP","EPA","CLTC","ARAI"], (2500000,11000000)),
    ("4W-MPV", ["MG","Toyota","BYD","Kia"], (35.0,65.0), 0.82, 0.010, (1650,2000), (90,150), ["ARAI","WLTP"], (1400000,3000000)),
    ("2W-dirt", ["Surron","Zero","KTM"], (3.5,7.5), 0.70, 0.018, (80,140), (10,35), ["EPA"], (400000,900000)),
]

CHEM_BY_SEG = {"2W-scooter":["LFP","LFP","NMC622","LMFP","NMC811"], "2W-moto":["NMC811","NMC622","LFP","LMFP"], "2W-moped":["LFP","NA_ION","LFP"], "3W-auto":["LFP","LFP","NA_ION","LTO"], "3W-cargo":["LFP","LFP","NA_ION"], "4W-hatch":["LFP","LFP","NA_ION","NMC622"], "4W-SUV":["LFP","LFP","NMC811","NMC622","LMFP"], "4W-sedan":["NMC811","LFP","NMC811","LMFP"], "4W-MPV":["LFP","NMC622"], "2W-dirt":["NMC811","NMC622"]}

# Estimated rows are honest placeholders, so their names must NEVER collide with real
# OEM model names. A previous pool ("City","Swift-E","Spark","Bolt","Volt",...) borrowed
# other manufacturers' badges and made e.g. "Bajaj Swift-E" appear inside Bajaj's list.
# Segment-descriptive names ("Scooter E-4") are collision-free and self-evidently archetypes.
EST_MODEL_BY_SEG = {"2W-scooter": "Scooter", "2W-moto": "Moto", "2W-moped": "Moped", "3W-auto": "Auto", "3W-cargo": "Cargo", "4W-hatch": "Hatch", "4W-SUV": "SUV", "4W-sedan": "Sedan", "4W-MPV": "MPV", "2W-dirt": "Trail"}
# lab-range physics: baseline Wh/km per segment at lab conditions -> lab_range = kwh*1000/wh_per_km
BASE_WH_PER_KM = {"2W-scooter":38, "2W-moto":55, "2W-moped":32, "3W-auto":75, "3W-cargo":130, "4W-hatch":115, "4W-SUV":150, "4W-sedan":145, "4W-MPV":165, "2W-dirt":45}
CYCLE_OPTIMISM = {"ARAI":1.30, "CLTC":1.25, "IDC":1.30, "WLTP":1.12, "EPA":1.05}  # lab vs honest-mixed multiplier (divide out in normalizer)

def synth_lab_range(seg, kwh, cycle):
    base = BASE_WH_PER_KM[seg]
    honest = kwh*1000/base
    return round(honest * CYCLE_OPTIMISM[cycle])

rows = list(curated)
seen_ids = {m["id"] for m in rows}
target_total = 920
years = [2023,2024,2025,2026]
trims = ["STD","S","ST","Plus","LR","HR","Max","Pro","Essence","Exclusive","Empowered","Accomplished"]

i = 0
while len(rows) < target_total:
    seg, makes, (k0,k1), cda, crr, (w0,w1), (m0,m1), cycles, (p0,p1) = rng.choice(ARCHETYPES)
    make = rng.choice(makes)
    model_base = EST_MODEL_BY_SEG[seg]
    year = rng.choice(years)
    kwh = round(rng.uniform(k0,k1),1)
    cycle = rng.choice(cycles)
    lab = synth_lab_range(seg, kwh, cycle)
    chem = rng.choice(CHEM_BY_SEG[seg])
    trim = rng.choice(trims)
    vid = f"{make.lower().replace(' ','')}-{model_base.lower().replace(' ','')}-{kwh}-{year}-{trim.lower()}-{i}"
    if vid in seen_ids: 
        i+=1; continue
    seen_ids.add(vid)
    rows.append({
        "id": vid, "year": year, "make": make, "model": f"{model_base} E-{rng.randint(2,9)}",
        "variant": f"{kwh} kWh {trim}", "segment": seg, "battery_kwh": kwh,
        "chemistry": chem, "lab_range_km": lab, "cycle": cycle,
        "motor_kw": round(rng.uniform(m0,m1),1), "weight_kg": int(rng.uniform(w0,w1)),
        "cda": round(cda+rng.uniform(-0.04,0.06),2), "crr": crr,
        "charge_kw_max": round(min(kwh*rng.uniform(0.4,2.2), 320),1),
        "top_speed": int(rng.uniform(55,180)) if "4W" in seg else int(rng.uniform(50,130)),
        "price_inr": int(rng.uniform(p0,p1)//1000*1000),
        "provenance": "estimated"
    })
    i+=1

print(f"curated={len(curated)} total={len(rows)} estimated={len(rows)-len(curated)}")

# ---- sqlite (schema_versioned; tariffs_history append-only; owner aggregates preserved) ----
SCHEMA_VERSION = 4
FRESHNESS_SLA_DAYS = 45
# Regulator source per tariff geo (homepage-level receipts; deep circular links live
# in docs/VERIFICATION.md T2 and tools/data/refresh-tariffs.py SOURCES).
TARIFF_SOURCES = {
    "IN-MH": "https://www.merc.gov.in", "IN-DL": "https://www.derc.gov.in",
    "US-TX": "https://www.eia.gov", "US-MI": "https://www.eia.gov", "US-CA": "https://www.eia.gov",
    "DE": "https://www.bundesnetzagentur.de", "FR": "https://www.cre.fr", "GB": "https://www.ofgem.gov.uk",
    "CN": "https://www.nea.gov.cn", "JP": "https://www.meti.go.jp", "ID": "https://www.pln.co.id",
    "VN": "https://www.evn.com.vn", "TH": "https://www.eppo.go.th", "BR": "https://www.aneel.gov.br",
    "AE": "https://www.dewa.gov.ae", "SA": "https://www.se.com.sa", "AU": "https://www.aer.gov.au",
    "NL": "https://www.acm.nl", "NO": "https://www.nve.no", "ZA": "https://www.eskom.co.za",
    "MX": "https://www.cre.gob.mx", "PH": "https://www.doe.gov.ph", "NG": "https://www.nerc.gov.ng",
    "TR": "https://www.epdk.gov.tr", "KR": "https://www.kpx.or.kr",
}
dbp = DBDIR / "voltprecon.sqlite"
# Preserve owner aggregates + tariff history across rebuilds (append-only posture).
_old_aggs, _old_hist = [], []
if dbp.exists():
    try:
        _oc = sqlite3.connect(dbp)
        try: _old_aggs = _oc.execute("SELECT model_id, n, avg_km, updated_on FROM owner_aggregates").fetchall()
        except Exception: pass
        try: _old_hist = _oc.execute("SELECT code, as_of, source_url, payload FROM tariffs_history").fetchall()
        except Exception: pass
        _oc.close()
    except Exception: pass
import os
if dbp.exists(): os.remove(dbp)
con = sqlite3.connect(dbp)
con.execute("PRAGMA journal_mode=WAL")
c = con.cursor()
c.execute("CREATE TABLE schema_version(version INT PRIMARY KEY, upgraded_on TEXT)")
c.execute("INSERT INTO schema_version VALUES (?,?)", (SCHEMA_VERSION, tariffs["_meta"].get("as_of", "2026-04-15")))
c.execute("CREATE TABLE models(id TEXT PRIMARY KEY, year INT, make TEXT, model TEXT, variant TEXT, segment TEXT, battery_kwh REAL, chemistry TEXT, lab_range_km REAL, cycle TEXT, motor_kw REAL, weight_kg REAL, cda REAL, crr REAL, charge_kw_max REAL, top_speed INT, price_inr INT, provenance TEXT, source_url TEXT, verified_on TEXT, source_pdf_url TEXT, cert_id TEXT, price_geo TEXT, price_type TEXT, voltage_class TEXT, heat_pump INT, v2g_capable INT, buyable INT)")
for m in rows:
    c.execute("INSERT INTO models VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (m["id"],m["year"],m["make"],m["model"],m["variant"],m["segment"],m["battery_kwh"],m["chemistry"],m["lab_range_km"],m["cycle"],m["motor_kw"],m["weight_kg"],m["cda"],m["crr"],m["charge_kw_max"],m["top_speed"],m.get("price_inr",0),m.get("provenance","estimated"),m.get("source_url",""),m.get("verified_on",""),m.get("source_pdf_url",""),m.get("cert_id",""),m.get("price_geo",""),m.get("price_type",""),m.get("voltage_class",""),1 if m.get("heat_pump") else 0,1 if m.get("v2g_capable") else 0,1 if m.get("buyable",True) else 0))
c.execute("CREATE TABLE tariffs(code TEXT PRIMARY KEY, payload TEXT)")
for t in tariffs["countries"]:
    c.execute("INSERT INTO tariffs VALUES (?,?)", (t["code"], json.dumps(t)))
c.execute("CREATE TABLE tariffs_history(code TEXT, as_of TEXT, source_url TEXT, payload TEXT, PRIMARY KEY(code, as_of))")
_seen_hist = {(code, asof) for (code, asof, _s, _p) in _old_hist}
for t in tariffs["countries"]:
    asof = tariffs["_meta"].get("as_of", "2026-04-15")
    if (t["code"], asof) not in _seen_hist:
        c.execute("INSERT INTO tariffs_history VALUES (?,?,?,?)", (t["code"], asof, TARIFF_SOURCES.get(t["code"], ""), json.dumps(t)))
for (code, asof, src, pay) in _old_hist:
    try: c.execute("INSERT OR IGNORE INTO tariffs_history VALUES (?,?,?,?)", (code, asof, src, pay))
    except Exception: pass
c.execute("CREATE TABLE subsidies(name TEXT, payload TEXT)")
for s in subs["schemes"]:
    c.execute("INSERT INTO subsidies VALUES (?,?)", (s["name"], json.dumps(s)))
c.execute("CREATE TABLE chemistries(id TEXT PRIMARY KEY, payload TEXT)")
for ch in chems["chemistries"]:
    c.execute("INSERT INTO chemistries VALUES (?,?)", (ch["id"], json.dumps(ch)))
# Owner-verified aggregates (rollup-owners.py writes these; generator preserves + ships them).
c.execute("CREATE TABLE owner_aggregates(model_id TEXT PRIMARY KEY, n INT, avg_km REAL, updated_on TEXT)")
_agg_path = ROOT / "tools" / "data" / "owner_aggregates.json"
_file_aggs = {}
try:
    if _agg_path.exists():
        for _a in json.loads(_agg_path.read_text(encoding="utf-8")).get("aggregates", []):
            _file_aggs[_a["model_id"]] = _a
except Exception: pass
_merged = {mid: {"n": n, "avg_km": avg, "updated_on": upd} for (mid, n, avg, upd) in _old_aggs}
_merged.update({mid: {"n": a["n"], "avg_km": a["avg_km"], "updated_on": a.get("updated_on", "")} for mid, a in _file_aggs.items()})
for mid, a in _merged.items():
    c.execute("INSERT INTO owner_aggregates VALUES (?,?,?,?)", (mid, a["n"], a["avg_km"], a["updated_on"]))
c.execute("CREATE INDEX idx_models_seg ON models(segment)"); c.execute("CREATE INDEX idx_models_make ON models(make)")
con.commit()
# full-text for picker
c.execute("CREATE VIRTUAL TABLE IF NOT EXISTS models_fts USING fts5(id, make, model, variant)")
for m in rows:
    c.execute("INSERT INTO models_fts VALUES (?,?,?,?)", (m["id"],m["make"],m["model"],m["variant"]))
con.commit(); con.close()

# ---- lightweight web bundle (curated full + estimated index) ----
_verification = {"t0_tests": 14, "t1_curated": len(curated), "t2_tariff_as_of": tariffs["_meta"].get("as_of", "2026-04-15"), "t2_affirmed_on": tariffs["_meta"].get("affirmed_on", tariffs["_meta"].get("as_of", "2026-04-15")), "t2_next_due": tariffs["_meta"].get("next_due", ""), "t2_affirmed_by": tariffs["_meta"].get("affirmed_by", ""), "t2_sla_days": FRESHNESS_SLA_DAYS, "t3_estimated": len(rows) - len(curated), "t3_seed": 42, "t5_realtime_claimed": False, "fx": tariffs["_meta"].get("fx_2026_04", {"INR": 83.5}), "schema_version": SCHEMA_VERSION}
bundle = {"meta": {"total": len(rows), "curated": len(curated), "as_of": "2026-04-15", "db_bytes": 0, "schema_version": SCHEMA_VERSION, "verification": _verification, "owner_aggregates": len(_merged)},
          "tariffs": tariffs["countries"], "subsidies": subs["schemes"], "chemistries": chems["chemistries"],
          "models_curated": curated,
          "models_index": [{"id":m["id"],"y":m["year"],"mk":m["make"],"mo":m["model"],"v":m["variant"],"s":m["segment"],"kwh":m["battery_kwh"],"ch":m["chemistry"],"lab":m["lab_range_km"],"cy":m["cycle"],"inr":m.get("price_inr",0),"p":m.get("provenance","estimated")} for m in rows]}
bundle["meta"]["db_bytes"] = dbp.stat().st_size if dbp.exists() else 0
(WEBDIR / "data.bundle.json").write_text(json.dumps(bundle, separators=(",",":")), encoding="utf-8")
print(f"wrote {dbp} ({dbp.stat().st_size/1024:.0f} KB) + data.bundle.json ({(WEBDIR/'data.bundle.json').stat().st_size/1024:.0f} KB)")

# coverage
from collections import Counter
print("segments:", dict(Counter(m["segment"] for m in rows)))
print("provenance:", dict(Counter(m.get("provenance") for m in rows)))

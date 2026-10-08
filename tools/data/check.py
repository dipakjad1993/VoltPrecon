"""
VoltPrecon data-pipeline guard — enterprise edition (Oct-2026).
- curated count MUST equal bundle meta.curated AND CI-expected value
  (change ONLY via explicit PR that bumps EXPECTED_CURATED here + docs/CHANGELOG.md).
- every estimated row MUST be renderable with confidence interval.
- ENTERPRISE: curated rows need source_url + source_pdf_url + cert_id + verified_on + price_geo/type + voltage_class + buyable;
  IDs must be trimmed slugs; SQLite schema_version + tariffs_history + owner_aggregates;
  tariff snapshot affirmed_on within 45-day SLA; ban on 'real-time' claims without SLA feed.
Run: python tools/data/check.py
"""
import json, pathlib, sys, sqlite3, datetime, re

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXPECTED_CURATED = 78
EXPECTED_SCHEMA = 4
FRESHNESS_SLA_DAYS = 45
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*-\d+-\d{4}(?:-[a-z0-9]+)?$|^[a-z0-9-]+-\d+-\d{4}$|^[a-z0-9][a-z0-9\-]*[a-z0-9]$")

curated = json.loads((ROOT / "packages/data/src/models.curated.json").read_text(encoding="utf-8"))["models"]
bundle = json.loads((ROOT / "apps/web/data.bundle.json").read_text(encoding="utf-8"))

errs = []
if len(curated) != EXPECTED_CURATED:
    errs.append(f"curated count {len(curated)} != EXPECTED_CURATED {EXPECTED_CURATED} — update check.py + CHANGELOG in same PR")
if bundle["meta"]["curated"] != len(curated):
    errs.append(f"bundle meta.curated {bundle['meta']['curated']} != curated file {len(curated)} — re-run generator.py")
if bundle["meta"]["total"] != len(bundle["models_index"]):
    errs.append("bundle meta.total != models_index length")
ids = [m["id"] for m in curated]
if len(set(ids)) != len(ids):
    errs.append("duplicate curated ids")
for m in curated:
    if m["id"] != m["id"].strip():
        errs.append(f"curated id has whitespace: {repr(m['id'])}"); break
    if " " in m["id"]:
        errs.append(f"curated id contains space: {repr(m['id'])}"); break
    if m.get("provenance") != "curated":
        errs.append(f"curated file row {m['id']} provenance != curated"); break
    if m.get("buyable") is False:
        errs.append(f"curated row {m['id']} buyable=False — move concept/discontinued to estimated"); break
for m in bundle["models_index"]:
    if m.get("p") not in ("curated", "estimated"):
        errs.append(f"row {m.get('id')} missing provenance"); break
    if m.get("p") == "estimated" and not (m.get("kwh") and m.get("lab")):
        errs.append(f"estimated row {m.get('id')} lacks kwh/lab for confidence band"); break
COLLIDING_BADGES = {"city", "swift", "spark", "bolt", "volt", "eco", "pulsar", "activa", "jupiter", "chetak", "nexon", "punch", "curvv", "thar", "creta", "venue", "seltos", "sonet", "baleno", "glanza", "zs", "atto", "seal", "dolphin", "ioniq", "ev6", "ev3", "ex30", "model", "cybertruck", "e34", "vf8", "vfe34", "tiago", "tigor", "ace", "treo", "ape", "iqube", "rizta", "s1", "roadster", "f77", "rv400", "mantis", "nexus", "faast", "indie", "one", "nqi", "e8s", "ce04", "delmar", "s2", "mache", "equinox", "r2", "air", "taycan", "et5", "p7", "seagull", "evitara", "xuv400", "windsor", "comet", "ec3", "500e", "fx", "ultrabee", "be6", "xev", "harrier", "vitara", "access", "aera", "hiload", "bz4x", "ev9", "enyaq"}
for m in bundle["models_index"]:
    if m.get("p") == "estimated":
        tokens = {w.strip(".-") for w in f"{m['mo']} {m['v']}".lower().replace("-", " ").split()}
        hit = tokens & COLLIDING_BADGES
        if hit:
            errs.append(f"estimated row {m['id']} borrows real OEM badge(s) {sorted(hit)} — rename to segment-descriptive"); break
for m in curated:
    for f in ("source_url", "source_pdf_url", "cert_id", "verified_on", "price_geo", "price_type", "voltage_class"):
        if not m.get(f):
            errs.append(f"curated {m['id']} missing {f}"); break
    else:
        continue
    break
    if not m.get("source_url"): errs.append(f"curated {m['id']} missing source_url"); break
    if not m.get("verified_on"): errs.append(f"curated {m['id']} missing verified_on"); break
try:
    tmeta = json.loads((ROOT / "packages/data/src/tariffs.json").read_text(encoding="utf-8"))["_meta"]
    stamp = tmeta.get("affirmed_on") or tmeta["as_of"]
    as_of = datetime.date.fromisoformat(stamp)
    age = (datetime.date.today() - as_of).days
    if age > FRESHNESS_SLA_DAYS:
        errs.append(f"tariff snapshot last reviewed {stamp} ({age}d ago) — SLA is {FRESHNESS_SLA_DAYS}d: run tools/data/refresh-tariffs.py --affirm")
    for f in ("affirmed_by", "next_due", "sla_days"):
        if f not in tmeta:
            errs.append(f"tariffs _meta missing {f}"); break
except Exception as e:
    errs.append(f"freshness gate unreadable: {e}")
# Ban unverified real-time language in product/pages/API (snapshots + SLA only until feed with SLA exists)
try:
    ban_files = [ROOT/"README.md", ROOT/"docs/VERIFICATION.md", ROOT/"packages/api/src/server.js", ROOT/"apps/web/app.js"]
    NEG = ("believ", "slogan", "not a", "nowhere", "never", "not claimed", "no serious", "snapshots with", "ban")
    for bf in ban_files:
        if bf.exists():
            for line in bf.read_text(encoding="utf-8").lower().splitlines():
                for bad in ["real-time tracking", "real time tracking", "100% verified real-time"]:
                    if bad in line and not any(n in line for n in NEG):
                        errs.append(f"{bf.name} contains banned marketing claim '{bad}': {line.strip()[:120]} — use ladder language"); break
                else:
                    continue
                break
except Exception as e:
    errs.append(f"realtime-ban gate failed: {e}")
try:
    con = sqlite3.connect(ROOT / "packages/data/db/voltprecon.sqlite")
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for need in ("schema_version", "tariffs_history", "owner_aggregates", "models_fts"):
        if need not in tables: errs.append(f"sqlite missing table {need} — re-run generator.py")
    ver = con.execute("SELECT version FROM schema_version").fetchone()
    if not ver or ver[0] != EXPECTED_SCHEMA:
        errs.append(f"sqlite schema_version {ver} != EXPECTED_SCHEMA {EXPECTED_SCHEMA}")
    cols = {r[1] for r in con.execute("PRAGMA table_info(models)")}
    for need in ("source_url", "verified_on", "source_pdf_url", "cert_id", "price_geo", "voltage_class", "v2g_capable", "buyable"):
        if need not in cols: errs.append(f"models missing column {need}")
    if con.execute("SELECT COUNT(*) FROM tariffs_history").fetchone()[0] == 0:
        errs.append("tariffs_history empty — snapshots must be append-only")
    con.close()
except Exception as e:
    errs.append(f"sqlite governance check failed: {e}")
# Enterprise 2026: FX must be explicit (no silent 83.5), compare renderer must not
# reference undefined vars, method hub must cover fan-out intents.
try:
    v = bundle["meta"].get("verification", {})
    if not (v.get("fx") or {}).get("INR"):
        errs.append("bundle verification.fx.INR missing — FX must ride every estimate (see tariffs.json _meta.fx_2026_04)")
    rev = (ROOT / "tools" / "seo" / "render-ev.js").read_text(encoding="utf-8")
    _cmp = rev.split("renderComparePage", 1)[1] if "renderComparePage" in rev else ""
    if "esc(m.cert_id || m.cy)} · PDF receipt" in _cmp:
        errs.append("render-ev.js compare renderer references undefined m.* — use a.cert_id/b.cert_id")
    if "knowsAbout" not in rev:
        errs.append("render-ev.js missing Organization knowsAbout entity (2026 citation tie-breaker)")
except Exception as e:
    errs.append(f"enterprise gate failed: {e}")

if errs:
    print("DATA CHECK FAILED:"); [print(" -", e) for e in errs]; sys.exit(1)
print(f"DATA OK — curated={len(curated)} total={bundle['meta']['total']} estimated={bundle['meta']['total']-len(curated)} schema={EXPECTED_SCHEMA}")

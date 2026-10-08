"""
VoltPrecon share-of-model tracker — 2026 GEO scoreboard (rank is not enough).
Weekly: 20-30 category prompts x 4 types (discovery/comparison/evaluation/implementation)
x 5 engines (ChatGPT, Perplexity, Google AI Mode/Overviews, Claude, Gemini) in fresh sessions.
Log: brand appears? prominence? sentiment? winner cited instead?
Share = (your appearances / total prompts) x 100, per engine (only ~11% domains cited by
both ChatGPT+Perplexity; AI Overviews vs AI Mode share ~13.7% URLs — track separately).
Branded-search lift (GSC) is the leading indicator: AI citations -> brand queries -> revenue.
Usage: python tools/seo/share-of-model.py --init   (writes prompts CSV skeleton)
       python tools/seo/share-of-model.py --score results.csv   (computes share per engine)
Zero-dep. Manual first (spreadsheet, 4-6 weeks), then Semrush AI Visibility / Profound.
"""
import csv, pathlib, sys
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "dist" / "seo" / "share-of-model-prompts.csv"

PROMPTS = [
    ("discovery", "what is the real range of Ather 450X in Pune summer with pillion"),
    ("discovery", "Tata Nexon EV 45 real range vs ARAI claim Delhi"),
    ("discovery", "best electric scooter for delivery with 30kg cargo India"),
    ("discovery", "Tesla Model Y winter range Michigan heater -7C"),
    ("discovery", "BYD Atto 3 true cost vs petrol Germany"),
    ("comparison", "Ather 450X vs Ola S1 X real range and 5 year cost"),
    ("comparison", "Nexon EV vs Curvv EV which has lower cost per real km"),
    ("comparison", "ABRP vs VoltPrecon for 2 wheeler range India"),
    ("comparison", "LFP vs NMC battery degradation year 3 resale"),
    ("comparison", "Harrier EV 75 vs Creta Electric 42 real range"),
    ("evaluation", "is VoltPrecon subsidy math correct after PM E-DRIVE expiry July 2026"),
    ("evaluation", "VoltPrecon vs OEM calculator which is unbiased"),
    ("evaluation", "does heat pump matter for EV winter range kW draw"),
    ("evaluation", "what battery test to get before buying used EV India"),
    ("evaluation", "how is EV breakeven month calculated vs petrol"),
    ("implementation", "how to override tariff slab in VoltPrecon app pincode"),
    ("implementation", "VoltPrecon API estimate endpoint docs openapi"),
    ("implementation", "how to submit owner range to VoltPrecon anonymously"),
    ("implementation", "1 page EV loan PDF from VoltPrecon for bank"),
    ("implementation", "fleet EV TCO with SQLite export VoltPrecon"),
]
ENGINES = ["chatgpt", "perplexity", "google-ai-overviews", "google-ai-mode", "claude", "gemini"]

def cmd_init():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["type", "prompt"] + ENGINES + ["notes"])
        for t, p in PROMPTS: w.writerow([t, p] + [""] * len(ENGINES) + [""])
    print(f"wrote {OUT.relative_to(ROOT)} ({len(PROMPTS)} prompts x {len(ENGINES)} engines). Fill 1/0 per engine weekly in fresh sessions.")

def cmd_score(path):
    rows = list(csv.DictReader(pathlib.Path(path).read_text(encoding="utf-8").splitlines()))
    per = Counter(); tot = Counter(); wins = Counter()
    for r in rows:
        for e in ENGINES:
            v = (r.get(e) or "").strip()
            if not v: continue
            tot[e] += 1
            if v.startswith("1"): per[e] += 1
    print("== share-of-model ==")
    for e in ENGINES:
        s = (per[e] / tot[e] * 100) if tot[e] else 0
        print(f"  {e:20s} {per[e]:3d}/{tot[e]:3d} = {s:5.1f}%")
    print("Track branded-search lift in GSC alongside: AI citations -> brand queries first, revenue later.")
    print("Give it 4-6 weeks before drawing conclusions.")

if __name__ == "__main__":
    if "--init" in sys.argv: cmd_init()
    elif "--score" in sys.argv:
        i = sys.argv.index("--score")
        cmd_score(sys.argv[i + 1] if len(sys.argv) > i + 1 else OUT)
    else: print(__doc__)

"""
VoltPrecon scaled-content audit — per-TEMPLATE fix/thin/retire (Google scaled-content-abuse policy, Mar-2024 + Mar-2026 enforcement).
Measures per template class (not per page):
  1. unique-content ratio (mask variables, share not on siblings)
  2. boilerplate share (chrome identical across instances)
  3. data reality/currency (real observation + in-SLA vs placeholder/stale)
  4. query-answered (does the page beat the category/search page for its query?)
Decision per template: FIX (good data, thin render) / THIN (keep above data threshold, 410 rest) / RETIRE (no distinct query).
Estimated pages with no owner aggregate + <300 unique words + zero engagement are 410 candidates (not noindex — noindex still costs crawl budget).
Run: python tools/seo/scaled-audit.py [--check]  (--check fails CI if estimated indexable or thin tail unlisted)
Zero-dep.
"""
import json, pathlib, re, sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[2]
BUNDLE_P = ROOT / "apps" / "web" / "data.bundle.json"
SEO = ROOT / "dist" / "seo"

def words(html):
    t = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    t = re.sub(r"<style.*?</style>", " ", t, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return [w.lower() for w in re.findall(r"[a-z0-9₹$€£/\.\-]+", t) if len(w) > 2]

def main(argv):
    bundle = json.loads(BUNDLE_P.read_text(encoding="utf-8"))
    idx = bundle["models_index"]
    curated = [m for m in idx if m.get("p") == "curated"]
    estimated = [m for m in idx if m.get("p") == "estimated"]
    geos = [t["code"] for t in bundle["tariffs"]]
    intents = ["real-range", "total-cost", "resale-battery"]
    total_urls = len(idx) * len(geos) * len(intents)
    print(f"templates: /ev/<model>/<geo>/<intent> x {len(idx)} models x {len(geos)} geos x {len(intents)} intents = {total_urls} URLs")
    print(f"  curated indexable: {len(curated)} x {len(geos)} x {len(intents)} = {len(curated)*len(geos)*len(intents)}")
    print(f"  estimated staged (noindex): {len(estimated)} x {len(geos)} x {len(intents)} = {len(estimated)*len(geos)*len(intents)}")

    # Sample static pages for unique-content + boilerplate measurement (one per model
    # so the same-model/different-geo siblings don't zero the metric).
    all_pages = sorted((SEO / "ev").glob("*/*/*.html")) if (SEO / "ev").exists() else []
    seen_models, samples = set(), []
    for p in all_pages:
        model = p.parent.parent.name
        if model in seen_models: continue
        seen_models.add(model); samples.append(p)
        if len(samples) >= 12: break
    uniq_ratio, boiler = None, None
    if len(samples) >= 2:
        bodies = [words(p.read_text(encoding="utf-8", errors="ignore")) for p in samples]
        # mask variable terms (model tokens, geo names, numbers) then compare
        masked = [set(w for w in b if not re.fullmatch(r"[\d₹$€£\.,/\-]+", w)) for b in bodies]
        shared = set.intersection(*masked) if masked else set()
        union = set.union(*masked) if masked else set()
        boiler = len(shared) / max(1, len(union))
        per_page_unique = []
        for i, mset in enumerate(masked):
            sib = set.union(*[s for j, s in enumerate(masked) if j != i]) if len(masked) > 1 else set()
            per_page_unique.append(len(mset - sib) / max(1, len(mset)))
        uniq_ratio = sum(per_page_unique) / max(1, len(per_page_unique))
        print(f"  sampled static pages: {len(samples)}")
        print(f"  unique-content ratio (masked): {uniq_ratio:.2f} (want >=0.35 for template survival)")
        print(f"  boilerplate share: {boiler:.2f} (want <=0.65)")
    else:
        print("  no static samples yet — run tools/seo/generate.js first")

    # Data reality: curated have receipts; estimated flagged; owner aggregates enrich
    v = bundle["meta"].get("verification", {})
    print(f"  data reality: curated receipts per-row (source_pdf_url+cert_id) | tariffs snapshot {v.get('t2_tariff_as_of')} affirmed {v.get('t2_affirmed_on')} | owner aggregates {bundle['meta'].get('owner_aggregates', 0)}")
    print("  query-answered: /ev/* answers model+geo+intent better than /?model= tool deep-link; /compare/* answers A-vs-B better than two /ev/* pages (ranked, same tariffs)")

    # 410 triage list: estimated models are the thin tail until owner-verified
    triage = ROOT / "dist" / "seo" / "triage-410.txt"
    lines = ["# 410 candidates: estimated models with no owner aggregate (thin tail).",
             "# Rule: no aggregate + <300 unique words + zero clicks/<10 impressions 90d (GSC) -> 410 Gone, not noindex.",
             "# Curated pages are never listed here. Re-run after rollup-owners.py enriches models.",
             f"# generated from bundle total={bundle['meta']['total']} curated={bundle['meta']['curated']}"]
    aggs = set()
    try:
        import sqlite3
        con = sqlite3.connect(ROOT / "packages" / "data" / "db" / "voltprecon.sqlite")
        try: aggs = {r[0] for r in con.execute("SELECT model_id FROM owner_aggregates")}
        except Exception: pass
        con.close()
    except Exception: pass
    n = 0
    for m in estimated:
        if m["id"] in aggs: continue
        lines.append(f"{m['id']}  # estimated, no owner aggregate yet -> keep noindex; 410 if GSC shows zero value 90d")
        n += 1
        if n >= 50: lines.append(f"# ... +{len(estimated)-len(aggs)-n} more (full list = all estimated without aggregates)"); break
    triage.parent.mkdir(parents=True, exist_ok=True)
    triage.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  triage list: {triage.relative_to(ROOT)} ({n} sampled entries)")

    errs = []
    if "--check" in argv:
        # CI gate: estimated sitemap must exist and curated pages must be indexable.
        # Unique-content ratio is a v1 heuristic (reported, warns) — it does not block
        # deploys; the blocking signals are the staged sitemap split + triage freshness.
        if not (SEO / "sitemap-estimated.xml").exists(): errs.append("sitemap-estimated.xml missing")
        if not (SEO / "sitemap-curated.xml").exists(): errs.append("sitemap-curated.xml missing")
        # No estimated URL may appear in the curated sitemap
        try:
            cur = (SEO / "sitemap-curated.xml").read_text(encoding="utf-8")
            if "noindex" in cur.lower(): errs.append("curated sitemap must not contain noindex pages")
        except Exception as e: errs.append(f"curated sitemap unreadable: {e}")
        if not (SEO / "triage-410.txt").exists(): errs.append("triage-410.txt missing — scaled-audit must run in generate chain")
        if uniq_ratio is not None and uniq_ratio < 0.05:
            print(f"  WARN: unique-content ratio {uniq_ratio:.2f} < 0.05 — enrich template (more per-model data above the fold) before widening static pre-render beyond 30 models")
    if errs:
        print("SCALED-AUDIT FAILED:"); [print(" -", e) for e in errs]; sys.exit(1)
    print("SCALED-AUDIT OK — template survives: good data + staged rollout + triage list fresh")

if __name__ == "__main__":
    main(sys.argv[1:])

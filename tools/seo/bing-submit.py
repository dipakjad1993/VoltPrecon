"""
VoltPrecon search-engine ping — Google + Bing sitemap submission (Copilot draws from Bing; don't be Google-only).
Reads dist/seo/ping-sitemaps.txt (written by generate.js) and GETs each line.
Run after deploy: python tools/seo/bing-submit.py  (urllib only, zero-dep).
Bing Webmaster first-time setup: submit sitemap-curated.xml as primary, then sitemap.xml.
"""
import pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
PING = ROOT / "dist" / "seo" / "ping-sitemaps.txt"

def main():
    if not PING.exists():
        print(f"no {PING.relative_to(ROOT)} — run tools/seo/generate.js first"); return
    for line in PING.read_text(encoding="utf-8").splitlines():
        url = line.split(" ", 1)[1] if line.startswith("GET ") else line.strip()
        if not url: continue
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                print(f"PING {r.status} {url}")
        except Exception as e:
            print(f"PING FAIL {url} ({str(e)[:100]})")

if __name__ == "__main__":
    main()

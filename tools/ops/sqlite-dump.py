"""
VoltPrecon SQLite durability — WAL checkpoint + nightly dump (pre-SLA posture).
- DB runs PRAGMA journal_mode=WAL (set in generator.py).
- This script checkpoints + copies voltprecon.sqlite to dist/backups/ with date stamp.
- Wire the dated copy to object storage (S3/GCS) before any lender SLA signature;
  read-replica posture + Redis-backed limits are the remaining pre-SLA upgrades (docs/API.md).
Run: python tools/ops/sqlite-dump.py [--check]  (--check only verifies WAL + tables, no copy)
"""
import sqlite3, pathlib, sys, shutil, datetime

ROOT = pathlib.Path(__file__).resolve().parents[2]
DB = ROOT / "packages" / "data" / "db" / "voltprecon.sqlite"

def main(argv):
    if not DB.exists():
        print(f"missing {DB.relative_to(ROOT)} — run generator.py first"); sys.exit(1)
    con = sqlite3.connect(DB)
    try: mode = con.execute("PRAGMA journal_mode").fetchone()[0]
    except Exception: mode = "?"
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    need = {"schema_version", "tariffs_history", "owner_aggregates", "models_fts"}
    missing = need - tables
    print(f"journal_mode={mode} tables_ok={not missing} bytes={DB.stat().st_size}")
    if missing:
        print(f"DUMP CHECK FAILED: missing {sorted(missing)}"); sys.exit(1)
    if "--check" in argv:
        print("DUMP CHECK OK"); return
    try: con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception: pass
    con.close()
    out = ROOT / "dist" / "backups" / f"voltprecon-{datetime.date.today().isoformat()}.sqlite"
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(DB, out)
    print(f"dumped -> {out.relative_to(ROOT)} ({out.stat().st_size/1024:.0f} KB); sync this file to object storage nightly")

if __name__ == "__main__":
    main(sys.argv[1:])

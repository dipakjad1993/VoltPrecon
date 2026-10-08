# Data-retention statement (what we keep, how long, why)

VoltPrecon collects **anonymous aggregates only** — no accounts, no cookies, no
cross-site trackers, no VINs, no emails. This page is the complete list.

| Data | Where | Retention | Why |
|---|---|---|---|
| Owner range reports (`modelId`, `km`, `cond`) | API memory → nightly JSONL export | Raw JSONL **≤ 90 days**, then only the averaged aggregate survives (`owner_aggregates`: n + avg_km + updated_on) | T4 verification ladder; averages can't identify anyone |
| Anonymous product events (`search_zero_results`, `estimate_completed`, …) | API 500-ring buffer + structured access logs | Raw events **≤ 90 days**; weekly rollup (`tools/ops/log-rollup.py`) keeps only counts (zero-result terms → data backlog, completions by model/geo, 4xx/5xx by route, p95 latencies) | Replaces an analytics vendor while keeping the privacy story |
| Structured access logs (method, path, status, ms, IP, request-id) | stdout → log shipper | **≤ 90 days** | SLA measurement (`docs/API.md`), abuse response |
| Owner reports in the browser | `localStorage` on the user's own device | Until the user clears it | Offline-first aggregates; never leaves the device except the anonymous beacon |

What we **never** store server-side: photos/CSV uploads (parsed on-device; OCR
weights are the only network fetch, ~2MB, cached), pincodes (used once to render
a slab hint), precise location, or anything resembling identity. Deletion
requests: there is nothing keyed to a person to delete — email
privacy@voltprecon.app if you believe otherwise and we will prove it from logs.

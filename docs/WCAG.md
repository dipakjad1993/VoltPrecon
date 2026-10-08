# Accessibility conformance note (WCAG 2.2 AA target, formal pass Oct-2026)

One formal pass, published, re-run on every stage-2/3 UI change. Tooling: manual
keyboard + screen-reader walkthrough (NVDA/VoiceOver), `?lang=` matrix, 200% zoom,
`prefers-reduced-motion` on/off. No third-party audit yet — this note is honest
about that (procurement checklists accept a dated self-assessment + roadmap).

## Pass results (2026-10-08)

| Checkpoint | Status | Evidence |
|---|---|---|
| Keyboard: full pick → ANALYZE → analysis → outputs flow, all buttons/rows focusable | ✅ pass | `.hit` rows are `tabindex=0 role=option` with Enter/Space handlers; smoke test asserts wiring |
| Screen reader: stage stepper uses `aria-current="step"`; live regions on slab/conf/owner hints | ✅ pass | `aria-live="polite"` on `#slabNote`, `#confBand`, `#ownAgg`, `#ocrOut` |
| Canvas breakeven chart has a **data-table fallback** for SR users | ✅ pass | `#chartFallback` table (month, cum-EV, cum-ICE, breakeven) rendered next to every chart draw |
| Emoji theme toggle has a text label for SR users | ✅ pass | `aria-label` + `title` + visible `.theme-label` text ("Light / dark mode") |
| `?lang=` URLs: **canonical stays clean** (`https://voltprecon.app/`, no query); languages served via `hreflang` variants | ✅ decision | `index.html` carries `x-default` + 5 `hreflang` alternates; noindexed `?lang=` duplication by policy |
| Contrast: M3 tonal schemes, tabular numerals, visible focus rings | ✅ pass | `styles.css` tokens; focus `:focus-visible` ring |
| Reduced motion: smooth-scroll + transitions gated | ✅ pass | `@media (prefers-reduced-motion: reduce)` kills scroll-behavior/transitions |
| Zoom 200% / 360px wide: no clipped CTA, tables scroll | ✅ pass | `.go` full-width; `.spec` tables `overflow-x:auto` wrapper |

## Known gaps (roadmap, dated)

- No independent WCAG audit (target: before first public-sector bid). Contact for the VPAT request: accessibility@voltprecon.app.
- Deep content stays English (6-language UI chrome is the deliberate 80/20).
- OCR photo flow needs a `file://` + offline_weights failure path test in smoke (microcopy exists; assertion pending).

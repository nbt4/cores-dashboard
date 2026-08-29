# Cores Dashboard Agent Rules

## Mandatory suite design contract

- Before any UI work, read `../docs/DESIGN_SYSTEM.md` and `../theme/README.md` when this repository is checked out in the `cores` umbrella. In a standalone checkout, use the canonical design documentation in `github.com/nbt4/cores`.
- `web/src/cores-theme.css` and `web/src/lib/cores-design.ts` are generated artifacts. Never edit them directly; change the umbrella sources and run `./scripts/sync-design-system.sh` there.
- Use only suite tokens and `suite-*` primitives for typography, colors, tables, forms, dropdowns, scrollbars, shell geometry and dashboards. Do not introduce a dashboard-only visual language.
- Dashboard greetings must use `suiteGreeting()`, and profile display names take precedence over usernames.
- Before release, run the umbrella design check plus this repository's web build and Go tests. Update README documentation with any behavior or UI contract change.

# Cores Dashboard Agent Rules

## Autonomie und dauerhafte Operationsfreigabe

Der Nutzer hat diese Freigabe am 12. Oktober 2026 ausdrücklich für das
Cores-Dachrepository und alle Cores-Dienst-Repositories erteilt. Dieser Abschnitt
hat bei widersprüchlichen Freigabe-, Draft-, Merge-, Deployment- oder
TSU-Vorgaben Vorrang. Er betrifft die Arbeit des Entwicklungsagenten; fachliche
Benutzerrechte, OAuth-Scopes und Bestätigungen in den Anwendungen bleiben gültig.

- Beauftragte Arbeiten eigenständig bis zum geprüften und veröffentlichten Ergebnis
  abschließen. Keine erneute Einzelfreigabe für die folgenden Operationsschritte
  verlangen, wenn sie zum Auftrag gehören.
- Änderungen committen und zu GitHub pushen; PRs erstellen, reviewen, freigeben,
  von Draft auf ready setzen und nach erfolgreichen Prüfungen selbst mergen.
  Ein menschlicher Merge oder eine separate Paperclip-Review-Aufgabe ist keine Pflicht.
  Für umfangreiche Änderungen ein unabhängiges Review durch einen Review-Agenten
  nutzen und konkrete Befunde vor dem Merge beheben.
- Auf Arbeitsbranches oder in Worktrees entwickeln. `main` nach erfolgreicher
  Validierung eigenständig aktualisieren, bevorzugt durch einen PR-Merge.
  Keine fremden Änderungen überschreiben oder ungeprüft force-pushen.
- Docker-Abbilder aus committed Quellcode bauen und nach Prüfung des zuletzt
  veröffentlichten Tags mit der nächsten fortlaufenden Version und `latest` nach
  Docker Hub pushen. Submodul-Zeiger, Versionspins und Release-Dokumentation synchron halten.
- Über die vorkonfigurierten Komodo- und SSH-Zugänge auf `docker03` eigenständig
  deployen, Images pullen und die betroffenen Dienste starten, stoppen oder neu starten.
  Laufzeitumgebung und Volumes erhalten; anschließend Image, Quellrevision und
  Healthchecks prüfen. Andere Dienste nur ändern, wenn der Auftrag es erfordert.
- Build-, CI-, Deployment-Konfiguration und `AGENTS.md` im Aufgabenumfang pflegen.
  Prüfungen dürfen dadurch nicht ausgeschaltet oder zur Verdeckung von Fehlern
  gelockert werden. Fehler selbst diagnostizieren und beheben; erst bei tatsächlich
  fehlendem Zugang, fehlender Information oder unklarem Umfang nachfragen.
- Tests passend zur Änderung durchführen und die echte Ausgabe protokollieren.
  Code- und Release-Gates weiterhin in der dokumentierten Reihenfolge ausführen;
  Go-Beweisläufe mit `-count=1`. Reine Dokumentations- oder `AGENTS.md`-Änderungen
  brauchen Diff-/Strukturprüfungen, keinen erneuten Anwendungsbuild oder Image-Release.
- Branches verständlich nach dem Thema benennen; Conventional Commits verwenden.
  Eine TSU-Nummer oder Paperclip-Aufgabe ist optional, kein Arbeits- oder Release-Gate.
- Bestehende Zugangsdaten nur über vorkonfigurierte Sessions, Laufzeitumgebungen
  oder Secret-Manager verwenden. Keine Secrets in Repository, PR, Kommentar oder Log
  schreiben; keine privaten Laufzeit- oder Produktionsdaten zu Testdaten machen.
- Destruktive Produktionsdatenänderungen und manuelle Schema-/Migrationseingriffe
  benötigen einen konkreten Auftrag dafür; die allgemeine Git-/Deployment-Freigabe
  ersetzt diesen Auftrag nicht. Datenbanktests ausschließlich lokal oder in einer
  isolierten Testumgebung ausführen. Große fachliche Umbauten bei unklarem Auftrag
  zunächst klären.

## Mandatory suite design contract

- Before any UI work, read `../docs/DESIGN_SYSTEM.md` and `../theme/README.md` when this repository is checked out in the `cores` umbrella. In a standalone checkout, use the canonical design documentation in `github.com/nbt4/cores`.
- `web/src/cores-theme.css` and `web/src/lib/cores-design.ts` are generated artifacts. Never edit them directly; change the umbrella sources and run `./scripts/sync-design-system.sh` there.
- Use only suite tokens and `suite-*` primitives for typography, colors, tables, forms, dropdowns, scrollbars, shell geometry and dashboards. Do not introduce a dashboard-only visual language.
- Dashboard greetings must use `suiteGreeting()`, and profile display names take precedence over usernames.
- Before release, run the umbrella design check plus this repository's web build and Go tests. Update README documentation with any behavior or UI contract change.

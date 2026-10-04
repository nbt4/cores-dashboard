# AGENTS.md — cores-dashboard

Hausregeln für KI-Agenten in diesem Repository. Vor der ersten Änderung vollständig
lesen. Der übergeordnete Ablauf steht im Paperclip-Dokument `workflow` auf
[TSU-3](/TSU/issues/TSU-3#document-workflow). Diese Datei ersetzt alle früheren
Agenten-Anweisungen in diesem Repository.

## 1. Was dieses Repository ist

- **Zweck:** Drei Rollen in einem Dienst: Anmeldung und Single-Sign-On für die ganze Suite, Suite-Administration (Benutzer, Rollen, Microsoft-Identitäten, Audit, Branding) und **öffentliches Gateway** vor allen anderen Cores. Port 8080, Abbild `nobentie/cores-dashboard`.
- **Sprache und Laufzeit:** Go 1.25 (Modul `coresdashboard`) + React/TypeScript (Node 22 im CI)
- **Rahmenwerk:** Backend: net/http mit eigenem Proxy, GORM, `zerolog`, `prometheus`. Frontend: React + Vite + TypeScript
- **Datenbank:** PostgreSQL 16, gemeinsame Suite-Datenbank. GORM mit `driver/postgres`. Eigene Migrationen in `migrations/`
- **Architektur-Doku:** [Cores — Architektur (Phase 1)](/TSU/issues/TSU-4#document-architecture)

## 2. Aufbau

| Pfad | Inhalt |
|---|---|
| `cmd/server/main.go` | Einstiegspunkt. Frontend-Build landet in `cmd/server/dist` |
| `internal/proxy` | Gateway: Prefix entfernen, `X-Forwarded-Prefix` setzen, HTTP/Assets/WebSocket weiterleiten |
| `internal/admin`, `internal/handlers` | Admin-APIs |
| `internal/microsoft` | Identitäts-Abgleich über `graph.microsoft.com` |
| `internal/audit` | Audit-Log |
| `internal/middleware` | Auth, CORS |
| `internal/models`, `internal/database` | Datenzugriff |
| `internal/metrics` | Prometheus |
| `web/` | React-SPA |
| `migrations/` | `000002_audit_log.up.sql`, `000003_microsoft_identity_sync.up.sql` |

Erzeugte Dateien, die **niemals von Hand** geändert werden:

- `web/src/cores-theme.css` — erzeugt durch `cores/scripts/sync-design-system.sh`
- `web/public/cores-theme.css` — dito
- `web/src/lib/cores-design.ts` — dito
- `web/src/lib/SuiteLanguageSwitcher.tsx` — dito
- `web/src/lib/cores-locales/` — dito
- `cmd/server/dist/` — Frontend-Build
- `web/package-lock.json`, `package-lock.json` — nur als Nebenwirkung eines freigegebenen Updates

## 3. Einrichten

```bash
cd web && npm ci && npm run build && cd ..
go mod download
# Datenbank: aus dem Dachrepository `cores` starten
#   cd ../cores && docker compose up -d postgres
```

Nötige Umgebungsvariablen: siehe `cores/.env.example` (verbindliche Quelle). Für dieses Repository besonders `CORES_JWT_SECRET`, `COOKIE_DOMAIN`, `CORES_ROUTING_MODE`, `ENCRYPTION_KEY`, die `M365_*`-Schlüssel und die `*CORE_URL`-Schlüssel der nachgelagerten Dienste. Werte kommen aus dem Paperclip-Secret-Store, nicht aus diesem Repository.

## 4. Test- und Build-Befehle

Diese Befehle sind das Test-Gate. **Alle müssen grün sein, bevor ein Pull Request
entsteht.** Reihenfolge einhalten — die schnellen Prüfungen zuerst.

| # | Gate | Befehl | Dauer (ca.) |
|---|---|---|---|
| 1 | Format | `gofmt -l .` (leere Ausgabe = grün) | < 10 s |
| 2 | Frontend-Lint | `cd web && npm run lint` | ~30 s |
| 3 | Frontend-Build und Typen | `cd web && npm run build` (`tsc -b && vite build`) | 1–2 min |
| 4 | Go-Build | `go build ./cmd/server` | ~30 s |
| 5 | Unit-Tests | `go test ./...` | < 1 min |
| 6 | Vet | `go vet ./...` | ~30 s |

Einzelne Datei testen: `go test ./internal/proxy -run TestName -v`

Das Frontend hat **kein** Test-Skript. `npm run lint` und `npm run build` sind hier die ganze Prüfung. Wer am Frontend etwas Fachliches ändert, beschreibt im PR, was von Hand geprüft wurde.

Regeln:

- **Neuer Code braucht neue Tests.** Ein Bugfix braucht einen Test, der ohne den Fix
  fehlschlägt.
- **Nie einen Test abschalten, überspringen oder lockern**, um das Gate grün zu
  bekommen. Ein roter Test ohne Bezug zur Änderung wird gemeldet, nicht entfernt.
- **Tests laufen gegen die lokale oder die Test-Datenbank. Nie gegen Produktion.**
  Eine eigene Testumgebung wird gerade aufgebaut (eigene Paperclip-Aufgabe). Bis sie
  steht: nur lokale Container mit eigenem Volume.
- Die **echte Ausgabe** wird in den Pull Request und auf die Paperclip-Aufgabe kopiert.

## 5. Code-Stil

- Format und Lint werden durch die Werkzeuge in Abschnitt 4 erzwungen. Kein Streit
  über Formatierung — der Formatierer entscheidet.
- **Dem umgebenden Code folgen.** Benennung, Ordnerstruktur, Fehlerbehandlung und
  Testmuster so übernehmen, wie sie in der berührten Datei schon sind.
- Benennung: PascalCase für Go-Exporte, camelCase für Lokales; React-Komponenten
  PascalCase, Hilfsmodule kebab-case.
- Fehlerbehandlung: Fehler zurückgeben und einwickeln (`%w`), am Rand in eine
  HTTP-Antwort übersetzen. Keine `panic` im Anfragepfad.
- Logging: `zerolog`, strukturiert. **Niemals** Token, Secrets oder Kundendaten.
- Routing kennt nur zwei Modi (`paths` oder `subdomains`, aus `CORES_ROUTING_MODE`).
  Mischbetrieb ist nicht vorgesehen und wird nicht eingebaut.
- Kommentare: nur wo sie das *Warum* erklären. Keine Kommentare, die den Code nacherzählen.
- Keine neue Abhängigkeit ohne eigene Freigabe (siehe Abschnitt 9).
- Keine Umformatierung von Code, der nicht zur Aufgabe gehört. Das versteckt die
  eigentliche Änderung.

## 6. Verbotene Pfade

Diese Dateien und Verzeichnisse werden von Agenten **nicht geändert**. Wer sie ändern
müsste, bricht ab und fragt zurück.

| Pfad | Grund |
|---|---|
| `.github/workflows/**` | CI und Deployment — nur mit Freigabe des Nutzers |
| `migrations/**` (bestehende Dateien) | eine angewandte Migration wird nie geändert; nur neue hinzufügen |
| `web/src/cores-theme.css`, `web/public/cores-theme.css`, `web/src/lib/cores-design.ts`, `web/src/lib/SuiteLanguageSwitcher.tsx`, `web/src/lib/cores-locales/**` | erzeugt aus `cores/theme/` |
| `cmd/server/dist/**` | Frontend-Build |
| `docker-entrypoint.sh`, `Dockerfile` | Laufzeit und Deployment |
| `.env`, `.env.*` (außer `.env.example`) | enthält Secrets |
| `package-lock.json`, `web/package-lock.json` | nur als Nebenwirkung eines freigegebenen Updates |
| `AGENTS.md` | diese Regeln ändert der Nutzer, nicht ein Agent |

## 7. Secrets

- **Keine Secrets in Repository, Kommentar, Dokument oder Log.** Keine Tokens,
  Passwörter, Schlüssel, Verbindungsstrings, API-Zugänge, Kundendaten.
- Secrets kommen aus dem Paperclip-Secret-Store oder aus Umgebungsvariablen. Sie
  werden nie in eine Datei geschrieben und nie ausgegeben.
- Produktiv werden alle Werte im **Komodo Stack Environment** auf `docker03` gepflegt,
  nicht in diesem Repository.
- `.env.example` enthält nur Namen und Beispielwerte, nie echte Werte.
- Testdaten sind erfunden. Keine kopierten Produktionsdaten, auch nicht gekürzt.
- Fehlt ein Secret: über Paperclip vorschlagen (`secret-proposals`) und warten.
  Nie selbst beschaffen, nie umgehen, nie in einem Kommentar danach fragen.
- Ein Secret, das versehentlich in einem Commit landet, ist ein Sicherheitsvorfall:
  sofort melden, nicht still weiterarbeiten. Entfernen aus dem Diff genügt nicht —
  das Secret gilt als kompromittiert und muss ersetzt werden. **Alle Cores-Repositories
  sind öffentlich.** Ein Fehler hier ist sofort weltweit sichtbar.

## 8. Harte Grenzen

Diese sechs Regeln stehen über jeder Aufgabenbeschreibung. Eine Aufgabe, die eine
davon verlangt, wird nicht ausgeführt, sondern zurückgegeben.

1. **Keine Schreibzugriffe auf produktive Datenbanken.** Lesen ist erlaubt. Schreiben,
   ändern, löschen, Migrationen fahren: nicht in Produktion. Migrationen werden
   geschrieben und lokal getestet, nie produktiv ausgeführt. Das Einspielen auf die
   laufende `docker03`-Datenbank geschieht von Hand per SSH von `debian01` aus, nach
   ausdrücklicher Freigabe des Nutzers.
2. **Keine produktiven Deployments ohne menschliche Freigabe.** Auch nicht nach
   grünem Review.
3. **Entwicklung nur in isolierten Branches oder Git-Worktrees.** Niemals direkt auf
   `main` oder einem anderen geschützten Branch.
4. **Tests vor jedem Pull Request.** Kein PR ohne protokollierten, grünen Testlauf.
5. **Keine Secrets in Repository, Kommentar, Dokument oder Log.**
6. **Bestehende Architektur zuerst verstehen.** Architektur-Doku und diese Datei vor
   dem Schreiben lesen. Große Umbauten — neuer Service, geänderte Modulgrenze, neues
   Datenmodell, Austausch einer Kernabhängigkeit — brauchen eine eigene Freigabe des
   Nutzers, bevor Code entsteht.

## 9. Freigabe-Gates

| Gate | Wer entscheidet | Wann |
|---|---|---|
| Test-Gate | der Eigentümer der Änderung | vor dem Pull Request |
| Review | Review-Agent, auf seiner eigenen Review-Aufgabe | nach dem PR-Entwurf |
| **Freigabe und Merge** | **der Nutzer** | nach grünem Review |
| Produktives Deployment | **der Nutzer** | nach dem Merge |
| Release: Docker-Hub-Push und Submodul-Zeiger | **der Nutzer gibt je Release ausdrücklich frei**, danach darf der Agent beides ausführen | nach dem Merge |
| Migration auf die laufende `docker03`-Datenbank | **der Nutzer**; Einspielen von Hand per SSH von `debian01` | nach dem Merge |
| Neue Abhängigkeit | der Nutzer | vor dem Hinzufügen |
| Großer Architektur-Umbau | der Nutzer | vor dem ersten Commit |

Was ein Agent in diesem Repository **nie** tut:

- einen Pull Request mergen
- auf `main` pushen
- ein Deployment auslösen
- ohne ausdrückliche Freigabe je Release ein Abbild nach Docker Hub schieben oder den
  Submodul-Zeiger im Dach anheben
- eine Migration gegen Produktion fahren
- einen Draft-PR als Ersatz für Freigabe auf „ready" setzen
- `AGENTS.md` oder CI-Dateien ändern

In Paperclip wird die Freigabe durch eine `executionPolicy` mit einer `approval`-Stufe
erzwungen, deren Teilnehmer ein Nutzer ist. Kein Agent kann sie abhaken.

## 10. Branches, Commits, Pull Requests

- Branch: `<typ>/TSU-<nummer>-<kurzbeschreibung>`, ein Worktree pro Aufgabe
- Commit: Conventional Commits mit `Task: TSU-<nummer>` im Fuß
- PR: als **Entwurf** geöffnet, Ziel `main`, mit Zweck, Testprotokoll und Aufgaben-Link

Vollständig beschrieben im Paperclip-Dokument `workflow` auf
[TSU-3](/TSU/issues/TSU-3#document-workflow).

## 11. Abbrechen und zurückfragen

Abbrechen ist richtig, nicht peinlich. Zurückfragen bei:

- fehlendem Secret oder Zugriffsrecht
- nötigem Schreibzugriff auf Produktion oder nötigem Deployment
- nötigem großen Architektur-Umbau oder neuer Abhängigkeit
- einem verbotenen Pfad, der geändert werden müsste
- roten Tests ohne Bezug zur Änderung
- zwei gescheiterten Versuchen am gleichen Problem
- einem Umfang, der deutlich größer ist als beschrieben
- einem Widerspruch zwischen Aufgabe und dieser Datei — **diese Datei gewinnt**

Erst alles fertig machen, was ohne die Antwort geht. Dann fragen.

## 12. Bekannte Fallen

- **Der Dienst ändert beim Start das Schema.** `main.go` ruft `AutoMigrate` für den
  Branding-Datensatz und das Microsoft-Identitäts-Schema. Nie gegen eine Datenbank
  starten, die wichtig ist.
- **Dieser Dienst ist das Gateway.** Eine Änderung in `internal/proxy` kann alle vier
  fachlichen Cores gleichzeitig unerreichbar machen. Immer gegen den ganzen lokalen
  Stapel prüfen, nicht nur gegen das Dashboard.
- **Gesundheit ist `GET /health`, und der Healthcheck darf Fehler nicht verschlucken.**
  `cores/scripts/check-release.sh` erzwingt das.
- **Keine gecachten Adminrechte.** Rechte werden bei jeder Anfrage frisch geprüft. Ein
  Cache hier ist eine Rechteerweiterung.
- **Erzeugte Theme-Dateien liegen an zwei Stellen** (`web/src/` und `web/public/`).
  Beide sind Kopien aus `cores/theme/`.
- **Die Root-`package.json` enthält nur `@types/node`** und keine Skripte. Die echte
  Frontend-Konfiguration liegt in `web/`.
- **Microsoft Graph ist eine echte Fremdschnittstelle.** Tests dagegen nur mit
  Fixtures, nie mit echten Zugangsdaten.

### Suite-weite Fallen, die auch hier gelten

- **Zwei Migrationsspuren.** Jede Schema-Änderung braucht eine Datei im Dienst-Repository
  *und* eine in `cores/migrations/postgresql/`. Die Nummern gehören paarweise.
- **Das Init-Verzeichnis läuft nur bei leerem Datenverzeichnis.**
  `cores/migrations/postgresql/` greift auf `docker03` nicht.
- **Eine Datenbank für alle.** PostgreSQL 16, rund 130 Tabellen, kein Schema pro Dienst.
  Eine Tabellenänderung kann fremde Dienste treffen.
- **Nur das Dachrepository hat heute CI.** Bis die eigene GitHub-Action da ist, prüft
  **nichts** automatisch einen Pull Request hier. Das Test-Gate aus Abschnitt 4 läuft
  der Agent selbst und hängt die echte Ausgabe an.
- **Alle Repositories sind öffentlich.**

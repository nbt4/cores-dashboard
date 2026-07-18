# Cores Dashboard

**Zentrales Dashboard und Single Entrypoint für das Cores-Ökosystem — intelligente Verknüpfung und einheitliche Oberfläche für RentalCore, WarehouseCore und Plannercore.**

---

## Features

- **Single Sign-On (SSO)** — Einmal anmelden, alle Cores-Services nutzen. Zentrales Login/Logout mit JWT-basiertem Session-Management
- **Reverse Proxy** — Transparentes Durchreichen von API-Requests an RentalCore, WarehouseCore und Plannercore. Plannercore-SPA nahtlos eingebettet unter `/planner/`
- **Unified Analytics** — Dashboard-Übersicht mit aggregierten Kennzahlen aus allen Cores-Services (Geräte, Jobs, Auslastung, Umsätze)
- **Branding & Theming** — Dynamisches Whitelabeling: eigenes Logo, Firmenname und Favicon pro Tenant. Upload über die Admin-Oberfläche
- **Cross-Service Navigation** — Einheitliche Navbar mit direkten Links zu allen Sub-Services
- **Config API** — Öffentlicher Endpoint liefert alle Cross-Links und Branding-Daten für clientseitige Integration
- **Statisches Embedding** — Frontend (React/Vite) und Backend (Go) in einem Binary via `embed`. Keine separaten Assets nötig

---

## Tech-Stack

| Schicht       | Technologie                             |
|---------------|-----------------------------------------|
| Backend       | Go 1.25, `net/http` (ServeMux)          |
| Frontend      | React 19, TypeScript, Vite 7            |
| Styling       | Tailwind CSS 4, PostCSS                 |
| UI-Bibliothek | Lucide React, React Router DOM 7        |
| Datenbank     | PostgreSQL 16 (via GORM)                |
| Auth          | JWT (golang-jwt/jwt/v5), bcrypt         |
| Container     | Docker (Multi-Stage: Node 22 + Go 1.25 + Alpine 3.21) |

---

## Schnellstart

### Docker

```bash
docker run -d \
  --name cores-dashboard \
  -e CORES_JWT_SECRET=your-256-bit-secret \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=rentalcore \
  -e DB_USER=rentalcore \
  -e DB_PASSWORD=yourpassword \
  -e RENTALCORE_URL=http://rentalcore:8080 \
  -e WAREHOUSECORE_URL=http://warehousecore:8081 \
  -e PLANNERCORE_URL=http://plannercore:8080 \
  -p 8080:8080 \
  nobentie/cores-dashboard:latest
```

### docker-compose (Auszug)

```yaml
cores-dashboard:
  image: nobentie/cores-dashboard:latest
  ports:
    - "8080:8080"
  environment:
    CORES_JWT_SECRET: ${CORES_JWT_SECRET}
    DB_HOST: postgres
    DB_PORT: 5432
    DB_NAME: rentalcore
    DB_USER: rentalcore
    DB_PASSWORD: ${DB_PASSWORD}
    RENTALCORE_URL: http://rentalcore:8080
    WAREHOUSECORE_URL: http://warehousecore:8081
    PLANNERCORE_URL: http://plannercore:8080
  depends_on:
    - postgres
  volumes:
    - branding_data:/var/lib/branding/logos
```

---

## API-Endpunkte

| Methode  | Pfad                              | Beschreibung                                |
|----------|-----------------------------------|---------------------------------------------|
| `POST`   | `/api/v1/auth/login`              | Benutzer-Login (JSON: username, password)   |
| `POST`   | `/api/v1/auth/logout`             | Session beenden                             |
| `GET`    | `/api/v1/auth/me`                 | Aktuellen Benutzer abrufen (🔒)              |
| `GET`    | `/api/v1/config`                  | Öffentliche Konfiguration und Cross-Links   |
| `GET`    | `/api/v1/branding`                | Öffentliche Branding-Daten (Logo, Name)     |
| `GET`    | `/api/v1/analytics/summary`       | Aggregierte Dashboard-Kennzahlen (🔒)        |
| `GET`    | `/api/v1/admin/branding`          | Branding-Konfiguration abrufen (🔒 Admin)    |
| `PUT`    | `/api/v1/admin/branding`          | Branding aktualisieren (🔒 Admin)            |
| `POST`   | `/api/v1/admin/branding/logo`     | Logo hochladen (🔒 Admin)                    |
| `DELETE` | `/api/v1/admin/branding/logo`     | Logo löschen (🔒 Admin)                      |
| `*`      | `/api/v1/proxy/rental/*`          | Proxy zu RentalCore (🔒)                     |
| `*`      | `/api/v1/proxy/warehouse/*`       | Proxy zu WarehouseCore (🔒)                  |
| `*`      | `/api/v1/proxy/planner/*`         | Proxy zu Plannercore (🔒)                    |
| `*`      | `/api/v1/planner/*`               | Proxy zu Plannercore (🔒)                    |
| `GET`    | `/planner/`                       | Plannercore SPA (eingebettet, öffentlich)    |

🔒 = Authentifizierung via `session_id` Cookie erforderlich

---

## Umgebungsvariablen

| Variable                 | Beschreibung                                    | Standard                 |
|--------------------------|-------------------------------------------------|--------------------------|
| `PORT`                   | Server-Port                                     | `8080`                   |
| `CORES_JWT_SECRET`       | JWT-Secret (muss mit allen Cores identisch sein)| `dev-secret-change-me`   |
| `DB_HOST`                | PostgreSQL-Host                                 | `localhost`              |
| `DB_PORT`                | PostgreSQL-Port                                 | `5432`                   |
| `DB_NAME`                | Datenbank-Name                                  | `rentalcore`             |
| `DB_USER`                | Datenbank-Benutzer                              | `rentalcore`             |
| `DB_PASSWORD`            | Datenbank-Passwort                              | –                        |
| `DB_SSLMODE`             | SSL-Modus (disable, require, ...)               | `disable`                |
| `RENTALCORE_URL`         | Interne URL zu RentalCore                       | `http://localhost:8081`  |
| `WAREHOUSECORE_URL`      | Interne URL zu WarehouseCore                    | `http://localhost:8082`  |
| `PLANNERCORE_URL`        | Interne URL zu Plannercore                      | `http://plannercore:8080`|
| `RENTAL_PUBLIC_URL`      | Öffentliche RentalCore-URL (für Cross-Links)    | –                        |
| `WAREHOUSE_PUBLIC_URL`   | Öffentliche WarehouseCore-URL (für Cross-Links) | –                        |
| `PLANNERCORE_PUBLIC_URL` | Öffentliche Plannercore-URL (für Cross-Links)   | `/planner/`              |
| `COOKIE_DOMAIN`          | Cookie-Domain für SSO                           | –                        |

---

## Architektur

```text
Browser ────► cores-dashboard (:8080)
                  │
                  ├──► /api/v1/proxy/rental/*    ──► rentalcore    (:8081)
                  ├──► /api/v1/proxy/warehouse/* ──► warehousecore (:8082)
                  └──► /api/v1/planner/*         ──► plannercore   (:8080 intern)
```

---

[Quellcode](https://github.com/nbt4/cores-dashboard) | [Monorepo](https://github.com/nbt4/cores) | `nobentie/cores-dashboard:latest`

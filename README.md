# 🏆 Last Man Standing — Premier League Survival Game


## User and Club Admin Guide

For a user-facing walkthrough of the web portal and mobile app, see:

- [How to Use Last Man Standing](docs/how-to-use-app-and-web.md)

This covers normal users and club admins, including joining competitions, making picks, payments, lifeline, My Route, survivor table, club setup, participants, announcements, pause/resume, and result processing.

## Prerequisites

| Tool       | Required | Check                  |
|------------|----------|------------------------|
| **Docker** | ✅       | `docker --version`     |
| **Java 17**| ✅       | `java -version`        |
| **Maven**  | ✅       | `mvn -version`         |
| **Node 18+**| ✅      | `node --version`       |

---

## 🚀 Local Development with PostgreSQL

The local profile uses a Docker PostgreSQL database and is isolated from the
production Supabase credentials in `.env`.

### One-time native PostgreSQL setup

Ubuntu already provides PostgreSQL on `localhost:5432`. Create the development
role and database once:

```bash
cd /home/alan/IdeaProjects/LastManStanding
./scripts/setup-local-postgres.sh
```

The script asks for your sudo password because PostgreSQL role/database creation
requires the local `postgres` administrator.

### Terminal 1 — Backend

```bash
./scripts/run-local-backend.sh
```

This command:

- verifies the native PostgreSQL database on `localhost:5432`;
- runs all Flyway migrations;
- starts Spring Boot with the `local` profile on `http://localhost:8080`;
- uses the mock fixture provider and disables mail, odds and performance logging.

### Terminal 2 — Frontend

```bash
cd /home/alan/IdeaProjects/LastManStanding/frontend
npm install
npm run dev
```

The existing `frontend/.env` points to `http://localhost:8080`. Open
`http://localhost:5173` in your browser.

### Database connection

| Setting | Default |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `lastmanstanding` |
| Username | `lmsuser` |
| Password | `lmspassword` |

Override defaults with `LOCAL_DB_PORT`, `LOCAL_DB_NAME`,
`LOCAL_DB_USERNAME`, or `LOCAL_DB_PASSWORD`.

Useful commands:

```bash
./scripts/setup-local-postgres.sh       # one-time native setup
PGPASSWORD=lmspassword psql -h localhost -U lmsuser -d lastmanstanding
./scripts/start-local-db.sh          # optional Docker database on port 5433
./scripts/stop-local-db.sh
docker compose down                 # keep database data
docker compose down -v              # delete the local database and start clean
```

To run the full application in Docker instead:

```bash
docker compose --profile app up --build
```

## 🎮 First-Time Setup

Once all 3 services are running:

### 1. Seed data — trigger a sync
The mock data provider pre-loads 20 PL teams and 8 gameweeks of fixtures.  
Trigger the initial sync:

```bash
# First, create an admin user via the API
curl -s -X POST http://localhost:8080/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lms.com","username":"admin","password":"admin1234"}'
```

Then **manually promote to ADMIN** in PostgreSQL:
```bash
docker compose exec postgres psql -U lmsuser -d lastmanstanding \
  -c "UPDATE users SET role='ADMIN' WHERE email='admin@lms.com';"
```

### 2. Log in as admin and trigger sync
```bash
# Get a token
TOKEN=$(curl -s -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lms.com","password":"admin1234"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Trigger fixture sync (loads teams + fixtures from MockProvider)
curl -s -X POST http://localhost:8080/admin/fixtures/import/sync \
  -H "Authorization: Bearer $TOKEN"

# Create a competition
curl -s -X POST http://localhost:8080/admin/competitions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Premier League Survivor 2026",
    "description": "Last person standing wins! Pick a team to win each week.",
    "entryFee": 10.00,
    "missedPickMode": "ELIMINATE",
    "postponedConsumesTeam": true,
    "startDate": "2026-03-21"
  }'
```

### 3. Open the app
Go to **http://localhost:5173** in your browser:
1. **Sign up** with a new account (or log in as `admin@lms.com` / `admin1234`)
2. Go to **Competitions** → **Join** the competition
3. **Make your pick** for the current gameweek
4. Use the **Admin** tab (admin only) to manage competitions and trigger syncs

---

## 🛑 Stopping

```bash
# Stop PostgreSQL and other Docker services
docker compose down

# Stop backend/frontend: Ctrl+C in each terminal
```

---

## 📁 Project Structure

```
LastManStanding/
├── docker-compose.yml          # PostgreSQL + optional Backend/Frontend containers
├── start-dev.sh                # One-command startup script
│
├── backend/                    # Spring Boot REST API
│   ├── pom.xml
│   └── src/main/java/com/lastmanstanding/
│       ├── controller/         # Auth, Competition, Admin endpoints
│       ├── service/            # Business logic (picks, elimination, sync)
│       ├── provider/           # FixtureProvider interface + MockProvider
│       ├── scheduler/          # Cron jobs for sync + result processing
│       ├── entity/             # JPA entities + enums
│       ├── repository/         # Spring Data JPA repos
│       ├── security/           # JWT auth filter + service
│       └── dto/                # Request/response records
│
└── frontend/                   # React + TypeScript + Tailwind
    └── src/
        ├── pages/              # Login, Signup, Competitions, CompetitionHome, Admin
        ├── components/         # Layout shell
        ├── context/            # AuthContext (JWT token management)
        ├── api.ts              # Axios instance with interceptors
        └── types.ts            # TypeScript interfaces
```

## 🔗 API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | — | Register |
| POST | `/auth/login` | — | Login |
| POST | `/auth/refresh` | — | Refresh JWT |
| GET | `/competitions/upcoming` | ✅ | List competitions |
| GET | `/competitions/{id}` | ✅ | Competition details |
| POST | `/competitions/{id}/join` | ✅ | Join competition |
| GET | `/competitions/{id}/me` | ✅ | My status + history |
| GET | `/competitions/{id}/fixtures?weeks=6` | ✅ | Upcoming fixtures |
| GET | `/competitions/{id}/gameweeks/current` | ✅ | Current gameweek |
| POST | `/competitions/{id}/gameweeks/{gw}/pick` | ✅ | Make/update pick |
| GET | `/competitions/{id}/gameweeks/{gw}/my-pick` | ✅ | My current pick |
| GET | `/competitions/{id}/gameweeks/{gw}/selections` | ✅ | All picks (post-lock) |
| GET | `/competitions/{id}/picks/history` | ✅ | Pick history |
| GET | `/competitions/teams` | ✅ | All teams |
| POST | `/admin/competitions` | ADMIN | Create competition |
| PUT | `/admin/competitions/{id}` | ADMIN | Update competition |
| POST | `/admin/fixtures/import/sync` | ADMIN | Trigger sync |
| PUT | `/admin/fixtures/{id}/override` | ADMIN | Override fixture |
| DELETE | `/admin/fixtures/{id}/override` | ADMIN | Revert override |
| GET | `/admin/audit` | ADMIN | Audit log |

---

## 🛟 Lifeline Feature

Competitions can optionally enable a one-time `lifeline` per entry.

- Admin/Club Admin can enable it when creating or editing a competition.
- Each entry may use lifeline once, before gameweek lock.
- Result behavior when lifeline is used on that pick:
  - `WIN` => advance (normal)
  - `DRAW` => advance (lifeline effect)
  - `LOSS` => eliminated (lifeline does not help)

### Create/Update competition payload fields

```json
{
  "lifelineEnabled": true
}
```

### Pick payload fields

```json
{
  "teamId": 12,
  "entryId": 45,
  "useLifeline": true
}
```

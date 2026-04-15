# 🏆 Last Man Standing — Premier League Survival Game

## Prerequisites

| Tool       | Required | Check                  |
|------------|----------|------------------------|
| **Docker** | ✅       | `docker --version`     |
| **Java 17**| ✅       | `java -version`        |
| **Maven**  | ✅       | `mvn -version`         |
| **Node 18+**| ✅      | `node --version`       |

---

## 🚀 Quick Start (3 terminals)

### Terminal 1 — Start MySQL
```bash
cd /Users/alan.riordan@optum.com/projects/LastManStanding
docker compose up mysql -d
```

Wait ~10 seconds for MySQL to be healthy, then verify:
```bash
docker exec lms-mysql mysqladmin ping -h localhost
```

### Terminal 2 — Start Backend (Spring Boot)
```bash
cd /Users/alan.riordan@optum.com/projects/LastManStanding/backend
mvn spring-boot:run
```

Wait for the line: `Started LastManStandingApplication` (takes ~15-30s).  
Backend runs at **http://localhost:8080**

### Terminal 3 — Start Frontend (Vite + React)
```bash
cd /Users/alan.riordan@optum.com/projects/LastManStanding/frontend
npm run dev
```

Frontend runs at **http://localhost:5173**

---

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

Then **manually promote to ADMIN** in MySQL:
```bash
docker exec -it lms-mysql mysql -u lmsuser -plmspassword lastmanstanding \
  -e "UPDATE users SET role='ADMIN' WHERE email='admin@lms.com';"
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
# Stop MySQL
docker compose down

# Stop backend/frontend: Ctrl+C in each terminal
```

---

## 📁 Project Structure

```
LastManStanding/
├── docker-compose.yml          # MySQL + Backend + Frontend containers
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

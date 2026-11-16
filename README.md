# ACEITEKA EBMIS

Examination Body Management Information System for ACEITEKA. See `ARCHITECTURE.md` for the plan, `RBAC_MATRIX.md` for roles, and `DEVELOPMENT_PROGRESS.md` for what actually works.

## Run it (development)
```bash
npm install
npm run dev:db          # terminal 1: dev PostgreSQL on port 5433 (leave running)
cd server && npx prisma migrate deploy && npm run db:seed
npm run dev:server      # terminal 2: API on http://localhost:4000
npm run dev:client      # terminal 3: web app on http://localhost:5173
npm test                # API tests (uses the ebmis_test database)
```
Copy `server/.env.example` to `server/.env`. Never commit `.env`.

## Demo accounts (development only)
Password for all: `Demo-Pass-2026`

| Email | Role |
|---|---|
| sysadmin@aceiteka.test | System Administrator |
| examadmin@aceiteka.test | Examination Administrator |
| registration@aceiteka.test | Registration Officer |
| examiners@aceiteka.test | Examiner Management Officer |
| results@aceiteka.test | Results Officer |
| approver@aceiteka.test | Results Approver |
| school1@aceiteka.test | School Administrator, St. Mary Secondary School |
| school2@aceiteka.test | School Administrator, Hillview High School |

**Never use these accounts or this password in production.**

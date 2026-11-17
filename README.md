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
npm run test:e2e        # browser smoke tests
```
Copy `server/.env.example` to `server/.env`. Never commit `.env`.

The interface offers Light and Dark color themes, plus optional repeatable SVG background patterns inspired by Hero Patterns. Both choices are saved in this browser and apply across sign-in, staff, and school pages.

## Deploy to production
See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for PostgreSQL setup, production environment variables, backend startup, and reverse-proxy configuration.

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
| setter@aceiteka.test | Examination Setter |
| printer@aceiteka.test | Printing Officer |
| school1@aceiteka.test | School Administrator, St. Mary Secondary School |
| school2@aceiteka.test | School Administrator, Hillview High School |

**Never use these accounts or this password in production.**

## Announcements and examination setup

- Staff with announcement permissions can create general notices for staff and school portals, department notices for mapped staff roles, or internal notices displayed on the staff dashboard. School portals only receive general notices.
- Examination administrators can add subjects and optionally configure Paper 1, Paper 2, and Paper 3 with manually entered paper codes. Subjects can then be added to examination sessions.
- Users with session-management permission can add an examination session and set its registration dates.
- Authorized report viewers can download a session summary as CSV. Results entry and approval roles do not receive report access.
- Results officers choose a session, school, subject, and configured paper to load that school's approved student list and enter marks on screen. Bulk CSV upload remains available; school-specific batches continue through the existing independent check, approval, and release workflow.

## Examination preparation workflows

- **Preparation Pipeline**: examination administrators configure session milestones with due dates, owners, and progress statuses. Registration officers can track school entries and send in-app reminders to schools with no submission or a submission returned for changes. A reminder can be sent again after 24 hours.
- **Review Exam Materials**: authorized ACEITEKA reviewers approve a setter's exam script and marking guide as a pair. Only approved materials appear in the printer workspace.
- **Printing Dashboard**: printing officers see candidate counts per subject from the approved student register and can download approved scripts and guides.
- **Exam Setter Workspace**: setters upload a script and marking guide for a session subject. PDF and DOCX files up to 20 MB each are accepted.

Uploaded examination materials are stored outside the public web root. Set `UPLOAD_DIR` to a private, persistent directory in production and protect it with appropriate filesystem permissions and backups.

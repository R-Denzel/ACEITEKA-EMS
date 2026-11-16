# Roles and Permissions Matrix

Source of truth: `server/src/permissions.js`. It is seeded into the database and enforced by the server.
Staff roles are assigned by a System Administrator. Roles are additive, so one person may hold several.

| Permission | Sys Admin | Exam Admin | Registration | Examiner Officer | Results Officer | Results Approver | School Admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| schools.view | ✔ | ✔ | ✔ | ✔ | | | |
| schools.create / update | | ✔ | | | | | |
| sessions.manage, subjects.manage | | ✔ | | | | | |
| students.view | | ✔ | ✔ | | ✔ | ✔ | |
| students.review | | | ✔ | | | | |
| students.approve | | | ✔ | | | | |
| students.upload | | | | | | | ✔ (own school) |
| examiners.nominate | | | | | | | ✔ (own school) |
| examiners.review | | ✔ | | ✔ | | | |
| examiners.approve | | | | ✔ | | | |
| examiners.assign | | | | ✔ | | | |
| results.enter | | | | | ✔ | | |
| results.review | | | | | ✔ | ✔ | |
| results.approve | | | | | | ✔ | |
| results.release | | | | | | ✔ | |
| reports.view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | |
| users.manage | ✔ | | | | | | |
| activity.view | ✔ | ✔ | | | | | |
| announcements.manage | | ✔ | | | | | |
| school.portal | | | | | | | ✔ |

**Rules enforced regardless of role:**
- School accounts can only reach `/api/school-portal/*`, and the school is taken from their login, never from the request.
- Staff accounts cannot use the school portal.
- The person who entered a results batch cannot approve it (to be enforced in the results module).
- Approving an examiner nomination never creates an appointment.

Planned extra roles (Finance Officer, Marking Coordinator, Printing and Dispatch Officer) are added in Phase 2 with narrow permissions.

*Tested today:* permission denial, staff and school separation, deactivated account lockout (see `server/tests/foundation.test.js`).

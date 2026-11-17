# Development Progress

## Stage 1: Inspect: done
No existing ACEITEKA code. The Stitch export has 15 static mockups, not 14, and none of them works. It contains Gazette and Archdiocese wording that must go.

## Stage 2: Plan: done at overview level
`ARCHITECTURE.md` (stack, ERD, workflows, API groups, phases, risks), `RBAC_MATRIX.md`, and `DEPLOYMENT_GUIDE.md` are present. Still to write: dedicated `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `WORKFLOW_DOCUMENTATION.md`, and `TESTING_GUIDE.md`.

## Stage 3: Foundation: complete
Working and tested (13 automated tests, all passing, run on 14 Nov 2026):
- PostgreSQL schema and first migration (`server/prisma/migrations`).
- Login, logout, current user, change password, forgot and reset password (single-use, 1 hour), 5-failure lockout.
- Server-side permission checks, staff and school gates, school isolation on the portal profile route.
- Staff routes: schools (list, search, page, create), users (list, create, switch on/off), activity history, dashboard counts.
- Activity history written for logins, password changes, school and user changes.
- Seed: all roles, permissions, 8 demo accounts, 2 schools, 2 centres.

Tested: valid and invalid login, logout, no-session access, missing permission (403), duplicate school code, field validation messages, school blocked from staff routes, staff blocked from the school portal, school ID tampering ignored, deactivated user locked out, cross-site request blocked, reset token single use.

Client shell (React, Vite, Tailwind) was initially checked by hand on 14 Nov 2026. The current app also has automated Playwright coverage for staff login, school portal access, and theme preferences (see Stage 8).

Known fix made: Vite needed `resolve.dedupe` for React, otherwise lucide-react loaded a second copy of React and the page was blank.

Remaining foundation follow-up: session-expiry behavior needs a dedicated test. Email delivery is not integrated; password reset links are logged in development.

## Stage 4: Core modules, part 1 (student registration): done
Built and working:
- API: examination sessions (create, edit, status, choose subjects), subjects, subject groups, centres, school edit/switch off.
- Student upload for schools: CSV or Excel, file type decided by content, 5 MB and 5,000-row limits, template download, row-by-row checks (missing fields, bad dates, duplicate numbers in the file and against approved students, unknown subjects, unapproved subject combinations). Invalid files go back as Changes Required with reasons; resubmission keeps history.
- Staff review: start review, return (note required), reject (note required), approve (re-checks, then creates the official student records in one transaction). Separate `students.review` and `students.approve` permissions.
- School side shows only its own uploads; another school's submission ID returns 404.
- Official Student Register: search, paging, CSV export (staff only, written to Activity History).
- Client pages: Examination Sessions, Subjects and Subject Groups, Student Entries (school and staff views), Student Register.

Tested: 24 automated API tests pass (13 foundation + 11 student/session/subject tests), run 14 Nov 2026. These cover valid and invalid rows, Excel upload, binary/oversize/empty/wrong-column files, closed registration, cross-school access, permission blocks, return and approval flow, duplicate numbers across schools, register search and export. In the browser I uploaded a bad file as a school (errors shown in plain English), then a corrected file, then approved it as the Registration Officer.

Subsequent work completed the centre management screen, school account creation, examination session editing, subject group editing, and school-facing entry follow-up/reminders. The current regression suite covers the related API permissions and key screens.

Known issue: `npm audit` reports advisories in the Prisma CLI (dev tool, runs only during migrations) and in `uuid` inside exceljs (affects only a rarely used call). Neither is reachable from user input here; to be re-checked before deployment.

Assumption in force: registration numbers are supplied by schools (3 to 30 letters, numbers, - and /), and must be unique within a session.

## Stage 4: Core modules, part 2 (examiners): done
Built:
- Schools recommend examiners (name, subject, qualifications, optional PDF/PNG/JPG documents, up to 3 files, 5 MB each). File type is decided by content. Documents are stored outside any public folder (`UPLOAD_DIR`, default `server/uploads`) and only served through permission-checked routes (owning school, or staff with `examiners.review`). Staff document views are logged.
- Staff review: start review, return (note required), reject (note required, needs `examiners.approve`), approve.
- Approve creates or reuses one verified Examiner Profile (matched on national ID, then email; subjects are merged). It never assigns the examiner.
- Assign Examiners is a separate step needing `examiners.assign`: the examiner must be approved for that subject, the subject must be in the session, no duplicates, assignments can be removed. All actions are in Activity History.
- Client: Recommend Examiners (school), Recommended Examiners and Assign Examiners (staff).

Tested: 11 new API tests (35 in total, all pass, 14 Nov 2026), including: approval creates no assignment, no duplicate profiles, fake PDF refused, documents private to owner school and staff, school cannot see another school's recommendations, review-only role cannot approve. The current browser suite checks the school recommendation screen; full browser-based upload, staff review, and approval remain untested.

Not done: examiner notification emails, editing a recommendation after "Changes Required" (school sends a new one instead), editing profiles.

## Stage 5: Results chain: done (API-tested; key UI controls browser-checked)
Built:
- Enter results per session and subject by uploading a CSV (`registration_number,mark`). Checks: student exists and takes the subject, whole mark 0 to 100, no missing marks, no duplicates, every student taking the subject has a mark. Any problem means nothing is saved and the row-by-row list is shown. Only while the session is Examination Ongoing or Results Processing.
- Chain: waiting to be checked, checked, approved, sent to schools. Return (note needed) and reject. Separation of duties enforced on the server: the person who entered cannot check or approve; the person who checked cannot approve.
- Send results to schools creates one distribution record per school that has students in the batch. Schools see only released results and only their own students (other schools' students are not in the response). First view and download counts are recorded; downloads are logged. No public access of any kind.
- Corrections to a single approved or released mark: requested by one person, approved by a different approver, and the mark changes only on approval. Old and new marks are kept.
- Client: Check and Approve Results (staff) and My Results (school). Added `schools.view` to the two results roles so they can pick sessions, and a second demo account `results2@aceiteka.test` so the chain can be walked through by different people.

Tested at initial implementation: 13 new API tests, 48 in total, all pass (14 Nov 2026). Subsequent browser checks now cover results officer access, manual-entry controls, and report restrictions; API tests exercise mark saving and the review/approval/release chain. See Stage 8 for the current regression run.

Assumptions: marks are whole numbers 0 to 100; no grading scale yet (grade column unused); one batch per session and subject; CSV only for marks. All need ACEITEKA confirmation.

## Stage 6: Announcements, messages, reports: done (API-tested; announcement creation browser-checked)
Built:
- Announcements: staff with `announcements.manage` publish and remove; every school and every staff member can read. Schools cannot publish.
- Messages: a school writes to ACEITEKA (school ID taken from the session, a school ID in the request is ignored); staff with `announcements.manage` reply to one school; unread counts and mark-as-read, with another school unable to mark or see them. Sent messages are in Activity History.
- Reports (`reports.view`): for one chosen session: approved students (total, by school, by subject, by gender), entry, examiner-recommendation and results counts by status, and mark average, lowest and highest per subject for approved or sent results only.
- Client: Announcements, Messages, Reports (staff and school menus updated).

Tested at initial implementation: 4 new API tests, 52 in total, all pass (14 Nov 2026); production build compiles. The current Playwright test covers targeted announcement creation. Message and report screen workflows still need broader browser coverage.

CSV report export and the Results Officer/Approver report-access restriction were added later and are covered by current regression tests. Still outstanding: email or SMS alerts for messages, message threads and attachments, dashboard filters, internal tasks, and a dedicated "Resolve Results Errors" page.

## Stage 7: Initial browser check (14 Nov 2026): completed
Checked against the running app (API and Vite dev servers, dev database, real HTTP through the browser): school recommends an examiner with a PDF; Examiner Officer approves and assigns; Results Officer upload (bad file refused with reasons, good file saved); entering user blocked from checking; second officer checks; Approver approves and sends; school 1 sees only its own two students, school 2 sees nothing and gets "not found" on that batch; announcements and messages show on both sides; Reports shows live counts. Every school and staff page renders, and none scrolls sideways at phone width (375 px).
Found and fixed: Reports lowercased school names and subject codes; status counts now use plain labels.
Method note: the in-app browser pane was hidden, so pages were driven by script (fetch calls and route changes) and read back as text, not clicked with a mouse. The later automated browser suite is recorded in Stage 8; a full visual review against the Stitch designs is still outstanding.

At the time, the remaining work included browser automation and password screens. Password screens and automated coverage were added later.

## Stage 7b: Missing screens: done (14 Nov 2026)
Built and used in the browser (forms filled and submitted on the running app, results read back):
- Forgot password, Choose a new password (link from email; in development the link is printed in the server log), Change Password (link in the top bar). A new account is sent to Change Password first and cannot use other pages until it is changed. Weak and mismatched passwords show messages; a reset link works once (second use refused).
- Staff and School Accounts (System Administrator): add staff or school accounts with a one-time password shown once, switch accounts on or off.
- Schools and Centres: edit a school (name, contact, centre, switch off), add centres, centre list with school counts.
- Examination Sessions: edit name, year and registration dates (closing before opening is refused).
- Subject groups: edit name, limits and subjects (new API route, test added). 53 API tests pass.

Email delivery and a dedicated session-expiry test remain outstanding. Reset links are logged in development. A full visual review against the Stitch designs is also still pending.

## Stage 8: Cross-role regression and browser QA (17 Nov 2026): passed

Verified from the repository root:
- `npm test`: all 55 API tests passed. Coverage includes authentication and permissions, school isolation, student registration/review, examiner recommendations and assignment, result entry and separation of duties, release and school-specific visibility, communication and report permissions, preparation reminders/materials, and printer-facing APIs.
- `npx playwright test --workers=1`: all 8 browser tests passed. Tests cover administrator setup and announcement targeting, exam-admin preparation, exam setter access and hidden printer navigation, printer dashboard and hidden setter navigation, staff sign-in, school portal pages, results-role report restrictions/manual-entry controls, and sign-in theme persistence without visible theme controls.
- `npm run build` in `client`: production frontend build passed.
- `git diff --check`: passed.

The first full browser run exposed a brittle locator in the admin configuration test. Replacing the label locator with accessible combobox-role locators fixed the test; the focused test and full 8-test suite then passed. No application behavior change was needed.

## Stage 8b: Official entry form intake and printing QA (17 Nov 2026): passed

Implemented and verified:
- The supplied 2024 UACE workbook was uploaded through the browser and recognized as 53 school summaries across 19 subject codes and 1,959 paper-count cells. The test stopped at review and did not approve historical totals.
- A browser end-to-end test covers UACE workbook upload, human cross-check/save, approval, and display of approved paper counts on the printer dashboard. Test session, import records, and uploaded file are removed during teardown.
- API coverage verifies review/approval permissions, private original-file access, and that only approved totals reach printer planning. Original workbook/photo files remain behind permission-checked routes in private storage.
- If an approved-entry role confirms an unmatched school, they can add it from that entry card using the school's code. The new school is created and linked to its reviewed entry in one transaction; the action is audited, and existing schools with the same name are linked rather than duplicated.
- Official-form photos use local English OCR to recognize the form type/year and prepare a review grid. Handwritten values are not accepted automatically; reviewers must enter/correct counts against the source before approval. The supplied 2023 UCE image was previously checked for layout recognition, but was not re-uploaded in this browser run.
- `node --test tests/official-entry-forms.test.js`: passed after adding original-file permission checks. `npx playwright test tests/official-entry-forms.spec.js --workers=1`: passed for both the complete sample flow and the supplied-workbook preview. `npm run build` in `client` and `npx prisma validate` passed. The full API suite passed 56 tests before the additional permission assertions; the focused API test passed afterward.

The local database was updated with the official-entry migration. No exam script or marking-guide sample was available, so the setter-to-review-to-printer materials workflow still needs a browser run with representative files.
The later all-browser-suite rerun was blocked by the API's intentional sign-in rate limit after repeated local test logins. The official-entry end-to-end test and the school-portal session-selection test passed individually; rerun the full suite after the rate-limit window resets.

## Next development priorities

1. Add browser end-to-end coverage for the separate student-roster submission/review/approval flow and exam-material upload/review/printing download. Official aggregate-form intake is now covered; the exam-material workflow still needs representative exam scripts and marking guides.
2. Perform a visual/accessibility review at desktop and mobile widths, including keyboard navigation and readable contrast in both color themes.
3. Add a dedicated session-expiry test and decide the expected expiry UX.
4. Confirm grading rules and result-processing assumptions with ACEITEKA before extending result calculations.
5. Integrate and test email delivery for password resets and workflow notifications.
6. Write the remaining schema, API, workflow, and testing documentation; re-check dependency advisories before production deployment.

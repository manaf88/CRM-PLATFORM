# Test Flow — Solutions Growth OS

A guided end-to-end test pass for the platform. Work through it top to bottom: the
scenarios build on each other's data (an invited client is needed to approve a post,
a post is needed for a campaign, and so on).

- **Frontend:** http://localhost:5173
- **API:** http://localhost:3000/api

---

## 0. Read this first — five things that will otherwise waste your time

| # | Gotcha |
|---|--------|
| 1 | **Passwords must be at least 12 characters.** The sign-up form says "minimum 8" — it is wrong, and the server rejects anything shorter with a red error. Use `TestPass123!@#` everywhere. |
| 2 | **The invite link that the app gives you is broken.** It produces `…/auth/accept-invitation?token=…`, which lands on the 404 page. Delete `/auth` from the URL → `http://localhost:5173/accept-invitation?token=…`. Alternatively open `/accept-invitation` directly and paste the token into the "Invitation token" field. |
| 3 | **Rate limits.** 3 sign-ups per minute and 5 logins per minute per machine. If you are creating several accounts quickly and start getting errors, wait 60 seconds — it is not a bug. |
| 4 | **AI is in mock mode.** The AI Studio returns canned placeholder text, not real generated content. That is expected; you are testing the plumbing (generate → review → apply), not the writing quality. |
| 5 | **Everything is role-gated.** Most "I can't see / can't click / got Forbidden" findings are the permission model working as designed. Check the role table in §6 before filing. |

---

## 1. Getting the environment up

Whoever runs the environment does this once.

```bash
# 1. Infrastructure (from solutions-platform/)
docker compose up -d postgres redis minio

# 2. API (from solutions-platform/api/)
npm ci
npm run start:dev        # wait for: "API running on port 3000"

# 3. Frontend (from crm-front/)
npm ci
npm run dev              # http://localhost:5173
```

**The API will not start if MinIO is down** — it verifies its storage bucket on boot.
If you see `Could not initialize storage bucket`, start MinIO and restart the API.

Health check before you begin: open http://localhost:5173. You should reach the login page.

---

## 2. Build the test cast

The product is a multi-role agency workspace, so a single account cannot test it.
Create these six accounts. **All accounts share one workspace** — there is no
"create company" step; the first sign-in puts you straight into the workspace.

| # | Name | Email | Role | Exists to test |
|---|------|-------|------|----------------|
| 1 | Amir Manager | `am@test.local` | ACCOUNT_MANAGER | Everything; the only role that can invite, run reports, manage automations |
| 2 | Salma Client | `client@test.local` | CLIENT_OWNER | Approving / rejecting posts, reading reports |
| 3 | Dina Designer | `designer@test.local` | DESIGNER | Uploading files, attaching post assets, doing tasks |
| 4 | Omar Copy | `copy@test.local` | COPYWRITER | Commenting, doing tasks |
| 5 | Nour Social | `social@test.local` | SOCIAL_MEDIA_MANAGER | Content plans, posts, publishing |
| 6 | Sami Sales | `sales@test.local` | SALES_AGENT | The leads pipeline |

Password for all six: `TestPass123!@#`

### 2.1 Create account 1 (the manager)

1. Go to http://localhost:5173/register
2. Full name `Amir Manager`, email `am@test.local`, password `TestPass123!@#`
3. Submit.

**Expected:** you land directly on the dashboard. You are **never** asked to create a
company or workspace. The workspace name appears in the top bar.

> This is the behaviour that changed. If you see any "Create your workspace" screen,
> that is a bug — report it.

### 2.2 Create accounts 2–6 (invitations)

For each remaining person, signed in as Amir:

1. **Members** in the sidebar → **Invite member**
2. Fill in full name, email, and pick the role from the table above → **Create invitation**
3. Copy the invitation link or token it shows you
4. **Open a private/incognito window** (so you stay signed in as Amir), go to
   `http://localhost:5173/accept-invitation?token=<TOKEN>` — remember gotcha #2, no `/auth`
5. Set password `TestPass123!@#` → submit

**Expected:** the invitee is signed in and lands on the dashboard. Back in Amir's window,
**Members** lists them with the right role, and the invitation shows as `ACCEPTED`.

> **Shortcut:** `node scripts/seed-test-members.mjs` (in `api/`) creates the DESIGNER,
> COPYWRITER and SOCIAL_MEDIA_MANAGER accounts for you. Set `ADMIN_EMAIL`,
> `ADMIN_PASSWORD` and `COMPANY_NAME` first. It does **not** create the CLIENT_OWNER,
> so you must still invite account 2 by hand — nothing in the approval flow works without it.

---

## 3. Core scenarios

Each scenario says **who** to sign in as. Keep several browser profiles open so you are
not constantly logging in and out (and tripping the login rate limit).

### S1 — Sign in and workspace access
*Anyone*

1. Sign out, sign back in.
2. Reload the page mid-session (F5).
3. Sign out and try to open http://localhost:5173/dashboard directly.

**Expected:** login goes straight to the dashboard, no workspace/company prompt at any
point. A reload keeps you signed in. Signed out, `/dashboard` bounces you to `/login`.

### S2 — Members administration
*Amir (ACCOUNT_MANAGER)*

1. **Members** → change Omar's role from COPYWRITER to DESIGNER, then back.
2. Remove (suspend) Sami.
3. In another window, have Sami try to open **Leads**.
4. Re-activate Sami from Members.

**Expected:** role changes apply immediately. A suspended member loses access to
company data. Re-activating restores it.

*Also try:* sign in as Dina (DESIGNER) and open **Members** — she should be refused.
Only the ACCOUNT_MANAGER may manage members.

### S3 — Brand profile
*Amir or Nour*

1. **Brand profile** → fill brand name, industry, description, target audience,
   tone of voice, languages, colours, services, offers, forbidden words.
2. Save, reload the page, and confirm everything persisted.
3. Edit one field and save again.

**Expected:** saved and re-loaded exactly. The brand profile feeds the AI, so fill it in
properly before S5.

> ⚠️ Worth a product decision, not a bug report: **every** role can edit the brand profile,
> including CLIENT_REVIEWER. Flag it if only the agency side should be able to.

### S4 — Content plan
*Amir or Nour (SOCIAL_MEDIA_MANAGER)*

1. **Content plans** → create a plan: title, month, year, goal.
2. Open it, then change its status through `DRAFT → INTERNAL_REVIEW → CLIENT_REVIEW → APPROVED`.

**Expected:** created and listed; status changes stick.

*Also try:* as Dina (DESIGNER), attempt to create a plan — she should be refused
(only ACCOUNT_MANAGER and SOCIAL_MEDIA_MANAGER may).

### S5 — AI Studio (mock mode)
*Amir or Nour*

1. **AI Studio** → **Content plan preview**: month, year, goal, number of posts, language.
2. Review the returned preview, then **apply** it to create a real content plan
   (tick the option to create posts too).
3. **Post ideas**: enter a goal, count, platform, content type → generate.
4. Apply one idea → it should become a real post.
5. **Caption**: pick an existing post, generate caption options, apply one.
6. Check the generations history list, then open a single generation.

**Expected:** each generation is saved in history, and applying it creates or updates the
real plan/post/caption. Text is obvious placeholder mock content — fine.

### S6 — Posts and file assets
*Nour (posts) and Dina (files)*

1. As Nour: **Posts** → create a post — title, content type (`POST`/`REEL`/`STORY`/`CAROUSEL`/`VIDEO`),
   platform (`INSTAGRAM`/`FACEBOOK`/`TIKTOK`/`LINKEDIN`/`WHATSAPP`/`WEBSITE`), caption,
   visual brief, schedule date. Link it to the S4 content plan.
2. As Dina: open that post → upload an image and attach it as a `DESIGN` asset.
   Add a second file as `REFERENCE`.
3. Download an asset back.
4. Remove one asset.
5. Try a file larger than 20 MB.

**Expected:** upload/attach/list/download/remove all work. The oversized file is rejected
with a clear message, not a crash.

*Also try:* as Omar (COPYWRITER), attempt to upload a file — refused. Uploading is for
ACCOUNT_MANAGER, DESIGNER and SOCIAL_MEDIA_MANAGER.

### S7 — Approval workflow ⭐ the important one
*Nour + Salma + Amir — needs at least two windows*

This is the heart of the product. Statuses must move exactly as in §5.

1. **Nour** opens the S6 post (status `DRAFT`) → **Submit to client**.
   → status becomes `READY_FOR_CLIENT`.
2. **Salma** (CLIENT_OWNER) opens the same post → **Request changes**, with a note.
   → status becomes `CHANGES_REQUESTED`. Check her note is visible to the team.
3. **Nour** edits the caption → **Submit to client** again.
   → back to `READY_FOR_CLIENT`.
4. **Salma** → **Approve**, with a note.
   → status becomes `APPROVED`.
5. **Nour** or **Amir** → **Publish**, supplying a published URL
   (must be a full URL with `https://`).
   → status becomes `PUBLISHED`.
6. Open the post's **approval log** — every step above should be recorded, with who and when.
7. Add comments on the post as Omar, Dina and Salma; check everyone sees the thread.

**Then test the guard rails:**

- Salma tries to **Approve** a post that is still `DRAFT` → must be refused.
- Nour tries to **Approve** her own post → refused (only CLIENT_OWNER / CLIENT_REVIEWER / ACCOUNT_MANAGER may).
- Anyone tries to **Publish** a post that is not `APPROVED` → refused.
- **Reject** a different post from `READY_FOR_CLIENT` → becomes `CANCELED`.

### S8 — Leads pipeline
*Sami (SALES_AGENT) and Amir*

1. **Leads** → create a lead: name, phone, email, source
   (`FACEBOOK`/`INSTAGRAM`/`WHATSAPP`/`WEBSITE`/`MANUAL`/`REFERRAL`/`TIKTOK`/`LINKEDIN`/`OTHER`),
   interested service, next follow-up date. Assign it to Sami.
2. Walk the status through `NEW → CONTACTED → INTERESTED → WAITING_DECISION → WON`,
   adding a note on each change.
3. Create a second lead and move it to `LOST`; a third to `FOLLOW_UP_LATER`.
4. Open a lead → check the **status history** shows every transition, and the **notes** list.
5. Filter/search the leads list.

**Expected:** statuses and history are recorded accurately with the right author and timestamps.

*Also try:* as Dina (DESIGNER), open **Leads**. She **can read** the pipeline, including
notes and status history, but every create/edit/status action must be refused. Only
ACCOUNT_MANAGER, SALES_AGENT and CLIENT_OWNER may change leads.

> ⚠️ Worth a product decision, not a bug report: read access to leads is open to *every*
> member, so designers and copywriters can see the whole sales pipeline. Flag it if that is
> not intended.

### S9 — Tasks
*Amir assigns; Dina and Omar work*

1. As Amir: **Tasks** → create a task — title, description, type
   (`COPYWRITING`/`DESIGN`/`CLIENT_REVIEW`/`FOLLOW_UP`/`PUBLISHING`/`REPORTING`/`GENERAL`),
   priority (`LOW`/`MEDIUM`/`HIGH`/`URGENT`), due date. Assign it to Dina.
   Link it to the post from S6.
2. As Dina: **My tasks** → the task is there. Move it `TODO → IN_PROGRESS → IN_REVIEW → DONE`.
3. Add comments as Dina and Amir.
4. As Dina, attach a file to the task, then remove it.
5. Open the task's **activity log** — creation, assignment, each status change, comments.
6. Create a task and move it to `BLOCKED`, and another to `CANCELED`.

**Expected:** assignment, status flow, comments, attachments and the activity trail all work.

*Also try:* as Omar (COPYWRITER), attempt to create and assign a task — refused.
Only ACCOUNT_MANAGER and SOCIAL_MEDIA_MANAGER can assign; the rest can only work on
tasks and comment.

### S10 — Campaigns
*Amir or Nour*

1. **Campaigns** → create one: name, objective
   (`AWARENESS`/`ENGAGEMENT`/`LEADS`/`SALES`/`RETENTION`/`LAUNCH`),
   description, start/end dates, budget, currency, target audience.
2. Attach the S6 post, the S8 lead and the S9 task to it.
3. Open the campaign **overview** — it should summarise what is attached.
4. Move its status `DRAFT → ACTIVE → PAUSED → COMPLETED`. Try `CANCELED` on another campaign.
5. Detach the post, then re-attach it.

**Expected:** attach/detach works in both directions and the overview reflects reality.

*Also try:* as Salma (CLIENT_OWNER), open a campaign — she should be able to **view**
but not edit. Managing is for ACCOUNT_MANAGER and SOCIAL_MEDIA_MANAGER.

### S11 — Responsibility matrix
*Amir*

1. **Responsibilities** → create three areas (e.g. "Instagram content", "Client reporting",
   "Lead follow-up"), with descriptions and a sort order.
2. Assign members to areas with types such as `TO_MANAGE`, `TO_SUPPORT`, `TO_APPROVE`,
   `TO_WORK_ON`, `TO_SUPERVISE`, `TO_BE_INFORMED`.
3. Use `OTHER` as a type — it must require a custom label; check that submitting `OTHER`
   with no label is rejected.
4. Use the bulk assign action to fill several cells at once.
5. Review the **matrix** view — members as columns, areas as rows.
6. Edit an assignment, then delete one.
7. Deactivate an area and confirm it drops out of the matrix.

**Expected:** the matrix reflects every assignment; `OTHER` demands a label.

*Also try:* as Omar, open **Responsibilities** — he should see the matrix but not be able
to change it. Only ACCOUNT_MANAGER may manage.

### S12 — Reports
*Amir, then Salma*

1. **Reports** → open the **overview**; try it for different months and years.
2. Generate a **monthly report** for the current month, with notes.
3. Open the saved report and check the numbers against what you created
   (posts, approvals, leads, tasks).
4. As Salma (CLIENT_OWNER): open the overview — she should see it.
5. As Salma: try to generate a monthly report — refused (ACCOUNT_MANAGER only).
6. As Dina (DESIGNER): the **overview** must be refused, but the list of already-saved
   reports is readable by any member — that is current behaviour, not a bug.

**Expected:** figures match the data you produced in S6–S10.

### S13 — Notifications
*All accounts*

Notifications are generated by the actions above, so do this after S7–S9. Sign in as each
person and check **Notifications** plus the unread badge.

| Action | Who should be notified |
|--------|------------------------|
| Post submitted to client | Salma (CLIENT_OWNER / CLIENT_REVIEWER) |
| Client requests changes | Amir, Nour, Omar, Dina |
| Client approves post | Amir, Nour |
| Post rejected | Amir, Nour |
| Post published | Salma, Amir, Nour |
| Comment on a post | the rest of the team on that post |
| Task assigned / status changed / commented | the assignee and the assigner |
| Lead assigned / status changed / note added | the assigned agent |
| Invitation created / accepted | Amir |
| Monthly report created | Amir |

Then: mark one as read, mark all as read, and confirm the unread badge drops to zero.

**Expected:** the right people get the right notifications; nobody gets notified about
their own action.

### S14 — Permissions sweep 🔒
*Each non-manager account*

Worth doing deliberately, because it is where bugs hide. Signed in as each of
Dina, Omar, Nour, Sami and Salma, try every sidebar page and note anything that
looks wrong against the table in §6.

**Expected:** no one can reach or change data outside their role, and refusals are clean
messages — never a blank page, a spinner that never ends, or a raw error.

### S15 — Session handling
*Anyone*

1. Stay signed in and idle for 15+ minutes, then click around.
2. Sign out, then press the browser Back button.
3. Sign in on two devices/profiles at once, then sign out of one.

**Expected:** the session renews itself silently in (1) — you should not be kicked out
mid-work. After signing out, Back must not expose the app.

### S16 — Automations *(API only — no UI page yet)*

There is no screen for these; skip unless you test with Postman/curl.

Two rules exist: **post changes requested → create fix-up tasks**, and
**lead became INTERESTED → create a follow-up task**. Create a rule as
ACCOUNT_MANAGER against `/api/companies/{companyId}/automation-rules`, trigger the
matching event (S7 step 2, or S8 moving a lead to `INTERESTED`), then read
`/api/companies/{companyId}/automation-runs` to confirm it fired and made the task.

---

## 4. Reference — endpoints

Everything below the workspace is scoped as `/api/companies/{companyId}/…`.
Send `Authorization: Bearer <accessToken>` on all of them.

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/accept-invitation` |
| Companies | `GET /companies`, `GET/PATCH /companies/{id}` |
| Members | `GET /members`, `PATCH /members/{membershipId}`, `DELETE /members/{membershipId}` |
| Invitations | `POST /invitations`, `GET /invitations` |
| Brand profile | `POST /brand-profile`, `GET /brand-profile`, `PATCH /brand-profile` |
| Content plans | `POST /content-plans`, `GET /content-plans`, `GET/PATCH /content-plans/{id}` |
| Posts | `POST /posts`, `GET /posts`, `GET/PATCH /posts/{id}` |
| Approvals | `POST /posts/{id}/submit-review`, `/approve`, `/request-changes`, `/reject`, `/publish`, `POST+GET /posts/{id}/comments`, `GET /posts/{id}/approval-logs` |
| Files | `POST /files/upload` (multipart, field `file`, ≤20 MB), `GET /files/{id}`, `GET /files/{id}/download-url` |
| Post assets | `POST /posts/{id}/assets`, `GET /posts/{id}/assets`, `DELETE /posts/{id}/assets/{assetId}` |
| AI | `POST /ai/content-plan-preview`, `/ai/post-ideas`, `/ai/caption`, `GET /ai/generations`, `POST /ai/generations/{id}/apply-content-plan` \| `/apply-caption` \| `/apply-post-idea` |
| Leads | `POST /leads`, `GET /leads`, `GET/PATCH /leads/{id}`, `PATCH /leads/{id}/status`, `POST+GET /leads/{id}/notes`, `GET /leads/{id}/status-history` |
| Tasks | `POST /tasks`, `GET /tasks`, `GET /tasks/my`, `GET/PATCH /tasks/{id}`, `PATCH /tasks/{id}/status`, `POST+GET /tasks/{id}/comments`, `POST+GET /tasks/{id}/attachments`, `DELETE /tasks/{id}/attachments/{attachmentId}`, `GET /tasks/{id}/activity-logs` |
| Campaigns | `POST /campaigns`, `GET /campaigns`, `GET/PATCH /campaigns/{id}`, `PATCH /campaigns/{id}/status`, `GET /campaigns/{id}/overview`, `POST+DELETE /campaigns/{id}/posts\|leads\|tasks/{entityId}` |
| Responsibilities | `POST /responsibility-areas`, `GET /responsibility-areas`, `GET/PATCH/DELETE /responsibility-areas/{id}`, `POST /responsibility-assignments`, `POST /responsibility-assignments/bulk`, `GET /responsibility-assignments/matrix`, `GET/PATCH/DELETE /responsibility-assignments/{id}` |
| Reports | `GET /reports/overview?month=&year=`, `POST /reports/monthly`, `GET /reports`, `GET /reports/{id}` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/read-all`, `PATCH /notifications/{id}/read` |
| Automations | `POST /automation-rules`, `GET /automation-rules`, `GET/PATCH /automation-rules/{id}`, `GET /automation-runs`, `GET /automation-runs/{id}` |

**For API testers:** unknown fields in a request body are rejected with a 400 — send only
the documented fields. Rate limits are 3/min for register, 5/min for login, 20/min for
refresh, 100/min for everything else.

---

## 5. Reference — post approval state machine

| Action | Allowed from | Results in | Who may |
|--------|--------------|-----------|---------|
| Submit to client | `DRAFT`, `IN_INTERNAL_REVIEW`, `CHANGES_REQUESTED`, `APPROVED` | `READY_FOR_CLIENT` | ACCOUNT_MANAGER, SOCIAL_MEDIA_MANAGER |
| Approve | `READY_FOR_CLIENT`, `CHANGES_REQUESTED` | `APPROVED` | CLIENT_OWNER, CLIENT_REVIEWER, ACCOUNT_MANAGER |
| Request changes | `READY_FOR_CLIENT`, `APPROVED` | `CHANGES_REQUESTED` | CLIENT_OWNER, CLIENT_REVIEWER, ACCOUNT_MANAGER |
| Reject | `READY_FOR_CLIENT`, `CHANGES_REQUESTED`, `APPROVED` | `CANCELED` | CLIENT_OWNER, CLIENT_REVIEWER, ACCOUNT_MANAGER |
| Publish *(needs a URL)* | `APPROVED`, `SCHEDULED` | `PUBLISHED` | ACCOUNT_MANAGER, SOCIAL_MEDIA_MANAGER |

Any other transition must be refused. That is the single most valuable thing to try to break.

---

## 6. Reference — who can do what

| Capability | AM | SMM | Copy | Design | Sales | Client Owner | Client Reviewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Manage members & invitations | ✅ | — | — | — | — | — | — |
| Brand profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit content plans | ✅ | ✅ | — | — | — | — | — |
| View content plans | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit posts | ✅ | ✅ | — | — | — | — | — |
| Submit post to client | ✅ | ✅ | — | — | — | — | — |
| Approve / request changes / reject | ✅ | — | — | — | — | ✅ | ✅ |
| Publish post | ✅ | ✅ | — | — | — | — | — |
| Comment on posts | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Upload files / post assets | ✅ | ✅ | — | ✅ | — | — | — |
| Create / edit leads, change status, add notes | ✅ | — | — | — | ✅ | ✅ | — |
| View leads, notes & status history | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / assign tasks | ✅ | ✅ | — | — | — | — | — |
| Work on tasks (change status, attach) | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| View tasks & comment | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage campaigns | ✅ | ✅ | — | — | — | — | — |
| View campaigns | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage responsibility matrix | ✅ | — | — | — | — | — | — |
| View responsibility matrix | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reports overview | ✅ | — | — | — | — | ✅ | — |
| Generate monthly report | ✅ | — | — | — | — | — | — |
| View saved reports | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Automation rules & runs | ✅ | — | — | — | — | — | — |

AM = Account Manager · SMM = Social Media Manager

---

## 7. Known issues — please don't re-report these

| Issue | Impact on testing |
|-------|-------------------|
| Invite link contains `/auth` and 404s | Use the workaround in gotcha #2 |
| Sign-up form says 8-character password, server needs 12 | Use a 12+ character password |
| AI returns mock placeholder text | Expected in this build |
| No UI for automation rules | API-only, see S16 |
| API refuses to boot when MinIO is down | Environment issue, not a product bug |
| Anyone who registers becomes an Account Manager of the shared workspace | Known, under review |

---

## 8. How to report a bug

```
Title:        short summary
Scenario:     e.g. S7 step 4
Account:      which of the six (and its role)
Steps:        1. … 2. … 3. …
Expected:     what should have happened
Actual:       what happened
Evidence:     screenshot / screen recording
Console:      any red errors in the browser devtools console
Severity:     Blocker / Major / Minor / Cosmetic
```

Please include the account role — with a permission-driven product like this one, the
role is usually the difference between a bug and intended behaviour.

# Solutions Platform — API handover for the frontend

Everything you need to update the frontend, in one file. No access to the backend repo
required — every change is described as API behaviour you can verify with curl.

> ⚠️ **One breaking change:** `POST /api/auth/register` no longer exists.

**Base URL:** `http://localhost:3000/api` · **Auth:** `Authorization: Bearer <accessToken>`

---

## At a glance

| # | Change | Impact |
|---|--------|--------|
| 1 | `POST /auth/register` **removed** | 🔴 Breaking — delete the registration page |
| 2 | `GET /companies` = "the clients I work on" | Feeds the client switcher; may be `[]` |
| 3 | **New:** `POST/GET/PATCH /users` | New admin screen — manage employees |
| 4 | **New:** `POST /companies/{id}/members` | New admin action — put an employee on a client |
| 5 | "Company" in the API means "client" in the UI | Rename labels only, not routes |
| 6 | Everything else | Unchanged — no re-integration needed |

---

## 1. The model — read this first

**Solutions is the system itself. It is not a record in the database.**

The records are **clients**: Al Zaman, Curby, Taxero. An employee works on several clients,
with a possibly different role on each, and sees **only** the clients they are assigned to.
So the UI reads **Solutions (Curby)** — Solutions is the product, the client is the
workspace you are currently in.

| UI concept | API |
|---|---|
| Solutions | the app — no endpoint, no record |
| Client — Al Zaman, Curby, Taxero | `company` |
| The clients I work on | `GET /api/companies` |
| Employee | `user` |
| "Ahmad works on Curby as Designer" | a membership |
| Ahmad's role on Taxero | that membership's `role` |

The API calls a client a `company`, and every feature route is scoped
`/api/companies/{companyId}/…`. **Treat "company" in the API as "client" in the UI.**
We are deliberately *not* renaming the routes yet — it is a large refactor and the rules
are still settling. Rename in your labels only.

---

## 2. 🔴 Breaking — there is no sign-up

`POST /api/auth/register` is **gone** and now returns **404**.

This is an internal staff system, so people do not create their own accounts. Remove the
registration page and every link to it.

Accounts now come into existence two ways:

- **Employees** — an administrator creates them: `POST /api/users` (§4).
- **Client-side contacts** — the person at Al Zaman who approves posts is *not* a Solutions
  employee. They still arrive by email invitation. **That flow is unchanged.**

The very first administrator is seeded from backend environment variables on boot, since
otherwise nobody could sign in and nobody could create anyone. Nothing for you to build.

---

## 3. `GET /api/companies` — your client list

Unchanged shape. Returns exactly the clients the signed-in employee is assigned to.

```jsonc
[
  {
    "id": "uuid",
    "name": "Curby",
    "industry": null, "website": null, "phone": null, "city": null, "country": null,
    "status": "ACTIVE",              // ACTIVE | INACTIVE | ARCHIVED
    "createdById": "uuid",
    "createdAt": "2026-08-08T10:00:00.000Z",
    "updatedAt": "2026-08-08T10:00:00.000Z"
  }
]
```

| Situation | Response | What the UI does |
|---|---|---|
| Employee on Curby + Taxero | 2 entries | Switcher with 2 options |
| Employee on Curby only | 1 entry | Hide the switcher — nothing to switch to |
| New employee, not assigned yet | `[]` | **Empty state**, not a redirect (see below) |
| Platform administrator | **every** client | Full list |

**When it returns `[]`,** show *"You are not assigned to any client yet — ask your
manager."* Do **not** send them to a create-company screen. Employees never create clients.

---

## 4. New — employee administration *(administrators only)*

Requires `platformRole` of `SUPER_ADMIN` or `AGENCY_ADMIN`. Anyone else gets **403**.

```http
POST   /api/users            # create an employee
GET    /api/users            # all employees, with the clients each works on
GET    /api/users/{userId}   # one employee
PATCH  /api/users/{userId}   # rename · change platform role · deactivate · reset password
```

**Create** — `POST /api/users`

```jsonc
{
  "fullName": "Ahmad Nour",
  "email": "ahmad@solutions.com",
  "password": "TempPass123!@#",   // minimum 12 characters
  "platformRole": "USER"          // optional, defaults to USER
}
```

**Response shape** (same for create, list, detail and update):

```jsonc
{
  "id": "uuid",
  "email": "ahmad@solutions.com",
  "fullName": "Ahmad Nour",
  "platformRole": "USER",         // USER | AGENCY_ADMIN | SUPER_ADMIN
  "status": "ACTIVE",             // ACTIVE | INACTIVE | SUSPENDED
  "createdAt": "2026-08-08T10:00:00.000Z",
  "clients": [
    { "membershipId": "uuid", "companyId": "uuid", "companyName": "Curby",  "role": "DESIGNER" },
    { "membershipId": "uuid", "companyId": "uuid", "companyName": "Taxero", "role": "DESIGNER" }
  ]
}
```

`clients` gives you the whole "who works on what" table in a single request.

**Update** — `PATCH /api/users/{userId}`, every field optional:

```jsonc
{ "fullName": "…", "platformRole": "AGENCY_ADMIN", "status": "SUSPENDED", "password": "NewPass123!@#" }
```

> Setting `status` to anything other than `ACTIVE`, or changing the password, **ends that
> user's session immediately** — their refresh token is cleared. This is how you handle
> someone leaving the company.

---

## 5. New — put an employee on a client *(administrators only)*

```http
POST /api/companies/{companyId}/members
{ "userId": "uuid", "role": "DESIGNER" }
```

`role` is the **client-level** role — see §8.

- Assigning the same employee to a second client is just another call with a different
  `companyId`. The role may differ per client.
- Re-assigning someone previously removed from that client **restores** their membership
  rather than creating a duplicate.
- Assigning someone already active on that client returns **409**.

> **Permission split, deliberately:** an Account Manager can still view and edit the members
> of their client (`GET` / `PATCH` / `DELETE` on `/members`), but only a platform
> administrator can **add** one. Who works on which client is a management decision.

---

## 6. Auth — unchanged, for reference

```http
POST /api/auth/login      { email, password }
POST /api/auth/refresh    # reads the refresh cookie — send credentials
POST /api/auth/logout
GET  /api/auth/me
```

`login` response — and the refresh token arrives as an **httpOnly cookie** scoped to
path `/api/auth`, so refresh requests must be sent with credentials:

```jsonc
{
  "user": { "id": "uuid", "email": "…", "fullName": "…", "platformRole": "USER" },
  "accessToken": "eyJ..."
}
```

`GET /api/auth/me` → `{ "user": { id, email, fullName, platformRole } }`

`platformRole` is `USER` | `AGENCY_ADMIN` | `SUPER_ADMIN`. **If your type union only lists
`'USER' | 'AGENCY_ADMIN'`, add `'SUPER_ADMIN'`** — the API has always been able to return it,
and you need it to gate the admin screens.

---

## 7. What to build

**Required**

1. **Delete the registration page** — the endpoint is gone.
2. **`GET /companies` returning `[]` → empty state, never a redirect.**
3. **Rename Company → Client** in labels, headings, toasts and error messages.

**Client switcher**

4. Render as **`Solutions (Curby)`** — Solutions fixed, client variable. Hide the dropdown
   when there is only one client. Persist the selected `companyId` across sessions;
   employees move between clients all day and should land back where they were.

**Admin screens** — gate on `platformRole` from `GET /auth/me`

5. **Clients** — list `GET /companies`, add `POST /companies` *(already exists)*.
6. **Employees** — list `GET /users`, add `POST /users`, edit/deactivate `PATCH /users/{id}`.
7. **Assign to client** — employee + client + role via `POST /companies/{id}/members`.
   Build the "not yet on this client" picker by filtering `GET /users` against that
   client's current members.

---

## 8. Client roles

Set per employee **per client**, on the membership.

| Role | Who it is |
|---|---|
| `ACCOUNT_MANAGER` | Runs the client. The only client role that can invite, report and manage automations |
| `SOCIAL_MEDIA_MANAGER` | Content plans, posts, publishing |
| `COPYWRITER` | Writes captions, works tasks, comments |
| `DESIGNER` | Uploads files and post assets, works tasks |
| `SALES_AGENT` | The leads pipeline |
| `CLIENT_OWNER` | Client side — approves/rejects posts, reads reports |
| `CLIENT_REVIEWER` | Client side — approves/rejects posts |

Quick guide for gating UI (not exhaustive, and **still subject to change** — do not hard-code
too much yet):

| Capability | AM | SMM | Copy | Design | Sales | Owner | Reviewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Manage members & invitations | ✅ | — | — | — | — | — | — |
| Create / edit content plans & posts | ✅ | ✅ | — | — | — | — | — |
| Submit post to client · Publish | ✅ | ✅ | — | — | — | — | — |
| Approve · request changes · reject | ✅ | — | — | — | — | ✅ | ✅ |
| Comment on posts | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Upload files & post assets | ✅ | ✅ | — | ✅ | — | — | — |
| Create / edit leads | ✅ | — | — | — | ✅ | ✅ | — |
| Create / assign tasks | ✅ | ✅ | — | — | — | — | — |
| Work on tasks | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Manage campaigns | ✅ | ✅ | — | — | — | — | — |
| Manage responsibility matrix | ✅ | — | — | — | — | — | — |
| Reports overview | ✅ | — | — | — | — | ✅ | — |
| Generate monthly report | ✅ | — | — | — | — | — | — |

Brand profile, and viewing content plans, posts, leads, tasks, campaigns and the
responsibility matrix, are open to every role.

---

## 9. Full endpoint reference

Everything below the client is scoped `/api/companies/{companyId}/…`.

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`, `POST /auth/accept-invitation` — **no `register`** |
| Employees *(admin)* | `POST /users`, `GET /users`, `GET /users/{userId}`, `PATCH /users/{userId}` |
| Clients | `GET /companies`, `POST /companies` *(admin)*, `GET` / `PATCH /companies/{id}` |
| Members | `POST /members` *(admin)*, `GET /members`, `PATCH` / `DELETE /members/{membershipId}` |
| Invitations | `POST /invitations`, `GET /invitations` |
| Brand profile | `POST` / `GET` / `PATCH /brand-profile` |
| Content plans | `POST` / `GET /content-plans`, `GET` / `PATCH /content-plans/{id}` |
| Posts | `POST` / `GET /posts`, `GET` / `PATCH /posts/{id}` |
| Approvals | `POST /posts/{id}/submit-review` · `/approve` · `/request-changes` · `/reject` · `/publish`, `POST`+`GET /posts/{id}/comments`, `GET /posts/{id}/approval-logs` |
| Files | `POST /files/upload` (multipart, field `file`, ≤20 MB), `GET /files/{id}`, `GET /files/{id}/download-url` |
| Post assets | `POST` / `GET /posts/{id}/assets`, `DELETE /posts/{id}/assets/{assetId}` |
| AI | `POST /ai/content-plan-preview` · `/ai/post-ideas` · `/ai/caption`, `GET /ai/generations`, `POST /ai/generations/{id}/apply-content-plan` \| `/apply-caption` \| `/apply-post-idea` |
| Leads | `POST` / `GET /leads`, `GET` / `PATCH /leads/{id}`, `PATCH /leads/{id}/status`, `POST`+`GET /leads/{id}/notes`, `GET /leads/{id}/status-history` |
| Tasks | `POST` / `GET /tasks`, `GET /tasks/my`, `GET` / `PATCH /tasks/{id}`, `PATCH /tasks/{id}/status`, `POST`+`GET /tasks/{id}/comments`, `POST`+`GET /tasks/{id}/attachments`, `DELETE /tasks/{id}/attachments/{attachmentId}`, `GET /tasks/{id}/activity-logs` |
| Campaigns | `POST` / `GET /campaigns`, `GET` / `PATCH /campaigns/{id}`, `PATCH /campaigns/{id}/status`, `GET /campaigns/{id}/overview`, `POST`+`DELETE /campaigns/{id}/posts\|leads\|tasks/{entityId}` |
| Responsibilities | `POST` / `GET /responsibility-areas`, `GET` / `PATCH` / `DELETE /responsibility-areas/{id}`, `POST /responsibility-assignments`, `POST /responsibility-assignments/bulk`, `GET /responsibility-assignments/matrix`, `GET` / `PATCH` / `DELETE /responsibility-assignments/{id}` |
| Reports | `GET /reports/overview?month=&year=`, `POST /reports/monthly`, `GET /reports`, `GET /reports/{id}` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/read-all`, `PATCH /notifications/{id}/read` |
| Automations | `POST` / `GET /automation-rules`, `GET` / `PATCH /automation-rules/{id}`, `GET /automation-runs`, `GET /automation-runs/{id}` |

---

## 10. Rules your forms must match

- **Passwords: minimum 12 characters** on `POST /users`, `PATCH /users/{id}` and
  `POST /auth/accept-invitation`. Login has no minimum.
- **Unknown body fields are rejected with 400.** Send only documented fields — no extras.
- **Rate limits:** 5/min login, 20/min refresh, 100/min everything else.
- **Enum values are exact strings.** Sending anything outside the documented set is a 400.

### ⚠️ One thing we need you to decide

`POST /api/companies/{companyId}/invitations` returns:

```jsonc
{
  "invitation": { "…": "…" },
  "invitationToken": "<id>.<secret>",
  "acceptPath": "/auth/accept-invitation?token=<id>.<secret>"
}
```

`acceptPath` is a **frontend** path chosen by the backend. If your route is
`/accept-invitation` without the `/auth` prefix, **every invitation link 404s** — and since
client-side contacts can only get in by invitation, that blocks the approval flow entirely.

Either register a route matching `acceptPath`, or build the URL yourself from
`invitationToken` and ignore `acceptPath`. **Tell us which path you want and we will change
the backend to match** — no need to work around it.

---

## 11. Verify it end to end

```bash
API=http://localhost:3000/api

# 1. Sign in as the seeded administrator (ask backend for the real credentials)
curl -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@solutions.local","password":"ChangeThisAdminPass123"}'

# 2. Create two clients
curl -X POST $API/companies -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' -d '{"name":"Curby"}'
curl -X POST $API/companies -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' -d '{"name":"Taxero"}'

# 3. Create an employee
curl -X POST $API/users -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Ahmad Nour","email":"ahmad@solutions.com","password":"TempPass123!@#"}'

# 4. Put them on BOTH clients
curl -X POST $API/companies/<curbyId>/members -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' -d '{"userId":"<userId>","role":"DESIGNER"}'
curl -X POST $API/companies/<taxeroId>/members -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' -d '{"userId":"<userId>","role":"DESIGNER"}'

# 5. Sign in as Ahmad → GET /companies returns exactly Curby and Taxero
```

Then in the UI, signed in as Ahmad: the switcher offers both clients, and switching between
them must change **everything** — posts, leads, tasks, brand profile, reports. A lead
created under Curby must not appear under Taxero.

**That is the behaviour the whole system is built around. If it leaks, nothing else matters.**

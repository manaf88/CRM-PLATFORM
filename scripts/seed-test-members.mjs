/**
 * Seed test members so the Responsibility Matrix has real columns.
 *
 * Place at:  scripts/seed-test-members.mjs   (backend repo root)
 * Run with:  node scripts/seed-test-members.mjs
 *
 * Requires the API to be running (default http://localhost:3000/api).
 * No dependencies — uses Node's built-in fetch (Node 18+).
 */

// ---------------------------------------------------------------------------
// CONFIG — edit these
// ---------------------------------------------------------------------------
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';

// The account you log into the dashboard with (must be ACCOUNT_MANAGER).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'maria@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!@#';

// Which workspace to seed. Leave empty to use the first company you belong to.
const COMPANY_NAME = process.env.COMPANY_NAME ?? 'Sham Beauty Clinic';

// Password given to every seeded user. MUST be >= 12 characters.
const MEMBER_PASSWORD = 'TestPass123!@#';

// Only these roles become matrix columns:
// ACCOUNT_MANAGER | COPYWRITER | DESIGNER | SOCIAL_MEDIA_MANAGER | SALES_AGENT
// (CLIENT_OWNER / CLIENT_REVIEWER are intentionally NOT shown in the matrix.)
const MEMBERS = [
  { fullName: 'Kamal Designer', email: 'kamal.designer@test.local', role: 'DESIGNER' },
  { fullName: 'Naya Social', email: 'naya.social@test.local', role: 'SOCIAL_MEDIA_MANAGER' },
  { fullName: 'Omar Copy', email: 'omar.copy@test.local', role: 'COPYWRITER' },
];

// ---------------------------------------------------------------------------

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message
        : text;

    const error = new Error(`${response.status} ${method} ${path} — ${message}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function main() {
  // 1. Login as the account manager -----------------------------------------
  console.log(`\n[1/4] Logging in as ${ADMIN_EMAIL} ...`);

  const login = await api('/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  const token = login.accessToken;
  console.log(`      OK — ${login.user.fullName}`);

  // 2. Resolve the company ---------------------------------------------------
  console.log('[2/4] Resolving company ...');

  const companies = await api('/companies', { token });
  const list = Array.isArray(companies) ? companies : (companies?.items ?? []);

  if (list.length === 0) {
    throw new Error('This user belongs to no company.');
  }

  const company =
    list.find((c) => c.name?.toLowerCase() === COMPANY_NAME.toLowerCase()) ??
    list[0];

  console.log(`      OK — ${company.name} (${company.id})`);

  // 3. Invite + accept each member ------------------------------------------
  console.log('[3/4] Creating members ...');

  for (const member of MEMBERS) {
    try {
      const invite = await api(`/companies/${company.id}/invitations`, {
        method: 'POST',
        token,
        body: {
          email: member.email,
          role: member.role,
          fullName: member.fullName,
        },
      });

      await api('/auth/accept-invitation', {
        method: 'POST',
        body: {
          token: invite.invitationToken,
          fullName: member.fullName,
          password: MEMBER_PASSWORD,
        },
      });

      console.log(`      + ${member.fullName} (${member.role}) — created`);
    } catch (error) {
      if (error.status === 409) {
        console.log(`      = ${member.fullName} — already exists, skipped`);
        continue;
      }

      console.log(`      ! ${member.fullName} — FAILED: ${error.message}`);
    }
  }

  // 4. Show the resulting matrix columns ------------------------------------
  console.log('[4/4] Matrix columns now available:');

  const matrix = await api(
    `/companies/${company.id}/responsibility-assignments/matrix`,
    { token },
  );

  for (const m of matrix.members) {
    console.log(`      • ${m.fullName.padEnd(20)} ${m.role ?? ''}`);
  }

  console.log(
    `\nDone. ${matrix.members.length} column(s), ${matrix.areas.length} row(s).`,
  );
  console.log(`Seeded users log in with password: ${MEMBER_PASSWORD}\n`);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}\n`);
  process.exit(1);
});
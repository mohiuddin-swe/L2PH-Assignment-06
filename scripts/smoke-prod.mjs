// Usage: BASE_URL=https://YOUR-APP.onrender.com/api/v1 node scripts/smoke-prod.mjs
// Read-only smoke test for the deployed API (does not create data, uses only 3 logins).
const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error("Usage: BASE_URL=https://YOUR-APP.onrender.com/api/v1 node scripts/smoke-prod.mjs");
  process.exit(1);
}
const ACCOUNTS = {
  admin: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@ums.test", password: process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345" },
  teacher: { email: process.env.SEED_TEACHER_EMAIL ?? "teacher@ums.test", password: process.env.SEED_TEACHER_PASSWORD ?? "Teacher@12345" },
  student: { email: process.env.SEED_STUDENT_EMAIL ?? "student@ums.test", password: process.env.SEED_STUDENT_PASSWORD ?? "Student@12345" },
};

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

const call = async (method, path, { token, body } = {}) => {
  // The first request can take ~1 minute while a free Render instance wakes up.
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not json */
  }
  return { status: res.status, json };
};

const main = async () => {
  console.log(`Smoke testing ${BASE} (first request may be slow while the server wakes up)\n`);

  let res = await call("GET", "/health");
  check("health check", res.status === 200 && res.json?.success === true, `(got ${res.status})`);

  res = await call("GET", "/docs/json");
  check("Swagger spec is served", res.status === 200 && Boolean(res.json?.paths), `(got ${res.status})`);

  res = await call("GET", "/departments");
  check("protected route without token -> 401", res.status === 401);
  res = await call("POST", "/auth/login", { body: { email: "bad", password: "" } });
  check("invalid login body -> 400 with errors[]", res.status === 400 && Array.isArray(res.json?.errors));
  res = await call("POST", "/auth/login", { body: { email: ACCOUNTS.admin.email, password: "Wrong@12345" } });
  check("wrong password -> 401", res.status === 401);

  const tokens = {};
  for (const role of ["admin", "teacher", "student"]) {
    res = await call("POST", "/auth/login", { body: ACCOUNTS[role] });
    check(`${role} can log in`, res.status === 200 && Boolean(res.json?.data?.accessToken), `(got ${res.status}: ${res.json?.message})`);
    tokens[role] = res.json?.data?.accessToken;
  }

  res = await call("GET", "/departments?page=1&limit=5", { token: tokens.student });
  check("student lists departments (with meta)", res.status === 200 && Boolean(res.json?.meta));
  res = await call("GET", "/offerings?page=1&limit=5", { token: tokens.student });
  check("student browses offerings", res.status === 200);
  res = await call("GET", "/admin/stats", { token: tokens.student });
  check("student cannot open admin stats -> 403", res.status === 403);
  res = await call("GET", "/admin/stats", { token: tokens.admin });
  check("admin opens dashboard stats", res.status === 200 && typeof res.json?.data?.users?.total === "number");
  res = await call("GET", "/admin/audit-logs?limit=3", { token: tokens.admin });
  check("admin reads audit logs", res.status === 200 && Array.isArray(res.json?.data));
  res = await call("GET", "/offerings/my-assigned", { token: tokens.teacher });
  check("teacher sees assigned offerings", res.status === 200);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error("Smoke test crashed:", err.message);
  process.exit(1);
});
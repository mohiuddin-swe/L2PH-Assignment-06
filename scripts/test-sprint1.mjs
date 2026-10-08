// Usage: node scripts/test-sprint1.mjs
// Needs the API running (npm run dev) and the seeded users (npm run seed). Node 18+.
const BASE = process.env.BASE_URL ?? "http://localhost:5001/api/v1";
const ACCOUNTS = {
  admin: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@ums.test", password: process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345" },
  teacher: { email: process.env.SEED_TEACHER_EMAIL ?? "teacher@ums.test", password: process.env.SEED_TEACHER_PASSWORD ?? "Teacher@12345" },
  student: { email: process.env.SEED_STUDENT_EMAIL ?? "student@ums.test", password: process.env.SEED_STUDENT_PASSWORD ?? "Student@12345" },
};

let passed = 0;
let failed = 0;

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
};

const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

const expectStatus = (name, res, expected) =>
  check(`${name} -> ${expected}`, res.status === expected, `(got ${res.status}: ${res.json?.message ?? ""})`);

const login = async (role) => {
  const res = await call("POST", "/auth/login", { body: ACCOUNTS[role] });
  if (res.status !== 200) {
    console.error(`Cannot login as ${role} (status ${res.status}). Is the API running at ${BASE}? Did you run "npm run seed"?`);
    process.exit(1);
  }
  return res.json.data;
};

const main = async () => {
  const suffix = String(Date.now()).slice(-8);
  const newEmail = `student${suffix}@example.com`;

  console.log("\nHEALTH + 404");
  let res = await call("GET", "/health");
  expectStatus("health", res, 200);
  check("response format", res.json?.success === true && typeof res.json?.message === "string" && "data" in res.json);
  res = await call("GET", "/does-not-exist");
  expectStatus("unknown route", res, 404);
  check("error format", res.json?.success === false && Array.isArray(res.json?.errors));

  console.log("\nREGISTER");
  res = await call("POST", "/auth/register", { body: { name: "Test Student", email: newEmail, password: "Test@1234", phone: "01712345678" } });
  expectStatus("register new student", res, 201);
  check("role is STUDENT, no password in response", res.json?.data?.user?.role === "STUDENT" && !JSON.stringify(res.json).includes("passwordHash"));
  res = await call("POST", "/auth/register", { body: { name: "Test Student", email: newEmail, password: "Test@1234" } });
  expectStatus("duplicate email", res, 409);
  res = await call("POST", "/auth/register", { body: { name: "A", email: "not-an-email", password: "123" } });
  expectStatus("invalid body", res, 400);
  check("errors[] lists fields", res.json?.errors?.length >= 3);
  res = await call("POST", "/auth/register", { body: { name: "Hacker", email: `h${suffix}@example.com`, password: "Test@1234", role: "ADMIN" } });
  expectStatus("role injection blocked", res, 400);

  console.log("\nLOGIN");
  const admin = await login("admin");
  const teacher = await login("teacher");
  const student = await login("student");
  check("tokens returned", Boolean(admin.accessToken && admin.refreshToken));
  check("roles are correct", admin.user.role === "ADMIN" && teacher.user.role === "TEACHER" && student.user.role === "STUDENT");
  res = await call("POST", "/auth/login", { body: { email: ACCOUNTS.student.email, password: "Wrong@1234" } });
  expectStatus("wrong password", res, 401);
  const wrongPasswordMsg = res.json?.message;
  res = await call("POST", "/auth/login", { body: { email: "nobody@example.com", password: "Wrong@1234" } });
  expectStatus("unknown email", res, 401);
  check("same message for both (no user enumeration)", res.json?.message === wrongPasswordMsg);

  console.log("\nPROFILE");
  res = await call("GET", "/users/me", { token: student.accessToken });
  expectStatus("get my profile", res, 200);
  check("student profile has studentId", Boolean(res.json?.data?.studentProfile?.studentId));
  res = await call("GET", "/users/me");
  expectStatus("no token", res, 401);
  res = await call("GET", "/users/me", { token: "garbage.token.value" });
  expectStatus("invalid token", res, 401);
  res = await call("PATCH", "/users/me", { token: student.accessToken, body: { name: "Demo Student", phone: "01812345678" } });
  expectStatus("update profile", res, 200);
  res = await call("PATCH", "/users/me", { token: student.accessToken, body: { role: "ADMIN" } });
  expectStatus("cannot change own role", res, 400);
  res = await call("PATCH", "/users/me", { token: student.accessToken, body: {} });
  expectStatus("empty update", res, 400);

  console.log("\nROLE-BASED ACCESS (/admin/ping)");
  res = await call("GET", "/admin/ping", { token: admin.accessToken });
  expectStatus("admin allowed", res, 200);
  res = await call("GET", "/admin/ping", { token: teacher.accessToken });
  expectStatus("teacher blocked", res, 403);
  res = await call("GET", "/admin/ping", { token: student.accessToken });
  expectStatus("student blocked", res, 403);
  res = await call("GET", "/admin/ping");
  expectStatus("anonymous blocked", res, 401);

  console.log("\nREFRESH TOKEN ROTATION");
  const first = await login("student");
  res = await call("POST", "/auth/refresh-token", { body: { refreshToken: first.refreshToken } });
  expectStatus("refresh works", res, 200);
  check("new token pair issued", Boolean(res.json?.data?.accessToken) && res.json.data.refreshToken !== first.refreshToken);
  res = await call("POST", "/auth/refresh-token", { body: { refreshToken: first.refreshToken } });
  expectStatus("reusing old refresh token is rejected", res, 401);
  const second = await login("student");
  res = await call("POST", "/auth/logout", { body: { refreshToken: second.refreshToken } });
  expectStatus("logout", res, 200);
  res = await call("POST", "/auth/refresh-token", { body: { refreshToken: second.refreshToken } });
  expectStatus("refresh after logout", res, 401);
  res = await call("POST", "/auth/refresh-token", { body: { refreshToken: "" } });
  expectStatus("empty refresh token", res, 400);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  console.log("Also open Prisma Studio and check the AuditLog table (USER_REGISTERED, USER_LOGIN, USER_PROFILE_UPDATED).");
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error("Test run crashed:", err.message);
  process.exit(1);
});
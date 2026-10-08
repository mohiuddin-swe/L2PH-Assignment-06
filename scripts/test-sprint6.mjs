// Usage: node scripts/test-sprint6.mjs
// Needs the API running (npm run dev) and the seeded users. Node 18+ (built-in fetch).
const BASE = process.env.BASE_URL ?? "http://localhost:5001/api/v1";
const ACCOUNTS = {
  admin: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@ums.test", password: process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345" },
  teacher: { email: process.env.SEED_TEACHER_EMAIL ?? "teacher@ums.test", password: process.env.SEED_TEACHER_PASSWORD ?? "Teacher@12345" },
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

const loginAs = async (email, password, label) => {
  const res = await call("POST", "/auth/login", { body: { email, password } });
  if (res.status !== 200) {
    console.error(`Cannot login as ${label} (status ${res.status}). Did you run "npm run seed"? Is the API running at ${BASE}?`);
    process.exit(1);
  }
  return { token: res.json.data.accessToken, id: res.json.data.user.id };
};

const suffix = String(Date.now()).slice(-6);

const main = async () => {
  const admin = await loginAs(ACCOUNTS.admin.email, ACCOUNTS.admin.password, "admin");
  const teacher = await loginAs(ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, "teacher");
  const randomUuid = "00000000-0000-4000-8000-000000000000";

  const must = async (method, path, body, token, label, ok = [200, 201]) => {
    const res = await call(method, path, { token, body });
    if (!ok.includes(res.status)) {
      console.error(`Setup failed: ${label} (status ${res.status}: ${res.json?.message})`);
      process.exit(1);
    }
    return res.json.data;
  };

  // ---------- setup ----------
  const studentEmail = `s6-a-${suffix}@example.com`;
  const reg = await must("POST", "/auth/register", { name: "Test Student", email: studentEmail, password: "Test@1234" }, undefined, "register student");
  const s = { token: reg.accessToken, id: reg.user.id };
  const dept = await must("POST", "/departments", { name: `Admin Dept ${suffix}`, code: `D${suffix}` }, admin.token, "department");
  const course1 = await must("POST", "/courses", { code: `AD1-${suffix}`, title: "Admin Course 1", credit: 3, departmentId: dept.id }, admin.token, "course 1");
  const course2 = await must("POST", "/courses", { code: `AD2-${suffix}`, title: "Admin Course 2", credit: 3, departmentId: dept.id }, admin.token, "course 2");
  const o1 = await must("POST", "/offerings", { courseId: course1.id, teacherId: teacher.id, semester: `Admin ${suffix}`, section: "A", capacity: 10 }, admin.token, "offering 1");
  const enrollment = await must("POST", "/enrollments", { offeringId: o1.id }, s.token, "enroll student");

  console.log("\nADMIN ACCESS CONTROL");
  let res = await call("GET", "/admin/users");
  expectStatus("no token", res, 401);
  res = await call("GET", "/admin/users", { token: s.token });
  expectStatus("student cannot use admin routes", res, 403);
  res = await call("GET", "/admin/users", { token: teacher.token });
  expectStatus("teacher cannot use admin routes", res, 403);
  res = await call("GET", "/admin/stats", { token: teacher.token });
  expectStatus("teacher cannot see stats", res, 403);
  res = await call("GET", "/admin/audit-logs", { token: s.token });
  expectStatus("student cannot read audit logs", res, 403);

  console.log("\nADMIN: CREATE USERS");
  const t2Email = `t2-${suffix}@example.com`;
  const t2Password = "Teach@1234";
  const base = { name: "Second Teacher", email: t2Email, password: t2Password, role: "TEACHER" };
  res = await call("POST", "/admin/users", { token: s.token, body: base });
  expectStatus("student cannot create users", res, 403);
  res = await call("POST", "/admin/users", { token: admin.token, body: { ...base, password: "weak" } });
  expectStatus("weak password", res, 400);
  res = await call("POST", "/admin/users", { token: admin.token, body: { ...base, isAdmin: true } });
  expectStatus("unknown field rejected", res, 400);
  res = await call("POST", "/admin/users", { token: admin.token, body: { ...base, role: "ADMIN", designation: "Boss" } });
  expectStatus("admin with a designation", res, 400);
  res = await call("POST", "/admin/users", { token: admin.token, body: { ...base, role: "STUDENT", designation: "Lecturer" } });
  expectStatus("student with a designation", res, 400);
  res = await call("POST", "/admin/users", { token: admin.token, body: { ...base, email: ACCOUNTS.admin.email } });
  expectStatus("duplicate email", res, 409);
  res = await call("POST", "/admin/users", { token: admin.token, body: { ...base, departmentId: randomUuid } });
  expectStatus("unknown department", res, 404);
  res = await call("POST", "/admin/users", { token: admin.token, body: { ...base, departmentId: dept.id, designation: "Lecturer" } });
  expectStatus("admin creates a teacher", res, 201);
  check("teacher profile created", res.json?.data?.role === "TEACHER" && res.json?.data?.teacherProfile?.designation === "Lecturer");
  check("password hash is never returned", !JSON.stringify(res.json).includes("passwordHash"));
  const t2Id = res.json?.data?.id;
  const t2 = await loginAs(t2Email, t2Password, "new teacher");
  check("new teacher can log in", t2.id === t2Id);
  res = await call("POST", "/admin/users", { token: admin.token, body: { name: "Created Student", email: `cs-${suffix}@example.com`, password: "Test@1234", role: "STUDENT", phone: "01712345678" } });
  expectStatus("admin creates a student", res, 201);
  check("student profile with generated student id", /^STU-/.test(res.json?.data?.studentProfile?.studentId ?? ""));
  res = await call("POST", "/admin/users", { token: admin.token, body: { name: "Second Admin", email: `a2-${suffix}@example.com`, password: "Admin@1234", role: "ADMIN" } });
  expectStatus("admin creates another admin", res, 201);
  const admin2Id = res.json?.data?.id;

  console.log("\nADMIN: LIST + VIEW USERS");
  res = await call("GET", "/admin/users?role=TEACHER&page=1&limit=5", { token: admin.token });
  check("filter by role + pagination", res.status === 200 && res.json?.data?.every((u) => u.role === "TEACHER") && res.json?.meta?.limit === 5);
  res = await call("GET", `/admin/users?q=t2-${suffix}`, { token: admin.token });
  check("search by email", res.status === 200 && res.json?.meta?.total === 1);
  res = await call("GET", "/admin/users?sortBy=passwordHash", { token: admin.token });
  expectStatus("invalid sortBy rejected", res, 400);
  res = await call("GET", "/admin/users?role=KING", { token: admin.token });
  expectStatus("invalid role filter", res, 400);
  res = await call("GET", `/admin/users/${t2Id}`, { token: admin.token });
  expectStatus("get user by id", res, 200);
  res = await call("GET", `/admin/users/${randomUuid}`, { token: admin.token });
  expectStatus("unknown user", res, 404);

  console.log("\nOWNERSHIP: another teacher cannot touch this teacher's offering");
  res = await call("POST", "/attendance", { token: teacher.token, body: { offeringId: o1.id, date: "2026-01-05", records: [{ enrollmentId: enrollment.id, status: "PRESENT" }] } });
  expectStatus("owner teacher marks attendance (control)", res, 200);
  res = await call("POST", "/attendance", { token: t2.token, body: { offeringId: o1.id, date: "2026-01-05", records: [{ enrollmentId: enrollment.id, status: "ABSENT" }] } });
  expectStatus("other teacher cannot mark attendance", res, 403);
  res = await call("GET", `/attendance/offerings/${o1.id}`, { token: t2.token });
  expectStatus("other teacher cannot view attendance", res, 403);
  res = await call("PUT", "/results", { token: t2.token, body: { enrollmentId: enrollment.id, marks: 99 } });
  expectStatus("other teacher cannot enter results", res, 403);
  res = await call("GET", `/results/offerings/${o1.id}`, { token: t2.token });
  expectStatus("other teacher cannot list results", res, 403);
  res = await call("POST", `/results/offerings/${o1.id}/publish`, { token: t2.token });
  expectStatus("other teacher cannot publish results", res, 403);
  res = await call("GET", `/offerings/${o1.id}/enrollments`, { token: t2.token });
  expectStatus("other teacher cannot see the class list", res, 403);

  console.log("\nADMIN: CHANGE ROLE");
  const o2 = await must("POST", "/offerings", { courseId: course2.id, teacherId: t2Id, semester: `Admin ${suffix}`, section: "A", capacity: 10 }, admin.token, "offering 2");
  res = await call("PATCH", `/admin/users/${admin.id}/role`, { token: admin.token, body: { role: "STUDENT" } });
  expectStatus("cannot change your own role", res, 409);
  res = await call("PATCH", `/admin/users/${t2Id}/role`, { token: admin.token, body: { role: "SUPERUSER" } });
  expectStatus("invalid role value", res, 400);
  res = await call("PATCH", `/admin/users/${randomUuid}/role`, { token: admin.token, body: { role: "STUDENT" } });
  expectStatus("unknown user", res, 404);
  res = await call("PATCH", `/admin/users/${t2Id}/role`, { token: admin.token, body: { role: "TEACHER" } });
  expectStatus("same role", res, 409);
  res = await call("PATCH", `/admin/users/${t2Id}/role`, { token: s.token, body: { role: "ADMIN" } });
  expectStatus("student cannot promote anyone", res, 403);
  res = await call("PATCH", `/admin/users/${t2Id}/role`, { token: admin.token, body: { role: "STUDENT" } });
  expectStatus("teacher with an active offering cannot become a student", res, 409);
  res = await call("PATCH", `/offerings/${o2.id}/assign-teacher`, { token: admin.token, body: { teacherId: teacher.id } });
  expectStatus("admin reassigns the offering", res, 200);
  res = await call("PATCH", `/admin/users/${t2Id}/role`, { token: admin.token, body: { role: "STUDENT" } });
  expectStatus("role changed to STUDENT", res, 200);
  check("role is STUDENT and has a student profile", res.json?.data?.role === "STUDENT" && Boolean(res.json?.data?.studentProfile?.studentId));
  res = await call("GET", "/admin/users", { token: t2.token });
  expectStatus("old token of the demoted user loses admin-level access immediately", res, 403);
  res = await call("PATCH", `/admin/users/${t2Id}/role`, { token: admin.token, body: { role: "TEACHER" } });
  expectStatus("role changed back to TEACHER", res, 200);

  console.log("\nADMIN: SUSPEND / ACTIVATE");
  res = await call("PATCH", `/admin/users/${admin.id}/status`, { token: admin.token, body: { status: "SUSPENDED" } });
  expectStatus("cannot suspend yourself", res, 409);
  res = await call("PATCH", `/admin/users/${s.id}/status`, { token: admin.token, body: { status: "BANNED" } });
  expectStatus("invalid status value", res, 400);
  res = await call("PATCH", `/admin/users/${s.id}/status`, { token: admin.token, body: { status: "ACTIVE" } });
  expectStatus("already active", res, 409);
  res = await call("PATCH", `/admin/users/${s.id}/status`, { token: admin.token, body: { status: "SUSPENDED" } });
  expectStatus("admin suspends the student", res, 200);
  res = await call("GET", "/users/me", { token: s.token });
  expectStatus("suspended student's existing token stops working", res, 403);
  res = await call("POST", "/auth/login", { body: { email: studentEmail, password: "Test@1234" } });
  expectStatus("suspended student cannot log in", res, 403);
  res = await call("GET", "/admin/users?status=SUSPENDED&q=s6-a-" + suffix, { token: admin.token });
  check("suspended filter finds the student", res.status === 200 && res.json?.meta?.total === 1);
  res = await call("PATCH", `/admin/users/${s.id}/status`, { token: admin.token, body: { status: "ACTIVE" } });
  expectStatus("admin re-activates the student", res, 200);
  res = await call("POST", "/auth/login", { body: { email: studentEmail, password: "Test@1234" } });
  expectStatus("student can log in again", res, 200);

  console.log("\nNOTICES");
  res = await call("POST", "/notices", { body: { title: "Hello all", content: "Welcome" } });
  expectStatus("no token", res, 401);
  res = await call("POST", "/notices", { token: s.token, body: { title: "Student notice", content: "Hi" } });
  expectStatus("student cannot publish notices", res, 403);
  res = await call("POST", "/notices", { token: teacher.token, body: { title: "x", content: "" } });
  expectStatus("invalid notice", res, 400);
  res = await call("POST", "/notices", { token: teacher.token, body: { title: `Exam routine ${suffix}`, content: "Exams start next week", authorId: admin.id } });
  expectStatus("author cannot be set by the client", res, 400);
  res = await call("POST", "/notices", { token: teacher.token, body: { title: `Exam routine ${suffix}`, content: "Exams start next week" } });
  expectStatus("teacher publishes a notice", res, 201);
  check("author is the teacher", res.json?.data?.author?.id === teacher.id);
  const teacherNotice = res.json?.data;
  res = await call("POST", "/notices", { token: admin.token, body: { title: `Holiday ${suffix}`, content: "University closed on Friday" } });
  expectStatus("admin publishes a notice", res, 201);
  const adminNotice = res.json?.data;
  res = await call("GET", `/notices?q=${suffix}&page=1&limit=10`, { token: s.token });
  check("student reads notices (search + pagination)", res.status === 200 && res.json?.meta?.total === 2, `(got ${res.status}, total ${res.json?.meta?.total})`);
  res = await call("GET", "/notices?sortBy=authorId", { token: s.token });
  expectStatus("invalid sortBy rejected", res, 400);
  res = await call("GET", `/notices/${teacherNotice.id}`, { token: s.token });
  expectStatus("get notice by id", res, 200);
  res = await call("GET", `/notices/${randomUuid}`, { token: s.token });
  expectStatus("unknown notice", res, 404);
  res = await call("PATCH", `/notices/${teacherNotice.id}`, { token: teacher.token, body: { content: "Exams start on Sunday" } });
  expectStatus("teacher edits own notice", res, 200);
  res = await call("PATCH", `/notices/${adminNotice.id}`, { token: teacher.token, body: { content: "Hacked" } });
  expectStatus("teacher cannot edit an admin's notice", res, 403);
  res = await call("PATCH", `/notices/${teacherNotice.id}`, { token: t2.token, body: { content: "Hacked" } });
  expectStatus("another teacher cannot edit it either", res, 403);
  res = await call("PATCH", `/notices/${teacherNotice.id}`, { token: s.token, body: { content: "Hacked" } });
  expectStatus("student cannot edit notices", res, 403);
  res = await call("PATCH", `/notices/${teacherNotice.id}`, { token: admin.token, body: {} });
  expectStatus("empty update rejected", res, 400);
  res = await call("PATCH", `/notices/${teacherNotice.id}`, { token: admin.token, body: { title: `Exam routine (updated) ${suffix}` } });
  expectStatus("admin can edit any notice", res, 200);
  res = await call("DELETE", `/notices/${adminNotice.id}`, { token: teacher.token });
  expectStatus("teacher cannot delete an admin's notice", res, 403);
  res = await call("DELETE", `/notices/${teacherNotice.id}`, { token: teacher.token });
  expectStatus("teacher deletes own notice", res, 200);
  res = await call("GET", `/notices/${teacherNotice.id}`, { token: s.token });
  expectStatus("deleted notice is hidden", res, 404);
  res = await call("DELETE", `/notices/${adminNotice.id}`, { token: admin.token });
  expectStatus("admin deletes a notice", res, 200);
  res = await call("GET", `/notices?q=${suffix}`, { token: s.token });
  check("deleted notices are excluded from the list", res.status === 200 && res.json?.meta?.total === 0);

  console.log("\nADMIN: STATS");
  res = await call("GET", "/admin/stats", { token: admin.token });
  const st = res.json?.data;
  expectStatus("admin fetches dashboard stats", res, 200);
  check("user counts add up", st?.users?.total === st?.users?.byRole?.ADMIN + st?.users?.byRole?.TEACHER + st?.users?.byRole?.STUDENT && st?.users?.byRole?.ADMIN >= 2);
  check("academic counts present", st?.academics?.departments >= 1 && st?.academics?.offerings >= 2 && st?.academics?.activeEnrollments >= 1);
  check("seat utilization is a percentage", typeof st?.academics?.seatUtilizationPercent === "number" && st.academics.seatUtilizationPercent <= 100);
  check("finance block present", typeof st?.finance?.revenue === "string" && st?.finance?.invoices?.UNPAID !== undefined);
  check("top offerings list", Array.isArray(st?.topOfferings) && st.topOfferings.length >= 1);

  console.log("\nADMIN: SOFT DELETE USERS");
  res = await call("DELETE", `/admin/users/${admin.id}`, { token: admin.token });
  expectStatus("cannot delete yourself", res, 409);
  res = await call("DELETE", `/admin/users/${randomUuid}`, { token: admin.token });
  expectStatus("unknown user", res, 404);
  res = await call("DELETE", `/admin/users/${teacher.id}`, { token: admin.token });
  expectStatus("teacher with active offerings cannot be deleted", res, 409);
  res = await call("DELETE", `/admin/users/${s.id}`, { token: admin.token });
  expectStatus("student with active enrollment cannot be deleted", res, 409);
  res = await call("DELETE", `/admin/users/${t2Id}`, { token: s.token });
  expectStatus("student cannot delete users", res, 403);
  res = await call("DELETE", `/admin/users/${t2Id}`, { token: admin.token });
  expectStatus("admin deletes the second teacher (no offerings left)", res, 200);
  res = await call("GET", `/admin/users/${t2Id}`, { token: admin.token });
  expectStatus("deleted user is hidden", res, 404);
  res = await call("POST", "/auth/login", { body: { email: t2Email, password: t2Password } });
  expectStatus("deleted user cannot log in", res, 401);
  res = await call("GET", "/users/me", { token: t2.token });
  expectStatus("deleted user's old token stops working", res, 401);
  res = await call("DELETE", `/admin/users/${admin2Id}`, { token: admin.token });
  expectStatus("admin deletes the other admin (a second active admin remains)", res, 200);

  console.log("\nADMIN: AUDIT LOGS");
  res = await call("GET", `/admin/audit-logs?entity=User&entityId=${t2Id}&page=1&limit=20`, { token: admin.token });
  check("audit trail of the second teacher exists", res.status === 200 && res.json?.meta?.total >= 4, `(got ${res.status}, total ${res.json?.meta?.total})`);
  const actions = (res.json?.data ?? []).map((r) => r.action);
  check("role changes are logged", actions.filter((a) => a === "USER_ROLE_CHANGED").length === 2);
  check("creation and deletion are logged", actions.includes("USER_CREATED_BY_ADMIN") && actions.includes("USER_DELETED"));
  const roleLog = (res.json?.data ?? []).find((r) => r.action === "USER_ROLE_CHANGED");
  check("log has actor, before and after", roleLog?.actor?.id === admin.id && roleLog?.before?.role && roleLog?.after?.role);
  res = await call("GET", `/admin/audit-logs?action=NOTICE_DELETED&actorId=${teacher.id}`, { token: admin.token });
  check("filter by action + actor", res.status === 200 && res.json?.meta?.total >= 1);
  res = await call("GET", "/admin/audit-logs?limit=1&page=2", { token: admin.token });
  check("pagination works", res.status === 200 && res.json?.data?.length === 1 && res.json?.meta?.page === 2);
  res = await call("GET", "/admin/audit-logs?from=not-a-date", { token: admin.token });
  expectStatus("invalid date filter", res, 400);
  res = await call("GET", "/admin/audit-logs?from=2999-01-01", { token: admin.token });
  check("future date range is empty", res.status === 200 && res.json?.meta?.total === 0);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  console.log("Note: this script leaves its test data in the database.");
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error("Test run crashed:", err.message);
  process.exit(1);
});
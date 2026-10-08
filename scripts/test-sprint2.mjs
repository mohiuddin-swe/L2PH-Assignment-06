// Usage: node scripts/test-sprint2.mjs
// Needs the API running (npm run dev) and the seeded users. Node 18+ (built-in fetch).
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
    console.error(`Cannot login as ${role} (status ${res.status}). Did you run "npm run seed"? Is the API running at ${BASE}?`);
    process.exit(1);
  }
  return { token: res.json.data.accessToken, id: res.json.data.user.id };
};

const main = async () => {
  const admin = await login("admin");
  const teacher = await login("teacher");
  const student = await login("student");
  const suffix = String(Date.now()).slice(-6);
  const deptCode = `T${suffix}`;
  const courseCode = `CRS-${suffix}`;
  const randomUuid = "00000000-0000-4000-8000-000000000000";

  console.log("\nDEPARTMENTS");
  let res = await call("POST", "/departments", { token: student.token, body: { name: `Dept ${suffix}`, code: deptCode } });
  expectStatus("student cannot create department", res, 403);
  res = await call("POST", "/departments", { token: admin.token, body: { name: "x", code: "!" } });
  expectStatus("invalid body rejected", res, 400);
  check("validation returns errors[]", Array.isArray(res.json?.errors) && res.json.errors.length > 0);
  res = await call("POST", "/departments", { token: admin.token, body: { name: `Dept ${suffix}`, code: deptCode } });
  expectStatus("admin creates department", res, 201);
  const deptId = res.json?.data?.id;
  res = await call("POST", "/departments", { token: admin.token, body: { name: `Other ${suffix}`, code: deptCode } });
  expectStatus("duplicate code", res, 409);
  res = await call("GET", "/departments?page=1&limit=5", { token: student.token });
  expectStatus("student lists departments", res, 200);
  check("pagination meta present", res.json?.meta?.page === 1 && typeof res.json?.meta?.total === "number");
  res = await call("GET", `/departments?q=${deptCode}`, { token: admin.token });
  check("search by code finds it", res.status === 200 && res.json?.data?.length === 1);
  res = await call("GET", `/departments/${deptId}`, { token: teacher.token });
  expectStatus("get department by id", res, 200);
  res = await call("GET", `/departments/${randomUuid}`, { token: admin.token });
  expectStatus("unknown department id", res, 404);
  res = await call("GET", "/departments/not-a-uuid", { token: admin.token });
  expectStatus("malformed id", res, 400);
  res = await call("GET", "/departments", {});
  expectStatus("no token", res, 401);
  res = await call("PATCH", `/departments/${deptId}`, { token: admin.token, body: { name: `Dept Updated ${suffix}` } });
  expectStatus("admin updates department", res, 200);
  res = await call("PATCH", `/departments/${deptId}`, { token: student.token, body: { name: "Hack" } });
  expectStatus("student cannot update department", res, 403);

  console.log("\nCOURSES");
  res = await call("POST", "/courses", { token: student.token, body: { code: courseCode, title: "Algorithms", departmentId: deptId } });
  expectStatus("student cannot create course", res, 403);
  res = await call("POST", "/courses", { token: admin.token, body: { code: courseCode, title: "Algorithms", credit: 99, departmentId: deptId } });
  expectStatus("credit out of range", res, 400);
  res = await call("POST", "/courses", { token: admin.token, body: { code: courseCode, title: "Algorithms", departmentId: randomUuid } });
  expectStatus("unknown department", res, 404);
  res = await call("POST", "/courses", { token: admin.token, body: { code: courseCode, title: "Algorithms", credit: 3, departmentId: deptId } });
  expectStatus("admin creates course", res, 201);
  const courseId = res.json?.data?.id;
  res = await call("POST", "/courses", { token: admin.token, body: { code: courseCode, title: "Duplicate", departmentId: deptId } });
  expectStatus("duplicate course code", res, 409);
  res = await call("GET", `/courses?q=${courseCode}&departmentId=${deptId}&sortBy=title&order=asc&page=1&limit=10`, { token: student.token });
  check("search + filter + sort + pagination", res.status === 200 && res.json?.data?.length === 1 && res.json?.meta?.total === 1, `(got ${res.status})`);
  res = await call("GET", "/courses?sortBy=password", { token: admin.token });
  expectStatus("invalid sortBy rejected", res, 400);
  res = await call("GET", `/courses/${courseId}`, { token: student.token });
  expectStatus("get course by id", res, 200);
  res = await call("PATCH", `/courses/${courseId}`, { token: admin.token, body: { credit: 4 } });
  expectStatus("admin updates course", res, 200);
  check("credit updated", res.json?.data?.credit === 4);

  console.log("\nOFFERINGS");
  const offeringBody = { courseId, teacherId: teacher.id, semester: `Fall ${suffix}`, section: "a", capacity: 40 };
  res = await call("POST", "/offerings", { token: student.token, body: offeringBody });
  expectStatus("student cannot create offering", res, 403);
  res = await call("POST", "/offerings", { token: admin.token, body: { ...offeringBody, teacherId: student.id } });
  expectStatus("non-teacher cannot be assigned", res, 400);
  res = await call("POST", "/offerings", { token: admin.token, body: offeringBody });
  expectStatus("admin creates offering", res, 201);
  const offeringId = res.json?.data?.id;
  check("section uppercased, seats computed", res.json?.data?.section === "A" && res.json?.data?.availableSeats === 40);
  res = await call("POST", "/offerings", { token: admin.token, body: offeringBody });
  expectStatus("duplicate course+semester+section", res, 409);
  res = await call("GET", `/offerings?semester=Fall ${suffix}`, { token: student.token });
  check("student browses offerings", res.status === 200 && res.json?.data?.length === 1, `(got ${res.status})`);
  res = await call("GET", "/offerings/my-assigned", { token: teacher.token });
  check("teacher sees assigned offerings", res.status === 200 && res.json?.data?.some((o) => o.id === offeringId), `(got ${res.status})`);
  res = await call("GET", "/offerings/my-assigned", { token: student.token });
  expectStatus("student cannot use my-assigned", res, 403);
  res = await call("GET", "/offerings/my-assigned", { token: admin.token });
  expectStatus("admin cannot use my-assigned", res, 403);
  res = await call("PATCH", `/offerings/${offeringId}/capacity`, { token: admin.token, body: { capacity: 60 } });
  expectStatus("admin updates capacity", res, 200);
  res = await call("PATCH", `/offerings/${offeringId}/capacity`, { token: admin.token, body: { capacity: 0 } });
  expectStatus("capacity 0 rejected", res, 400);
  res = await call("PATCH", `/offerings/${offeringId}/assign-teacher`, { token: admin.token, body: { teacherId: teacher.id } });
  expectStatus("admin assigns teacher", res, 200);
  res = await call("PATCH", `/offerings/${offeringId}/assign-teacher`, { token: admin.token, body: { teacherId: student.id } });
  expectStatus("assigning a student as teacher", res, 400);
  res = await call("PATCH", `/offerings/${offeringId}/assign-teacher`, { token: teacher.token, body: { teacherId: teacher.id } });
  expectStatus("teacher cannot assign teachers", res, 403);

  console.log("\nSOFT DELETE + DELETE RULES");
  res = await call("DELETE", `/departments/${deptId}`, { token: admin.token });
  expectStatus("department with active courses cannot be deleted", res, 409);
  res = await call("DELETE", `/courses/${courseId}`, { token: admin.token });
  expectStatus("course with active offering cannot be deleted", res, 409);
  res = await call("DELETE", `/offerings/${offeringId}`, { token: student.token });
  expectStatus("student cannot delete offering", res, 403);
  res = await call("DELETE", `/offerings/${offeringId}`, { token: admin.token });
  expectStatus("admin deletes offering", res, 200);
  res = await call("GET", `/offerings/${offeringId}`, { token: admin.token });
  expectStatus("deleted offering is hidden", res, 404);
  res = await call("DELETE", `/courses/${courseId}`, { token: admin.token });
  expectStatus("admin deletes course", res, 200);
  res = await call("DELETE", `/courses/${courseId}`, { token: admin.token });
  expectStatus("deleting twice", res, 404);
  res = await call("DELETE", `/departments/${deptId}`, { token: admin.token });
  expectStatus("admin deletes department", res, 200);
  res = await call("GET", `/departments?q=${deptCode}`, { token: admin.token });
  check("deleted department excluded from list", res.status === 200 && res.json?.data?.length === 0);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  console.log("Also check the AuditLog table in Prisma Studio (DEPARTMENT_CREATED, COURSE_UPDATED, OFFERING_DELETED, ...).");
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error("Test run crashed:", err.message);
  process.exit(1);
});
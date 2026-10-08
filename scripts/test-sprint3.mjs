// Usage: node scripts/test-sprint3.mjs
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

const suffix = String(Date.now()).slice(-6);

const registerStudent = async (label) => {
  const res = await call("POST", "/auth/register", {
    body: { name: `Test ${label}`, email: `s3-${label}-${suffix}@example.com`, password: "Test@1234" },
  });
  if (res.status !== 201) {
    console.error(`Cannot register test student ${label} (status ${res.status}: ${res.json?.message})`);
    process.exit(1);
  }
  return { token: res.json.data.accessToken, id: res.json.data.user.id, email: res.json.data.user.email };
};

const main = async () => {
  const admin = await login("admin");
  const teacher = await login("teacher");
  const seededStudent = await login("student");
  const randomUuid = "00000000-0000-4000-8000-000000000000";
  const semester = `Spring ${suffix}`;

  // ---------- setup (admin creates a department, a course and two offerings of that course) ----------
  const setup = async (path, body, label) => {
    const res = await call("POST", path, { token: admin.token, body });
    if (res.status !== 201) {
      console.error(`Setup failed: ${label} (status ${res.status}: ${res.json?.message})`);
      process.exit(1);
    }
    return res.json.data;
  };
  const dept = await setup("/departments", { name: `Enroll Dept ${suffix}`, code: `E${suffix}` }, "department");
  const course = await setup("/courses", { code: `ENR-${suffix}`, title: "Enrollment Test", credit: 3, departmentId: dept.id }, "course");
  const offeringA = await setup("/offerings", { courseId: course.id, teacherId: teacher.id, semester, section: "A", capacity: 2 }, "offering A");
  const offeringB = await setup("/offerings", { courseId: course.id, teacherId: teacher.id, semester, section: "B", capacity: 5 }, "offering B");

  const students = {};
  for (const label of ["s1", "s2", "s3", "s4", "s5", "s6"]) students[label] = await registerStudent(label);
  const s1 = students.s1;

  const getOffering = async (id) => (await call("GET", `/offerings/${id}`, { token: admin.token })).json?.data;

  console.log("\nACCESS CONTROL + VALIDATION");
  let res = await call("POST", "/enrollments", { body: { offeringId: offeringA.id } });
  expectStatus("no token", res, 401);
  res = await call("POST", "/enrollments", { token: teacher.token, body: { offeringId: offeringA.id } });
  expectStatus("teacher cannot enroll", res, 403);
  res = await call("POST", "/enrollments", { token: admin.token, body: { offeringId: offeringA.id } });
  expectStatus("admin cannot enroll", res, 403);
  res = await call("POST", "/enrollments", { token: s1.token, body: { offeringId: "abc" } });
  expectStatus("invalid offeringId", res, 400);
  res = await call("POST", "/enrollments", { token: s1.token, body: { offeringId: offeringA.id, studentId: seededStudent.id } });
  expectStatus("extra field (studentId) rejected", res, 400);
  res = await call("POST", "/enrollments", { token: s1.token, body: { offeringId: randomUuid } });
  expectStatus("unknown offering", res, 404);

  console.log("\nENROLL");
  res = await call("POST", "/enrollments", { token: s1.token, body: { offeringId: offeringA.id } });
  expectStatus("student enrolls", res, 201);
  check("status is ENROLLED", res.json?.data?.status === "ENROLLED");
  const s1EnrollmentId = res.json?.data?.id;
  res = await call("POST", "/enrollments", { token: s1.token, body: { offeringId: offeringA.id } });
  expectStatus("enrolling twice", res, 409);
  res = await call("POST", "/enrollments", { token: s1.token, body: { offeringId: offeringB.id } });
  expectStatus("another section of the same course, same semester", res, 409);
  res = await call("GET", "/enrollments/my", { token: s1.token });
  check("my enrollments lists it", res.status === 200 && res.json?.data?.length === 1 && res.json?.meta?.total === 1, `(got ${res.status})`);
  res = await call("GET", "/enrollments/my?status=DROPPED", { token: s1.token });
  check("status filter works", res.status === 200 && res.json?.data?.length === 0);
  res = await call("GET", "/enrollments/my?status=NOPE", { token: s1.token });
  expectStatus("invalid status filter", res, 400);
  res = await call("GET", "/enrollments/my", { token: teacher.token });
  expectStatus("teacher cannot use /enrollments/my", res, 403);
  let offering = await getOffering(offeringA.id);
  check("seat counter updated (1 of 2)", offering?.enrolledCount === 1 && offering?.availableSeats === 1);

  console.log("\nRACE CONDITION (5 students fight for the last seat at the same time)");
  const racers = ["s2", "s3", "s4", "s5", "s6"].map((k) => students[k]);
  const results = await Promise.all(
    racers.map((s) => call("POST", "/enrollments", { token: s.token, body: { offeringId: offeringA.id } })),
  );
  const wins = results.filter((r) => r.status === 201);
  const conflicts = results.filter((r) => r.status === 409);
  const others = results.filter((r) => r.status !== 201 && r.status !== 409);
  check("exactly 1 request got the last seat", wins.length === 1, `(wins: ${wins.length})`);
  check("the other 4 were rejected with 409", conflicts.length === 4, `(409s: ${conflicts.length})`);
  check("no 500 errors under concurrency", others.length === 0, `(statuses: ${results.map((r) => r.status).join(",")})`);
  offering = await getOffering(offeringA.id);
  check("never overbooked (enrolled 2 of 2, 0 seats left)", offering?.enrolledCount === 2 && offering?.availableSeats === 0, `(enrolled ${offering?.enrolledCount})`);
  const winnerIndex = results.findIndex((r) => r.status === 201);
  const winner = racers[winnerIndex];

  console.log("\nDROP + RE-ENROLL");
  res = await call("POST", `/enrollments/${s1EnrollmentId}/drop`, { token: winner.token });
  expectStatus("cannot drop someone else's enrollment", res, 404);
  res = await call("POST", `/enrollments/${s1EnrollmentId}/drop`, { token: s1.token });
  expectStatus("student drops own enrollment", res, 200);
  check("status is DROPPED", res.json?.data?.status === "DROPPED");
  res = await call("POST", `/enrollments/${s1EnrollmentId}/drop`, { token: s1.token });
  expectStatus("dropping twice", res, 409);
  res = await call("POST", "/enrollments/not-a-uuid/drop", { token: s1.token });
  expectStatus("malformed enrollment id", res, 400);
  offering = await getOffering(offeringA.id);
  check("seat released (1 of 2)", offering?.enrolledCount === 1 && offering?.availableSeats === 1);
  res = await call("POST", "/enrollments", { token: s1.token, body: { offeringId: offeringA.id } });
  expectStatus("re-enroll after drop", res, 201);
  check("same enrollment row is reused", res.json?.data?.id === s1EnrollmentId);
  offering = await getOffering(offeringA.id);
  check("seat taken again (2 of 2)", offering?.enrolledCount === 2);
  res = await call("DELETE", `/offerings/${offeringA.id}`, { token: admin.token });
  expectStatus("offering with enrolled students cannot be deleted", res, 409);

  console.log("\nCREDIT LIMIT (max 18 credits per semester)");
  const capSemester = `Credits ${suffix}`;
  const capOfferings = [];
  for (let i = 1; i <= 4; i++) {
    const c = await setup("/courses", { code: `CAP${suffix}-${i}`, title: `Heavy Course ${i}`, credit: 6, departmentId: dept.id }, `course ${i}`);
    capOfferings.push(await setup("/offerings", { courseId: c.id, teacherId: teacher.id, semester: capSemester, section: "A", capacity: 10 }, `offering ${i}`));
  }
  for (let i = 0; i < 3; i++) {
    res = await call("POST", "/enrollments", { token: seededStudent.token, body: { offeringId: capOfferings[i].id } });
    expectStatus(`6-credit course #${i + 1}`, res, 201);
  }
  res = await call("POST", "/enrollments", { token: seededStudent.token, body: { offeringId: capOfferings[3].id } });
  expectStatus("4th course would exceed 18 credits", res, 409);
  check("error mentions the credit limit", /credit limit/i.test(res.json?.message ?? ""));

  console.log("\nTEACHER / ADMIN VIEW (GET /offerings/:id/enrollments)");
  res = await call("GET", `/offerings/${offeringA.id}/enrollments`, { token: teacher.token });
  check("owner teacher sees enrolled students", res.status === 200 && res.json?.data?.length === 2, `(got ${res.status}, rows ${res.json?.data?.length})`);
  check("student email is included", Boolean(res.json?.data?.[0]?.student?.email));
  res = await call("GET", `/offerings/${offeringA.id}/enrollments?q=s3-s1-${suffix}`, { token: teacher.token });
  check("search by email", res.status === 200 && res.json?.data?.length === 1);
  res = await call("GET", `/offerings/${offeringA.id}/enrollments?page=1&limit=1`, { token: admin.token });
  check("admin can view, pagination works", res.status === 200 && res.json?.data?.length === 1 && res.json?.meta?.total === 2);
  res = await call("GET", `/offerings/${offeringA.id}/enrollments`, { token: s1.token });
  expectStatus("student cannot view the class list", res, 403);
  res = await call("GET", `/offerings/${offeringA.id}/enrollments`);
  expectStatus("no token", res, 401);
  res = await call("GET", `/offerings/${randomUuid}/enrollments`, { token: teacher.token });
  expectStatus("unknown offering", res, 404);
  res = await call("GET", `/offerings/${offeringA.id}/enrollments?status=NOPE`, { token: teacher.token });
  expectStatus("invalid status filter", res, 400);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  console.log("Check AuditLog in Prisma Studio: ENROLLMENT_CREATED / ENROLLMENT_DROPPED rows.");
  console.log("Note: this script leaves its test data in the database (enrolled students block deletes).");
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error("Test run crashed:", err.message);
  process.exit(1);
});
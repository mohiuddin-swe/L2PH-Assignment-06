// Usage: node scripts/test-sprint4.mjs
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
    body: { name: `Test ${label}`, email: `s4-${label}-${suffix}@example.com`, password: "Test@1234" },
  });
  if (res.status !== 201) {
    console.error(`Cannot register test student ${label} (status ${res.status}: ${res.json?.message})`);
    process.exit(1);
  }
  return { token: res.json.data.accessToken, id: res.json.data.user.id };
};

const main = async () => {
  const admin = await login("admin");
  const teacher = await login("teacher");
  const a = await registerStudent("a");
  const b = await registerStudent("b");
  const randomUuid = "00000000-0000-4000-8000-000000000000";
  const sem1 = `Sem1 ${suffix}`;
  const sem2 = `Sem2 ${suffix}`;

  const setup = async (method, path, body, token, label) => {
    const res = await call(method, path, { token, body });
    if (![200, 201].includes(res.status)) {
      console.error(`Setup failed: ${label} (status ${res.status}: ${res.json?.message})`);
      process.exit(1);
    }
    return res.json.data;
  };

  // ---------- setup: 3 courses (3, 4 and 3 credits), 3 offerings, students enrolled ----------
  const dept = await setup("POST", "/departments", { name: `Sprint4 Dept ${suffix}`, code: `A${suffix}` }, admin.token, "department");
  const mkOffering = async (n, credit, semester) => {
    const course = await setup("POST", "/courses", { code: `A4${n}-${suffix}`, title: `Sprint4 Course ${n}`, credit, departmentId: dept.id }, admin.token, `course ${n}`);
    return setup("POST", "/offerings", { courseId: course.id, teacherId: teacher.id, semester, section: "A", capacity: 10 }, admin.token, `offering ${n}`);
  };
  const o1 = await mkOffering(1, 3, sem1);
  const o2 = await mkOffering(2, 4, sem1);
  const o3 = await mkOffering(3, 3, sem2);
  const enroll = (student, offering) => setup("POST", "/enrollments", { offeringId: offering.id }, student.token, "enroll");
  const aE1 = await enroll(a, o1);
  const aE2 = await enroll(a, o2);
  const aE3 = await enroll(a, o3);
  const bE1 = await enroll(b, o1);

  const day1 = "2026-01-05";
  const day2 = "2026-01-06";
  const day3 = "2026-01-07";
  const day4 = "2026-01-08";

  console.log("\nATTENDANCE: ACCESS CONTROL + VALIDATION");
  const mark = (token, body) => call("POST", "/attendance", { token, body });
  const rec = (enrollmentId, status) => ({ enrollmentId, status });
  let res = await mark(undefined, { offeringId: o1.id, date: day1, records: [rec(aE1.id, "PRESENT")] });
  expectStatus("no token", res, 401);
  res = await mark(a.token, { offeringId: o1.id, date: day1, records: [rec(aE1.id, "PRESENT")] });
  expectStatus("student cannot mark attendance", res, 403);
  res = await mark(admin.token, { offeringId: o1.id, date: day1, records: [rec(aE1.id, "PRESENT")] });
  expectStatus("admin cannot mark attendance", res, 403);
  res = await mark(teacher.token, { offeringId: o1.id, date: "05-01-2026", records: [rec(aE1.id, "PRESENT")] });
  expectStatus("bad date format", res, 400);
  res = await mark(teacher.token, { offeringId: o1.id, date: "2026-02-30", records: [rec(aE1.id, "PRESENT")] });
  expectStatus("impossible calendar date", res, 400);
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  res = await mark(teacher.token, { offeringId: o1.id, date: future, records: [rec(aE1.id, "PRESENT")] });
  expectStatus("future date", res, 400);
  res = await mark(teacher.token, { offeringId: o1.id, date: day1, records: [] });
  expectStatus("empty records", res, 400);
  res = await mark(teacher.token, { offeringId: o1.id, date: day1, records: [rec(aE1.id, "MAYBE")] });
  expectStatus("invalid status value", res, 400);
  res = await mark(teacher.token, { offeringId: o1.id, date: day1, records: [rec(aE1.id, "PRESENT"), rec(aE1.id, "ABSENT")] });
  expectStatus("duplicate enrollment in one request", res, 400);
  res = await mark(teacher.token, { offeringId: randomUuid, date: day1, records: [rec(aE1.id, "PRESENT")] });
  expectStatus("unknown offering", res, 404);
  res = await mark(teacher.token, { offeringId: o1.id, date: day1, records: [rec(aE2.id, "PRESENT")] });
  expectStatus("enrollment of another offering", res, 400);

  console.log("\nATTENDANCE: MARKING");
  res = await mark(teacher.token, { offeringId: o1.id, date: day1, records: [rec(aE1.id, "PRESENT"), rec(bE1.id, "PRESENT")] });
  expectStatus("teacher marks day 1", res, 200);
  check("saved count returned", res.json?.data?.saved === 2);
  res = await mark(teacher.token, { offeringId: o1.id, date: day2, records: [rec(aE1.id, "LATE"), rec(bE1.id, "ABSENT")] });
  expectStatus("teacher marks day 2", res, 200);
  res = await mark(teacher.token, { offeringId: o1.id, date: day3, records: [rec(aE1.id, "ABSENT"), rec(bE1.id, "PRESENT")] });
  expectStatus("teacher marks day 3", res, 200);
  res = await mark(teacher.token, { offeringId: o1.id, date: day3, records: [rec(aE1.id, "PRESENT")] });
  expectStatus("re-marking the same day updates it", res, 200);
  res = await mark(teacher.token, { offeringId: o1.id, date: day4, records: [rec(aE1.id, "ABSENT")] });
  expectStatus("teacher marks day 4 (only student a)", res, 200);

  console.log("\nATTENDANCE: VIEWS");
  res = await call("GET", `/attendance/offerings/${o1.id}?date=${day3}`, { token: teacher.token });
  check("re-marking did not create a duplicate (2 rows for day 3)", res.status === 200 && res.json?.meta?.total === 2, `(got ${res.status}, total ${res.json?.meta?.total})`);
  check("day 3 row for student a is PRESENT", res.json?.data?.some((r) => r.student?.id === a.id && r.status === "PRESENT"));
  res = await call("GET", `/attendance/offerings/${o1.id}?status=ABSENT`, { token: admin.token });
  check("admin can view, filter by status (2 absences)", res.status === 200 && res.json?.meta?.total === 2, `(got ${res.status}, total ${res.json?.meta?.total})`);
  res = await call("GET", `/attendance/offerings/${o1.id}?page=1&limit=3`, { token: teacher.token });
  check("pagination (3 of 7 rows)", res.status === 200 && res.json?.data?.length === 3 && res.json?.meta?.total === 7, `(got ${res.json?.data?.length} of ${res.json?.meta?.total})`);
  res = await call("GET", `/attendance/offerings/${o1.id}`, { token: a.token });
  expectStatus("student cannot view class attendance", res, 403);
  res = await call("GET", `/attendance/offerings/${randomUuid}`, { token: teacher.token });
  expectStatus("unknown offering", res, 404);
  res = await call("GET", "/attendance/my", { token: teacher.token });
  expectStatus("teacher cannot use /attendance/my", res, 403);
  res = await call("GET", `/attendance/my?offeringId=${o1.id}`, { token: a.token });
  const aSummary = res.json?.data?.[0]?.summary;
  check(
    "student a summary: 4 classes, 2 present, 1 late, 1 absent, 75%",
    res.status === 200 && aSummary?.totalClasses === 4 && aSummary?.present === 2 && aSummary?.late === 1 && aSummary?.absent === 1 && aSummary?.percentage === 75,
    `(got ${JSON.stringify(aSummary)})`,
  );
  res = await call("GET", `/attendance/my?offeringId=${o1.id}`, { token: b.token });
  check("student b only sees own data (3 classes)", res.status === 200 && res.json?.data?.[0]?.summary?.totalClasses === 3);
  res = await call("GET", `/attendance/my?offeringId=${o2.id}`, { token: a.token });
  check("offering with no classes yet: percentage is null", res.status === 200 && res.json?.data?.[0]?.summary?.percentage === null);

  console.log("\nRESULTS: ACCESS CONTROL + VALIDATION");
  const save = (token, body) => call("PUT", "/results", { token, body });
  res = await save(undefined, { enrollmentId: aE1.id, marks: 80 });
  expectStatus("no token", res, 401);
  res = await save(a.token, { enrollmentId: aE1.id, marks: 80 });
  expectStatus("student cannot enter results", res, 403);
  res = await save(admin.token, { enrollmentId: aE1.id, marks: 80 });
  expectStatus("admin cannot enter results", res, 403);
  res = await save(teacher.token, { enrollmentId: aE1.id, marks: 101 });
  expectStatus("marks above 100", res, 400);
  res = await save(teacher.token, { enrollmentId: aE1.id, marks: -1 });
  expectStatus("negative marks", res, 400);
  res = await save(teacher.token, { enrollmentId: aE1.id, marks: "80" });
  expectStatus("marks must be a number", res, 400);
  res = await save(teacher.token, { enrollmentId: randomUuid, marks: 80 });
  expectStatus("unknown enrollment", res, 404);

  console.log("\nRESULTS: DRAFT -> PUBLISH");
  res = await save(teacher.token, { enrollmentId: aE1.id, marks: 85 });
  expectStatus("teacher saves marks", res, 200);
  check("saved as DRAFT with grade A+", res.json?.data?.status === "DRAFT" && res.json?.data?.grade === "A+");
  res = await save(teacher.token, { enrollmentId: aE1.id, marks: 90 });
  expectStatus("teacher corrects marks while DRAFT", res, 200);
  res = await call("GET", "/results/my", { token: a.token });
  check("student sees nothing while results are DRAFT", res.status === 200 && res.json?.data?.results?.length === 0 && res.json?.data?.cgpa === 0);
  res = await save(teacher.token, { enrollmentId: bE1.id, marks: 79.5 });
  check("79.5 marks -> grade A (boundary below 80)", res.status === 200 && res.json?.data?.grade === "A" && res.json?.data?.gradePoint === 3.75, `(got ${JSON.stringify(res.json?.data)})`);
  res = await save(teacher.token, { enrollmentId: bE1.id, marks: 30 });
  check("30 marks -> grade F, 0.00 points", res.status === 200 && res.json?.data?.grade === "F" && res.json?.data?.gradePoint === 0);

  res = await call("POST", `/results/offerings/${o2.id}/publish`, { token: teacher.token });
  expectStatus("cannot publish while a student has no result", res, 409);
  res = await call("POST", `/results/offerings/${o1.id}/publish`, { token: a.token });
  expectStatus("student cannot publish", res, 403);
  res = await call("POST", `/results/offerings/${randomUuid}/publish`, { token: teacher.token });
  expectStatus("publish unknown offering", res, 404);
  res = await call("GET", `/results/offerings/${o1.id}?status=DRAFT`, { token: teacher.token });
  check("teacher lists DRAFT results (2)", res.status === 200 && res.json?.meta?.total === 2, `(got ${res.status}, total ${res.json?.meta?.total})`);
  res = await call("GET", `/results/offerings/${o1.id}`, { token: a.token });
  expectStatus("student cannot list offering results", res, 403);

  res = await call("POST", `/results/offerings/${o1.id}/publish`, { token: teacher.token });
  expectStatus("teacher publishes offering 1", res, 200);
  check("published 2 results", res.json?.data?.published === 2);
  res = await call("POST", `/results/offerings/${o1.id}/publish`, { token: teacher.token });
  expectStatus("publishing again (nothing left in DRAFT)", res, 409);
  res = await save(teacher.token, { enrollmentId: aE1.id, marks: 50 });
  expectStatus("published result cannot be changed", res, 409);
  res = await call("POST", `/enrollments/${aE1.id}/drop`, { token: a.token });
  expectStatus("cannot drop a course whose result is published", res, 409);
  res = await call("GET", `/results/offerings/${o1.id}?status=PUBLISHED`, { token: admin.token });
  check("admin can list results, filter PUBLISHED (2)", res.status === 200 && res.json?.meta?.total === 2);

  console.log("\nRESULTS: GPA / CGPA (credit weighted)");
  res = await save(teacher.token, { enrollmentId: aE2.id, marks: 62 });
  check("62 marks -> B, 3.00", res.status === 200 && res.json?.data?.grade === "B" && res.json?.data?.gradePoint === 3);
  res = await call("POST", `/results/offerings/${o2.id}/publish`, { token: teacher.token });
  expectStatus("publish offering 2", res, 200);
  res = await save(teacher.token, { enrollmentId: aE3.id, marks: 30 });
  expectStatus("semester 2: student a fails (30 marks)", res, 200);
  res = await call("POST", `/results/offerings/${o3.id}/publish`, { token: admin.token });
  expectStatus("admin can publish results", res, 200);

  res = await call("GET", "/results/my", { token: a.token });
  const my = res.json?.data;
  expectStatus("student a views results", res, 200);
  check("3 published results", my?.results?.length === 3, `(got ${my?.results?.length})`);
  const s1 = my?.semesters?.find((s) => s.semester === sem1);
  const s2 = my?.semesters?.find((s) => s.semester === sem2);
  check("semester 1 GPA = (4.00*3 + 3.00*4) / 7 = 3.43", s1?.gpa === 3.43 && s1?.totalCredits === 7, `(got ${JSON.stringify(s1)})`);
  check("semester 2 GPA = 0 (failed course counts its credits)", s2?.gpa === 0 && s2?.totalCredits === 3, `(got ${JSON.stringify(s2)})`);
  check("CGPA = 24 / 10 = 2.40, 10 credits", my?.cgpa === 2.4 && my?.totalCredits === 10, `(got cgpa ${my?.cgpa}, credits ${my?.totalCredits})`);
  res = await call("GET", `/results/my?semester=${encodeURIComponent(sem2)}`, { token: a.token });
  check("semester filter lists 1 result but CGPA stays overall", res.status === 200 && res.json?.data?.results?.length === 1 && res.json?.data?.cgpa === 2.4);
  res = await call("GET", "/results/my", { token: teacher.token });
  expectStatus("teacher cannot use /results/my", res, 403);
  res = await call("GET", "/results/my", { token: b.token });
  check("student b CGPA is separate (F in offering 1 -> 0)", res.status === 200 && res.json?.data?.results?.length === 1 && res.json?.data?.cgpa === 0);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  console.log("Check AuditLog in Prisma Studio: ATTENDANCE_MARKED, RESULT_CREATED, RESULT_UPDATED, RESULTS_PUBLISHED.");
  console.log("Note: this script leaves its test data in the database.");
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error("Test run crashed:", err.message);
  process.exit(1);
});
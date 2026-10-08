// Usage: node scripts/test-sprint5.mjs
// Needs the API running (npm run dev) and the seeded users. Node 18+ (built-in fetch).
// Without SSLCOMMERZ_* keys in .env the gateway-dependent checks are skipped (not failed).
const BASE = process.env.BASE_URL ?? "http://localhost:5001/api/v1";
const ACCOUNTS = {
  admin: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@ums.test", password: process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345" },
  teacher: { email: process.env.SEED_TEACHER_EMAIL ?? "teacher@ums.test", password: process.env.SEED_TEACHER_PASSWORD ?? "Teacher@12345" },
};

let passed = 0;
let failed = 0;
let skipped = 0;

const call = async (method, path, { token, body, form } = {}) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (form) {
    payload = new URLSearchParams(form); // like the payment gateway: urlencoded form post
  } else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
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

const skip = (name) => {
  skipped++;
  console.log(`  SKIP  ${name} (no SSLCOMMERZ keys configured)`);
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
    body: { name: `Test ${label}`, email: `s5-${label}-${suffix}@example.com`, password: "Test@1234" },
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
  const s = await registerStudent("a");
  const other = await registerStudent("b");
  const randomUuid = "00000000-0000-4000-8000-000000000000";
  const semester = `Pay ${suffix}`;

  const setup = async (path, body, label) => {
    const res = await call("POST", path, { token: admin.token, body });
    if (res.status !== 201) {
      console.error(`Setup failed: ${label} (status ${res.status}: ${res.json?.message})`);
      process.exit(1);
    }
    return res.json.data;
  };
  const dept = await setup("/departments", { name: `Pay Dept ${suffix}`, code: `P${suffix}` }, "department");
  const course = await setup("/courses", { code: `PAY-${suffix}`, title: "Payment Test", credit: 3, departmentId: dept.id }, "course");
  const offering = await setup("/offerings", { courseId: course.id, teacherId: teacher.id, semester, section: "A", capacity: 10 }, "offering");

  console.log("\nINVOICES: ACCESS CONTROL + VALIDATION");
  const invoiceBody = { studentId: s.id, title: `Tuition Fee ${suffix}`, semester, amount: 5000 };
  let res = await call("POST", "/invoices", { body: invoiceBody });
  expectStatus("no token", res, 401);
  res = await call("POST", "/invoices", { token: s.token, body: invoiceBody });
  expectStatus("student cannot create invoice", res, 403);
  res = await call("POST", "/invoices", { token: teacher.token, body: invoiceBody });
  expectStatus("teacher cannot create invoice", res, 403);
  res = await call("POST", "/invoices", { token: admin.token, body: { ...invoiceBody, amount: -5 } });
  expectStatus("negative amount", res, 400);
  res = await call("POST", "/invoices", { token: admin.token, body: { ...invoiceBody, amount: 10.123 } });
  expectStatus("more than 2 decimal places", res, 400);
  res = await call("POST", "/invoices", { token: admin.token, body: { ...invoiceBody, status: "PAID" } });
  expectStatus("extra field (status) rejected", res, 400);
  res = await call("POST", "/invoices", { token: admin.token, body: { ...invoiceBody, studentId: randomUuid } });
  expectStatus("unknown student", res, 404);
  res = await call("POST", "/invoices", { token: admin.token, body: { ...invoiceBody, studentId: teacher.id } });
  expectStatus("a teacher is not a student", res, 404);

  console.log("\nINVOICES: CREATE + VIEW");
  res = await call("POST", "/invoices", { token: admin.token, body: invoiceBody });
  expectStatus("admin creates invoice", res, 201);
  check("status is UNPAID", res.json?.data?.status === "UNPAID");
  const invoice = res.json?.data;
  res = await call("POST", "/invoices", { token: admin.token, body: { studentId: s.id, title: `Library Fee ${suffix}`, semester: `Other ${suffix}`, amount: 1200.5 } });
  expectStatus("admin creates a second invoice (decimal amount)", res, 201);
  res = await call("GET", "/invoices/my", { token: s.token });
  check("student sees own 2 invoices", res.status === 200 && res.json?.meta?.total === 2, `(got ${res.status}, total ${res.json?.meta?.total})`);
  res = await call("GET", "/invoices/my?status=PAID", { token: s.token });
  check("status filter (no paid invoice yet)", res.status === 200 && res.json?.meta?.total === 0);
  res = await call("GET", "/invoices/my", { token: other.token });
  check("other student sees none", res.status === 200 && res.json?.meta?.total === 0);
  res = await call("GET", "/invoices/my", { token: admin.token });
  expectStatus("admin cannot use /invoices/my", res, 403);
  res = await call("GET", `/invoices/${invoice.id}`, { token: s.token });
  check("student views own invoice (with payments list)", res.status === 200 && Array.isArray(res.json?.data?.payments));
  res = await call("GET", `/invoices/${invoice.id}`, { token: other.token });
  expectStatus("other student cannot see it (404, not 403)", res, 404);
  res = await call("GET", `/invoices/${invoice.id}`, { token: admin.token });
  expectStatus("admin views any invoice", res, 200);
  res = await call("GET", `/invoices/${invoice.id}`, { token: teacher.token });
  expectStatus("teacher cannot view invoices", res, 403);
  res = await call("GET", "/invoices/not-a-uuid", { token: admin.token });
  expectStatus("malformed id", res, 400);
  res = await call("GET", `/invoices?studentId=${s.id}&status=UNPAID&sortBy=amount&order=asc`, { token: admin.token });
  check("admin list: filter + sort by amount", res.status === 200 && res.json?.meta?.total === 2 && Number(res.json?.data?.[0]?.amount) === 1200.5, `(got ${res.json?.data?.[0]?.amount})`);
  res = await call("GET", `/invoices?q=Tuition&studentId=${s.id}`, { token: admin.token });
  check("admin list: search by title", res.status === 200 && res.json?.meta?.total === 1);
  res = await call("GET", "/invoices?sortBy=password", { token: admin.token });
  expectStatus("invalid sortBy rejected", res, 400);
  res = await call("GET", "/invoices", { token: s.token });
  expectStatus("student cannot list all invoices", res, 403);

  console.log("\nBUSINESS RULE: unpaid fee blocks enrollment");
  res = await call("POST", "/enrollments", { token: s.token, body: { offeringId: offering.id } });
  expectStatus("enrollment blocked while the semester fee is unpaid", res, 402);
  check("message tells the student to pay", /pay your fee/i.test(res.json?.message ?? ""));

  console.log("\nPAYMENTS: ACCESS CONTROL + VALIDATION");
  const initiate = (token, body) => call("POST", "/payments/initiate", { token, body });
  res = await initiate(undefined, { invoiceId: invoice.id });
  expectStatus("no token", res, 401);
  res = await initiate(teacher.token, { invoiceId: invoice.id });
  expectStatus("teacher cannot pay", res, 403);
  res = await initiate(admin.token, { invoiceId: invoice.id });
  expectStatus("admin cannot pay", res, 403);
  res = await initiate(s.token, { invoiceId: "abc" });
  expectStatus("invalid invoiceId", res, 400);
  res = await initiate(s.token, { invoiceId: invoice.id, amount: 1 });
  expectStatus("extra field (amount) rejected", res, 400);
  res = await call("GET", "/payments", { token: s.token });
  expectStatus("student cannot list all payments", res, 403);
  res = await call("GET", "/payments?status=SUCCESS&page=1&limit=5", { token: admin.token });
  check("admin lists payments with pagination", res.status === 200 && typeof res.json?.meta?.total === "number");
  res = await call("GET", "/payments/my", { token: admin.token });
  expectStatus("admin cannot use /payments/my", res, 403);

  console.log("\nPAYMENTS: GATEWAY CALLBACK SAFETY (works without keys)");
  res = await call("POST", "/payments/gateway/success", { form: { val_id: "x" } });
  expectStatus("callback without tran_id", res, 400);
  res = await call("POST", "/payments/gateway/success", { form: { tran_id: "UMS-unknown", val_id: "x", status: "VALID" } });
  expectStatus("callback for an unknown transaction", res, 404);
  res = await call("POST", "/payments/gateway/fail", { form: { tran_id: "UMS-unknown" } });
  expectStatus("fail callback for unknown transaction", res, 404);
  res = await call("POST", "/payments/gateway/ipn", { form: { tran_id: "UMS-unknown", status: "VALID", val_id: "x" } });
  expectStatus("IPN for unknown transaction", res, 404);

  console.log("\nPAYMENTS: INITIATE + FORGED CALLBACKS (needs SSLCommerz sandbox keys)");
  res = await initiate(s.token, { invoiceId: randomUuid });
  const configured = res.status !== 503;
  if (!configured) {
    skip("initiate payment, supersede, forged callback, cancel callback");
  } else {
    expectStatus("unknown invoice", res, 404);
    res = await initiate(other.token, { invoiceId: invoice.id });
    expectStatus("cannot pay someone else's invoice", res, 404);

    res = await initiate(s.token, { invoiceId: invoice.id });
    expectStatus("student initiates payment", res, 201);
    check("gateway URL returned", typeof res.json?.data?.gatewayUrl === "string" && res.json.data.gatewayUrl.startsWith("https://"), `(got ${res.json?.data?.gatewayUrl})`);
    check("transaction id generated", String(res.json?.data?.transactionId).startsWith("UMS-"));
    const tran1 = res.json?.data?.transactionId;
    console.log(`        gateway page: ${res.json?.data?.gatewayUrl}`);

    res = await initiate(s.token, { invoiceId: invoice.id });
    expectStatus("a second attempt creates a new payment", res, 201);
    const tran2 = res.json?.data?.transactionId;
    res = await call("GET", "/payments/my?status=CANCELLED", { token: s.token });
    check("the older unfinished attempt was superseded (CANCELLED)", res.status === 200 && res.json?.meta?.total === 1);
    res = await call("GET", "/payments/my?status=PENDING", { token: s.token });
    check("only one PENDING payment per invoice", res.status === 200 && res.json?.meta?.total === 1);

    res = await call("PATCH", `/invoices/${invoice.id}/cancel`, { token: admin.token });
    expectStatus("cannot cancel an invoice with a pending payment", res, 409);

    res = await call("POST", "/payments/gateway/success", { form: { tran_id: tran2, val_id: "FAKE-VAL-ID", status: "VALID", amount: "5000.00" } });
    check("FORGED success callback is rejected", res.status === 400 || res.status === 502, `(got ${res.status})`);
    res = await call("GET", `/invoices/${invoice.id}`, { token: s.token });
    check("invoice is still UNPAID after the forged callback", res.json?.data?.status === "UNPAID");
    res = await call("GET", "/payments/my?status=PENDING", { token: s.token });
    check("payment is still PENDING after the forged callback", res.json?.meta?.total === 1);
    res = await call("POST", "/payments/gateway/success", { form: { tran_id: tran1, val_id: "FAKE", status: "VALID" } });
    expectStatus("callback for an already cancelled payment", res, 409);

    res = await call("POST", "/payments/gateway/cancel", { form: { tran_id: tran2 } });
    expectStatus("gateway cancel callback", res, 200);
    check("payment is CANCELLED", res.json?.data?.status === "CANCELLED");
    res = await call("GET", "/payments/my?status=PENDING", { token: s.token });
    check("no pending payment left", res.json?.meta?.total === 0);
    res = await initiate(s.token, { invoiceId: invoice.id });
    expectStatus("student can retry after cancelling", res, 201);
    const tran3 = res.json?.data?.transactionId;
    res = await call("POST", "/payments/gateway/fail", { form: { tran_id: tran3 } });
    check("gateway fail callback marks FAILED", res.status === 200 && res.json?.data?.status === "FAILED");
  }

  console.log("\nINVOICE CANCEL + RULE RELEASE");
  res = await call("PATCH", `/invoices/${invoice.id}/cancel`, { token: s.token });
  expectStatus("student cannot cancel invoice", res, 403);
  res = await call("PATCH", `/invoices/${invoice.id}/cancel`, { token: admin.token });
  expectStatus("admin cancels the unpaid invoice", res, 200);
  check("status is CANCELLED", res.json?.data?.status === "CANCELLED");
  res = await call("PATCH", `/invoices/${invoice.id}/cancel`, { token: admin.token });
  expectStatus("cancelling twice", res, 409);
  res = await call("POST", "/enrollments", { token: s.token, body: { offeringId: offering.id } });
  expectStatus("enrollment allowed once the invoice is no longer unpaid", res, 201);

  console.log(`\nResult: ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}`);
  console.log("Check AuditLog in Prisma Studio: INVOICE_CREATED, PAYMENT_INITIATED, PAYMENT_CANCELLED, INVOICE_CANCELLED.");
  console.log("The REAL paid flow (sandbox card) is tested by hand: see the guide.");
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error("Test run crashed:", err.message);
  process.exit(1);
});
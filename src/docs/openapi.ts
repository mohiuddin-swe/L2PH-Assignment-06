// OpenAPI 3.0 description of the whole API. Served by Swagger UI at /api/v1/docs.
type Obj = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const uuid = { type: "string", format: "uuid" };
const str = (extra: Obj = {}) => ({ type: "string", ...extra });
const num = (extra: Obj = {}) => ({ type: "number", ...extra });
const int = (extra: Obj = {}) => ({ type: "integer", ...extra });
// `required` must be omitted (not empty) in OpenAPI 3.0
const obj = (properties: Obj, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const arr = (items: Obj) => ({ type: "array", items });
const en = (...values: string[]) => ({ type: "string", enum: values });

const query = (name: string, schema: Obj, description?: string) => ({ name, in: "query", required: false, schema, description });
const pageQuery = [{ $ref: "#/components/parameters/Page" }, { $ref: "#/components/parameters/Limit" }];
const sortQuery = (...fields: string[]) => [
  query("sortBy", en(...fields), "Sort field (whitelisted)"),
  query("order", en("asc", "desc")),
];

interface Op {
  tag: string;
  summary: string;
  description?: string;
  auth?: boolean; // default true
  roles?: string[];
  body?: Obj;
  form?: Obj; // x-www-form-urlencoded body (payment gateway callbacks)
  query?: Obj[];
  paginated?: boolean;
  status?: number; // success status, default 200
  conflict?: boolean;
  data?: Obj; // schema of the `data` field
}

const paths: Record<string, Record<string, Obj>> = {};

const add = (method: "get" | "post" | "put" | "patch" | "delete", path: string, o: Op) => {
  const hasId = path.includes("{id}");
  const auth = o.auth !== false;
  const success = o.status ?? 200;

  const responses: Obj = {
    [success]: {
      description: "Success",
      content: {
        "application/json": {
          schema: o.paginated
            ? { allOf: [ref("SuccessResponse"), { type: "object", properties: { data: o.data ?? arr({ type: "object" }), meta: ref("PaginationMeta") } }] }
            : { allOf: [ref("SuccessResponse"), ...(o.data ? [{ type: "object", properties: { data: o.data } }] : [])] },
        },
      },
    },
  };
  if (o.body || o.query || o.form || hasId) responses["400"] = { $ref: "#/components/responses/ValidationError" };
  if (auth) responses["401"] = { $ref: "#/components/responses/Unauthorized" };
  if (o.roles) responses["403"] = { $ref: "#/components/responses/Forbidden" };
  if (hasId || o.roles) responses["404"] = { $ref: "#/components/responses/NotFound" };
  if (o.conflict) responses["409"] = { $ref: "#/components/responses/Conflict" };

  const parameters: Obj[] = [];
  if (hasId) parameters.push({ $ref: "#/components/parameters/IdPath" });
  if (o.paginated) parameters.push(...pageQuery);
  if (o.query) parameters.push(...o.query);

  (paths[path] ??= {})[method] = {
    tags: [o.tag],
    summary: o.summary,
    description: [o.description, o.roles ? `**Allowed roles:** ${o.roles.join(", ")}` : auth ? "**Allowed roles:** any logged-in user" : "**Public**"]
      .filter(Boolean)
      .join("\n\n"),
    security: auth ? [{ bearerAuth: [] }] : [],
    ...(parameters.length ? { parameters } : {}),
    ...(o.body ? { requestBody: { required: true, content: { "application/json": { schema: o.body } } } } : {}),
    ...(o.form ? { requestBody: { required: true, content: { "application/x-www-form-urlencoded": { schema: o.form } } } } : {}),
    responses,
  };
};

const A = ["ADMIN"];
const T = ["TEACHER"];
const S = ["STUDENT"];
const TA = ["TEACHER", "ADMIN"];
const SA = ["STUDENT", "ADMIN"];

// ---------------------------------------------------------------- Health + Auth
add("get", "/health", { tag: "Health", summary: "API health check", auth: false });

add("post", "/auth/register", {
  tag: "Auth",
  summary: "Register a new student account",
  description: "Public registration can only ever create a STUDENT. Returns access + refresh tokens.",
  auth: false,
  status: 201,
  conflict: true,
  body: ref("RegisterBody"),
  data: ref("AuthResult"),
});
add("post", "/auth/login", { tag: "Auth", summary: "Login with email and password", auth: false, body: ref("LoginBody"), data: ref("AuthResult") });
add("post", "/auth/refresh-token", {
  tag: "Auth",
  summary: "Rotate the refresh token",
  description: "The old refresh token is revoked. Presenting an already-used token revokes every session of that user (reuse detection).",
  auth: false,
  body: ref("RefreshBody"),
  data: ref("TokenPair"),
});
add("post", "/auth/logout", { tag: "Auth", summary: "Logout (revoke the refresh token)", auth: false, body: ref("RefreshBody") });
add("get", "/auth/google", { tag: "Auth", summary: "Start Google login", description: "Redirects the browser to Google. Open this URL in a browser, not from Swagger.", auth: false });
add("get", "/auth/google/callback", { tag: "Auth", summary: "Google OAuth callback", description: "Verifies the CSRF state cookie, then returns tokens.", auth: false });

// ---------------------------------------------------------------- Users
add("get", "/users/me", { tag: "Users", summary: "Get my profile", data: ref("User") });
add("patch", "/users/me", { tag: "Users", summary: "Update my name / phone", description: "Role, email and status cannot be changed here.", body: obj({ name: str(), phone: { type: "string", nullable: true } }), data: ref("User") });

// ---------------------------------------------------------------- Departments
add("get", "/departments", { tag: "Departments", summary: "List departments", paginated: true, query: [query("q", str(), "Search name or code")] });
add("post", "/departments", { tag: "Departments", summary: "Create a department", roles: A, status: 201, conflict: true, body: ref("DepartmentBody") });
add("get", "/departments/{id}", { tag: "Departments", summary: "Get a department" });
add("patch", "/departments/{id}", { tag: "Departments", summary: "Update a department", roles: A, conflict: true, body: obj({ name: str(), code: str() }) });
add("delete", "/departments/{id}", { tag: "Departments", summary: "Soft delete a department", description: "Blocked (409) while it still has active courses.", roles: A, conflict: true });

// ---------------------------------------------------------------- Courses
add("get", "/courses", {
  tag: "Courses",
  summary: "List courses (search, filter, sort, paginate)",
  paginated: true,
  query: [query("q", str(), "Search title or code"), query("departmentId", uuid), query("credit", int({ minimum: 1, maximum: 6 })), ...sortQuery("createdAt", "title", "code", "credit")],
});
add("post", "/courses", { tag: "Courses", summary: "Create a course", roles: A, status: 201, conflict: true, body: ref("CourseBody") });
add("get", "/courses/{id}", { tag: "Courses", summary: "Get a course" });
add("patch", "/courses/{id}", { tag: "Courses", summary: "Update a course", roles: A, conflict: true, body: obj({ code: str(), title: str(), description: { type: "string", nullable: true }, credit: int(), departmentId: uuid }) });
add("delete", "/courses/{id}", { tag: "Courses", summary: "Soft delete a course", description: "Blocked (409) while it has active offerings.", roles: A, conflict: true });

// ---------------------------------------------------------------- Offerings
add("get", "/offerings/my-assigned", { tag: "Offerings", summary: "Offerings assigned to me", roles: T, paginated: true, query: [query("semester", str())] });
add("get", "/offerings", {
  tag: "Offerings",
  summary: "List course offerings",
  paginated: true,
  query: [query("semester", str()), query("courseId", uuid), query("teacherId", uuid), ...sortQuery("createdAt", "semester")],
});
add("post", "/offerings", { tag: "Offerings", summary: "Create an offering (course + semester + section + teacher + capacity)", roles: A, status: 201, conflict: true, body: ref("OfferingBody") });
add("get", "/offerings/{id}", { tag: "Offerings", summary: "Get an offering with available seats" });
add("patch", "/offerings/{id}/assign-teacher", { tag: "Offerings", summary: "Assign a teacher", roles: A, body: obj({ teacherId: uuid }, ["teacherId"]) });
add("patch", "/offerings/{id}/capacity", {
  tag: "Offerings",
  summary: "Change capacity",
  description: "Atomic: capacity can never go below the number of enrolled students (409).",
  roles: A,
  conflict: true,
  body: obj({ capacity: int({ minimum: 1, maximum: 500 }) }, ["capacity"]),
});
add("delete", "/offerings/{id}", { tag: "Offerings", summary: "Soft delete an offering", description: "Blocked (409) while students are enrolled.", roles: A, conflict: true });
add("get", "/offerings/{id}/enrollments", {
  tag: "Enrollments",
  summary: "Class list of an offering",
  description: "A teacher can only see their own offerings (403 otherwise). Admin can see all.",
  roles: TA,
  paginated: true,
  query: [query("status", en("ENROLLED", "DROPPED")), query("q", str(), "Search name, email or student id")],
});

// ---------------------------------------------------------------- Enrollments
add("post", "/enrollments", {
  tag: "Enrollments",
  summary: "Enroll in an offering",
  description:
    "Atomic seat claim (no overbooking under concurrency). Rules: one section per course per semester (409), max 18 credits per semester (409), unpaid fee invoice for that semester blocks enrollment (402).",
  roles: S,
  status: 201,
  conflict: true,
  body: obj({ offeringId: uuid }, ["offeringId"]),
});
add("get", "/enrollments/my", { tag: "Enrollments", summary: "My enrollments", roles: S, paginated: true, query: [query("status", en("ENROLLED", "DROPPED")), query("semester", str())] });
add("post", "/enrollments/{id}/drop", { tag: "Enrollments", summary: "Drop my enrollment", description: "Blocked once the result is published (409). The seat is released.", roles: S, conflict: true });

// ---------------------------------------------------------------- Attendance
add("post", "/attendance", {
  tag: "Attendance",
  summary: "Mark attendance for a class day (bulk, idempotent)",
  description: "Only the teacher who owns the offering. Marking the same day again updates the records.",
  roles: T,
  body: ref("AttendanceBody"),
});
add("get", "/attendance/my", { tag: "Attendance", summary: "My attendance with percentage per offering", roles: S, query: [query("offeringId", uuid)] });
add("get", "/attendance/offerings/{id}", {
  tag: "Attendance",
  summary: "Attendance records of an offering",
  roles: TA,
  paginated: true,
  query: [query("date", str({ format: "date" })), query("status", en("PRESENT", "ABSENT", "LATE"))],
});

// ---------------------------------------------------------------- Results
add("put", "/results", {
  tag: "Results",
  summary: "Enter or correct marks (saved as DRAFT)",
  description: "Only the owner teacher. Grade and grade point are computed. A published result cannot be changed (409).",
  roles: T,
  conflict: true,
  body: obj({ enrollmentId: uuid, marks: num({ minimum: 0, maximum: 100 }) }, ["enrollmentId", "marks"]),
});
add("get", "/results/my", {
  tag: "Results",
  summary: "My published results with semester GPA and CGPA",
  description: "GPA = sum(gradePoint x credit) / sum(credit). Draft results are invisible to students.",
  roles: S,
  query: [query("semester", str())],
});
add("get", "/results/offerings/{id}", { tag: "Results", summary: "Results of an offering", roles: TA, paginated: true, query: [query("status", en("DRAFT", "PUBLISHED"))] });
add("post", "/results/offerings/{id}/publish", {
  tag: "Results",
  summary: "Publish all draft results of an offering (transaction)",
  description: "Fails (409) if an enrolled student has no result yet.",
  roles: TA,
  conflict: true,
});

// ---------------------------------------------------------------- Invoices
add("post", "/invoices", { tag: "Invoices", summary: "Create a fee invoice for a student", roles: A, status: 201, body: ref("InvoiceBody") });
add("get", "/invoices", {
  tag: "Invoices",
  summary: "List all invoices",
  roles: A,
  paginated: true,
  query: [query("status", en("UNPAID", "PAID", "CANCELLED")), query("studentId", uuid), query("semester", str()), query("q", str()), ...sortQuery("createdAt", "amount", "dueDate")],
});
add("get", "/invoices/my", { tag: "Invoices", summary: "My invoices", roles: S, paginated: true, query: [query("status", en("UNPAID", "PAID", "CANCELLED")), query("semester", str())] });
add("get", "/invoices/{id}", { tag: "Invoices", summary: "Get an invoice with its payments", description: "A student sees only their own invoice (404 otherwise).", roles: SA });
add("patch", "/invoices/{id}/cancel", { tag: "Invoices", summary: "Cancel an unpaid invoice", description: "Blocked (409) if a payment is pending or successful.", roles: A, conflict: true });

// ---------------------------------------------------------------- Payments
add("post", "/payments/initiate", {
  tag: "Payments",
  summary: "Start an SSLCommerz payment for an invoice",
  description: "The amount always comes from the invoice, never from the client. Open the returned `gatewayUrl` in a browser to pay.",
  roles: S,
  status: 201,
  conflict: true,
  body: obj({ invoiceId: uuid }, ["invoiceId"]),
});
add("get", "/payments/my", { tag: "Payments", summary: "My payments", roles: S, paginated: true, query: [query("status", en("PENDING", "SUCCESS", "FAILED", "CANCELLED"))] });
add("get", "/payments", {
  tag: "Payments",
  summary: "List all payments",
  roles: A,
  paginated: true,
  query: [query("status", en("PENDING", "SUCCESS", "FAILED", "CANCELLED")), query("gateway", en("STRIPE", "SSLCOMMERZ")), query("userId", uuid), query("invoiceId", uuid)],
});
add("get", "/payments/{id}", { tag: "Payments", summary: "Get a payment", roles: SA });

const gatewayForm = obj({ tran_id: str(), val_id: str(), status: str(), amount: str() });
add("post", "/payments/gateway/success", {
  tag: "Payment gateway callbacks",
  summary: "SSLCommerz success redirect",
  description: "Called by the gateway. The server NEVER trusts this body: it verifies `val_id` with the gateway (status, tran_id, amount) before marking the payment SUCCESS. Idempotent.",
  auth: false,
  form: gatewayForm,
  conflict: true,
});
add("post", "/payments/gateway/fail", { tag: "Payment gateway callbacks", summary: "SSLCommerz fail redirect", auth: false, form: gatewayForm });
add("post", "/payments/gateway/cancel", { tag: "Payment gateway callbacks", summary: "SSLCommerz cancel redirect", auth: false, form: gatewayForm });
add("post", "/payments/gateway/ipn", { tag: "Payment gateway callbacks", summary: "SSLCommerz IPN (server to server)", description: "Same verification as the success redirect.", auth: false, form: gatewayForm });

// ---------------------------------------------------------------- Notices
add("get", "/notices", { tag: "Notices", summary: "List notices", paginated: true, query: [query("q", str()), ...sortQuery("createdAt", "title")] });
add("post", "/notices", { tag: "Notices", summary: "Publish a notice", roles: TA, status: 201, body: obj({ title: str(), content: str() }, ["title", "content"]) });
add("get", "/notices/{id}", { tag: "Notices", summary: "Get a notice" });
add("patch", "/notices/{id}", { tag: "Notices", summary: "Edit a notice", description: "A teacher can edit only their own notices (403). Admin can edit any.", roles: TA, body: obj({ title: str(), content: str() }) });
add("delete", "/notices/{id}", { tag: "Notices", summary: "Soft delete a notice", description: "A teacher can delete only their own notices.", roles: TA });

// ---------------------------------------------------------------- Admin
add("post", "/admin/users", { tag: "Admin", summary: "Create a user with any role", roles: A, status: 201, conflict: true, body: ref("AdminCreateUserBody") });
add("get", "/admin/users", {
  tag: "Admin",
  summary: "List users",
  roles: A,
  paginated: true,
  query: [query("role", en("ADMIN", "TEACHER", "STUDENT")), query("status", en("ACTIVE", "SUSPENDED")), query("q", str(), "Search name or email"), ...sortQuery("createdAt", "name", "email")],
});
add("get", "/admin/users/{id}", { tag: "Admin", summary: "Get a user", roles: A });
add("patch", "/admin/users/{id}/role", {
  tag: "Admin",
  summary: "Change a user's role",
  description: "Cannot change your own role, cannot remove the last admin, blocked while a teacher has offerings or a student has enrollments. Sessions are revoked.",
  roles: A,
  conflict: true,
  body: obj({ role: en("ADMIN", "TEACHER", "STUDENT") }, ["role"]),
});
add("patch", "/admin/users/{id}/status", {
  tag: "Admin",
  summary: "Suspend or re-activate a user",
  description: "Suspending revokes all sessions immediately.",
  roles: A,
  conflict: true,
  body: obj({ status: en("ACTIVE", "SUSPENDED") }, ["status"]),
});
add("delete", "/admin/users/{id}", { tag: "Admin", summary: "Soft delete a user", roles: A, conflict: true });
add("get", "/admin/stats", { tag: "Admin", summary: "Dashboard statistics (users, academics, finance, top offerings)", roles: A });
add("get", "/admin/audit-logs", {
  tag: "Admin",
  summary: "Audit trail",
  roles: A,
  paginated: true,
  query: [query("actorId", uuid), query("entity", str()), query("entityId", str()), query("action", str()), query("from", str({ format: "date-time" })), query("to", str({ format: "date-time" }))],
});

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ref("ErrorResponse") } },
});

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "University Management System API",
    version: "1.0.0",
    description: [
      "REST API for a university: departments, courses, offerings, enrollment, attendance, results (GPA/CGPA), fee invoices, SSLCommerz payments, notices and admin tools.",
      "",
      "**How to try it:** call `POST /auth/login`, copy `data.accessToken`, press **Authorize** and paste it.",
      "",
      "Every success response is `{ success, message, data, meta? }`. Every error is `{ success: false, message, errors[] }`.",
    ].join("\n"),
  },
  servers: [{ url: "/api/v1", description: "This server" }],
  tags: [
    "Health", "Auth", "Users", "Departments", "Courses", "Offerings", "Enrollments", "Attendance", "Results", "Invoices", "Payments",
    "Payment gateway callbacks", "Notices", "Admin",
  ].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    parameters: {
      IdPath: { name: "id", in: "path", required: true, schema: uuid },
      Page: { name: "page", in: "query", schema: int({ minimum: 1, default: 1 }) },
      Limit: { name: "limit", in: "query", schema: int({ minimum: 1, maximum: 100, default: 10 }) },
    },
    responses: {
      ValidationError: errorResponse("Validation failed (400). `errors[]` lists each field."),
      Unauthorized: errorResponse("Missing, invalid or expired token (401)"),
      Forbidden: errorResponse("Authenticated but not allowed (403)"),
      NotFound: errorResponse("Resource not found (404)"),
      Conflict: errorResponse("Business rule conflict, e.g. duplicate, full, already paid (409)"),
    },
    schemas: {
      SuccessResponse: obj({ success: { type: "boolean", example: true }, message: str(), data: { type: "object" } }, ["success", "message"]),
      ErrorResponse: obj(
        {
          success: { type: "boolean", example: false },
          message: str(),
          errors: arr(obj({ field: str(), message: str() })),
        },
        ["success", "message"],
      ),
      PaginationMeta: obj({ page: int(), limit: int(), total: int(), totalPages: int() }),
      User: obj({ id: uuid, name: str(), email: str(), phone: { type: "string", nullable: true }, role: en("ADMIN", "TEACHER", "STUDENT"), status: en("ACTIVE", "SUSPENDED") }),
      TokenPair: obj({ accessToken: str(), refreshToken: str() }),
      AuthResult: obj({ user: ref("User"), accessToken: str(), refreshToken: str() }),
      RegisterBody: obj(
        { name: str({ minLength: 2 }), email: str({ format: "email" }), password: str({ minLength: 8, description: "At least one letter and one number" }), phone: str({ example: "01712345678" }) },
        ["name", "email", "password"],
      ),
      LoginBody: obj({ email: str({ format: "email", example: "admin@ums.test" }), password: str({ example: "Admin@12345" }) }, ["email", "password"]),
      RefreshBody: obj({ refreshToken: str() }, ["refreshToken"]),
      DepartmentBody: obj({ name: str({ example: "Computer Science" }), code: str({ example: "CSE" }) }, ["name", "code"]),
      CourseBody: obj(
        { code: str({ example: "CSE-101" }), title: str(), description: str(), credit: int({ minimum: 1, maximum: 6, default: 3 }), departmentId: uuid },
        ["code", "title", "departmentId"],
      ),
      OfferingBody: obj(
        { courseId: uuid, teacherId: uuid, semester: str({ example: "Fall 2026" }), section: str({ example: "A", default: "A" }), capacity: int({ minimum: 1, maximum: 500 }) },
        ["courseId", "teacherId", "semester", "capacity"],
      ),
      AttendanceBody: obj(
        {
          offeringId: uuid,
          date: str({ format: "date", example: "2026-01-05" }),
          records: arr(obj({ enrollmentId: uuid, status: en("PRESENT", "ABSENT", "LATE") }, ["enrollmentId", "status"])),
        },
        ["offeringId", "date", "records"],
      ),
      InvoiceBody: obj(
        { studentId: uuid, title: str({ example: "Fall 2026 Tuition" }), semester: str({ example: "Fall 2026", description: "Matches the offering semester to gate enrollment" }), amount: num({ example: 5000 }), dueDate: str({ format: "date-time" }) },
        ["studentId", "title", "amount"],
      ),
      AdminCreateUserBody: obj(
        {
          name: str(),
          email: str({ format: "email" }),
          password: str({ minLength: 8 }),
          role: en("ADMIN", "TEACHER", "STUDENT"),
          phone: str(),
          departmentId: uuid,
          designation: str({ description: "Teachers only" }),
        },
        ["name", "email", "password", "role"],
      ),
    },
  },
};
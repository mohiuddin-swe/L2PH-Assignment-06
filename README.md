# University Management System API

Backend for a university: departments, courses, course offerings, enrollment with seat limits, attendance, results with GPA/CGPA, fee invoices, real online payment (SSLCommerz), notices and an admin dashboard.

Built for the **B7A6 Backend Project Assignment (Programming Hero)**: Student ID ends in 9, **University Management System**.

| | |
|---|---|
| **Live API** | https://YOUR-APP.onrender.com/api/v1 |
| **API docs (Swagger)** | https://YOUR-APP.onrender.com/api/v1/docs |
| **Video walkthrough** | YOUR-VIDEO-LINK |
| **Repository** | https://github.com/mohiuddin-swe/YOUR-REPO |

> The free Render server sleeps when idle. The first request can take up to a minute, please open `/api/v1/health` once and wait.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ums.test` | `Admin@12345` |
| Teacher | `teacher@ums.test` | `Teacher@12345` |
| Student | `student@ums.test` | `Student@12345` |

In Swagger: call `POST /auth/login`, copy `data.accessToken`, click **Authorize**, paste it.

## Tech stack

Node.js, TypeScript, Express 4, PostgreSQL (Prisma Postgres), Prisma ORM, Zod, JWT, bcryptjs, Google OAuth, SSLCommerz, helmet, CORS, express-rate-limit, Swagger UI (OpenAPI 3).

## Features

- **3 roles** (ADMIN, TEACHER, STUDENT) with role-based access control on every route
- **Auth**: email/password and Google OAuth, short-lived access JWT (15 min), rotating refresh tokens stored as SHA-256 hashes with reuse detection
- **Academics**: departments, courses, offerings (course + semester + section + teacher + capacity)
- **Enrollment** with an atomic seat claim: no overbooking even when many students race for the last seat
- **Attendance** (bulk, idempotent) with percentage per course
- **Results**: teacher enters marks as DRAFT, publishes in one transaction; credit-weighted **GPA and CGPA**
- **Payments**: fee invoices, real **SSLCommerz** sandbox payment, server-side verification, idempotent callbacks
- **Admin**: create users, change roles, suspend, soft delete, dashboard statistics, audit log viewer
- **Notices**: admin and teachers publish, teachers manage only their own
- **Soft delete** (`deletedAt`) for users, departments, courses, offerings, invoices, notices
- **Audit log** written in the same DB transaction as the action it records
- **Pagination, search, filter and sort** on every list endpoint (sort fields are whitelisted)

## Business rules

| Rule | Where |
|---|---|
| One section per course per semester | enrollment |
| Maximum 18 credits per semester | enrollment |
| Seat limit is atomic, capacity cannot drop below enrolled count | enrollment, offering |
| Unpaid fee invoice for a semester blocks enrollment in that semester (HTTP 402) | enrollment + invoice |
| Cannot drop a course after its result is published | enrollment |
| A teacher can only manage attendance, results and class lists of their own offerings | attendance, results |
| Results are invisible to students until published; a published result cannot change | results |
| Results can be published only when every enrolled student has a result | results |
| GPA = sum(grade point x credit) / sum(credit); a failed course still counts its credits | results |
| Payment amount always comes from the invoice, never from the client | payment |
| A payment is marked successful only after the gateway confirms it server-to-server | payment |
| Cannot change own role or status, cannot remove the last active admin | admin |
| A teacher with offerings or a student with enrollments cannot change role or be deleted | admin |

## Security

- Passwords hashed with bcrypt, constant-time style login (no user enumeration by timing)
- Access token role is re-checked against the database on every request, so suspension, role change and deletion take effect immediately
- Zod validation on body, query and params; `.strict()` schemas reject unknown fields (no `role` injection)
- Sort fields whitelisted, UUID params validated
- helmet, CORS allow-list, global and auth rate limits
- Google OAuth uses a `state` cookie against CSRF
- Payment callbacks are verified with the gateway; a forged callback cannot mark a payment paid
- Uniform error format, internals hidden in production

## Response format

```json
{ "success": true, "message": "Courses fetched successfully", "data": [], "meta": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 } }
```
```json
{ "success": false, "message": "Validation failed", "errors": [{ "field": "email", "message": "Invalid email address" }] }
```

## API overview (63 endpoints, full detail in Swagger)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh-token`, `/auth/logout`, `GET /auth/google`, `/auth/google/callback` |
| Users | `GET/PATCH /users/me` |
| Departments | `GET/POST /departments`, `GET/PATCH/DELETE /departments/:id` |
| Courses | `GET/POST /courses`, `GET/PATCH/DELETE /courses/:id` |
| Offerings | `GET/POST /offerings`, `GET /offerings/my-assigned`, `GET/DELETE /offerings/:id`, `PATCH /offerings/:id/assign-teacher`, `PATCH /offerings/:id/capacity`, `GET /offerings/:id/enrollments` |
| Enrollments | `POST /enrollments`, `GET /enrollments/my`, `POST /enrollments/:id/drop` |
| Attendance | `POST /attendance`, `GET /attendance/my`, `GET /attendance/offerings/:id` |
| Results | `PUT /results`, `GET /results/my`, `GET /results/offerings/:id`, `POST /results/offerings/:id/publish` |
| Invoices | `POST/GET /invoices`, `GET /invoices/my`, `GET /invoices/:id`, `PATCH /invoices/:id/cancel` |
| Payments | `POST /payments/initiate`, `GET /payments`, `GET /payments/my`, `GET /payments/:id`, gateway callbacks `/payments/gateway/{success,fail,cancel,ipn}` |
| Notices | `GET/POST /notices`, `GET/PATCH/DELETE /notices/:id` |
| Admin | `POST/GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/users/:id/role`, `PATCH /admin/users/:id/status`, `DELETE /admin/users/:id`, `GET /admin/stats`, `GET /admin/audit-logs` |

## Project structure

```
src/
  config/        environment validation (Zod)
  docs/          OpenAPI spec + Swagger UI
  errors/        AppError
  lib/           Prisma client
  middlewares/   authenticate, authorize, validate, rate limit, error handler
  modules/       auth, user, department, course, offering, enrollment, attendance,
                 result, invoice, payment, notice, admin   (route, controller, service, validation)
  utils/         pagination, audit log, grading, response helper
prisma/          schema, migrations, seed
scripts/         API test scripts (one per sprint) and a production smoke test
```

## Run locally

```bash
git clone https://github.com/mohiuddin-swe/YOUR-REPO.git
cd YOUR-REPO
npm install
cp .env.example .env        # then fill in the values below
npx prisma migrate dev      # creates the tables
npm run seed                # demo admin, teacher and student
npm run dev                 # http://localhost:5001/api/v1
```

### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | at least 32 chars (`openssl rand -hex 32`) |
| `PORT` | default 5000 (5001 locally on macOS) |
| `CORS_ORIGINS` | comma separated allowed origins |
| `APP_BASE_URL` | public URL of this API (payment gateway redirects back here) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google OAuth (optional) |
| `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_IS_LIVE` | SSLCommerz (sandbox: `false`) |

## Tests

The API must be running. Each script prints PASS/FAIL per check.

```bash
node scripts/test-sprint1.mjs   # auth + users
node scripts/test-sprint2.mjs   # departments, courses, offerings
node scripts/test-sprint3.mjs   # enrollment, including a 5-student race for the last seat
node scripts/test-sprint4.mjs   # attendance, results, GPA/CGPA
node scripts/test-sprint5.mjs   # invoices and payments
node scripts/test-sprint6.mjs   # admin, notices, audit logs
BASE_URL=https://YOUR-APP.onrender.com/api/v1 node scripts/smoke-prod.mjs
```

## Payment flow (SSLCommerz sandbox)

1. Admin creates an invoice for a student (`POST /invoices`).
2. Student calls `POST /payments/initiate`, gets a `gatewayUrl`.
3. Student pays on the SSLCommerz page (sandbox card `4111 1111 1111 1111`, CVV `111`, OTP `111111`).
4. The gateway redirects the browser (and calls the IPN). The server validates `val_id` with SSLCommerz, checks status, transaction id and amount, then in ONE transaction marks the payment `SUCCESS` and the invoice `PAID`.
5. Repeated or forged callbacks cannot pay twice or pay without money.

## Deployment

Hosted on Render (Node web service) with Prisma Postgres.

- Build: `npm install --include=dev && npm run build`
- Start: `npx prisma migrate deploy && node dist/server.js`
- Health check: `/api/v1/health`
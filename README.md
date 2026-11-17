# Task API — FlyRank Internship Week 4 Assignment A4 (Auth)

A **Node.js + Express** API with a SQLite-backed task list (Week 3) and **Supabase Auth** (Week 4): sign up, log in, log out, and routes that only answer to users holding a valid JWT. Passwords are never stored or hashed by this server — Supabase is the Identity Provider; this server only sends credentials to Supabase and verifies the tokens it returns.

## Tech stack

- Node.js
- Express
- Swagger UI (`swagger-ui-express`)
- OpenAPI 3.0.3
- SQLite via `better-sqlite3` (synchronous, parameterized queries)
- Supabase Auth (`@supabase/supabase-js`) for accounts and JWTs
- `dotenv` for configuration

## Authentication (Week 4)

### Environment setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Project Settings → API** copy the **Project URL** and the **anon** key (never the `service_role` key).
3. In **Authentication → Sign In / Providers → Email** turn **"Confirm email" off** (practice project only).
4. Copy the example env file and fill it in:

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

```text
SUPABASE_URL=your_project_url
SUPABASE_KEY=your_anon_key
PORT=3000
```

`.env` is git-ignored. Check the whole Git history for any accidentally leaked keys before submitting.

### Run command

```bash
npm install && npm start
```

### Auth endpoints

| Method | Endpoint | Purpose | Auth needed? | Success | Errors |
|---|---|---|---|---|---|
| POST | `/auth/signup` | Create an account | No | 201 | 400 |
| POST | `/auth/login` | Log in, returns JWT | No | 200 | 400, 401 |
| POST | `/auth/logout` | End the session | **Bearer token** | 204 | 401 |
| GET | `/protected/profile` | Private profile data | **Bearer token** | 200 | 401 |
| GET | `/protected/dashboard` | Second protected route | **Bearer token** | 200 | 401 |
| GET | `/public/info` | Open data | No | 200 | — |

Protected routes read `Authorization: Bearer <token>`. A missing or malformed header returns `401 {"error":"Access token required"}`; an expired, tampered or invalid token returns `401 {"error":"Invalid or expired token"}`. The check is one reusable middleware (`requireAuth`) that calls `supabase.auth.getUser(token)` and attaches the verified user to `req.user`; it protects `/protected/profile`, `/protected/dashboard` and `/auth/logout`.

### Try it with curl

```bash
# Sign up (201) - missing password gives 400
curl -i -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Log in (200) - copy the access_token from the response
curl -i -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Public route (200)
curl -i http://localhost:3000/public/info

# Protected route without a token (401)
curl -i http://localhost:3000/protected/profile

# Protected route with a valid token (200)
curl -i http://localhost:3000/protected/profile \
  -H "Authorization: Bearer <PASTE_ACCESS_TOKEN>"

# Change one character of the token -> 401
```

### Swagger UI with bearer auth

Open `http://localhost:3000/docs`, click **Authorize**, paste the `access_token` from `/auth/login`, then use **Try it out** on `GET /protected/profile`. The padlock icons come from the `bearerAuth` entry in `securitySchemes` in `openapi.json`.

**W4 Swagger screenshot:** Run `npm run capture:swagger` after installing dependencies to generate the *real* `docs/swagger-auth.png` with bearer padlock icons. Add the generated screenshot to GitHub before final submission.

---

# Tasks API (Weeks 2–3)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the API

```bash
npm start
```

For development with automatic restart:

```bash
npm run dev
```

The API runs at:

```text
http://localhost:3000
```

Swagger UI:

```text
http://localhost:3000/docs
```

## Why SQLite?

- **Single file** — the whole database is `tasks.db`.
- **Zero setup** — no server to install; the file and the `tasks` table are created automatically on first run.
- **Survives restarts** — data is on disk, not in memory.

The database file lives next to `index.js` and is git-ignored, so every fresh clone starts clean with the 3 seed tasks.

**Run command** (works on a clean clone):

```bash
npm install && npm start
```

## Database schema

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id    INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  done  INTEGER NOT NULL DEFAULT 0   -- 0 = false, 1 = true
);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
```

All queries use `?` placeholders (parameterized), e.g. `SELECT * FROM tasks WHERE id = ?`, `INSERT INTO tasks (title, done) VALUES (?, ?)`, `UPDATE tasks SET title = ?, done = ? WHERE id = ?`, `DELETE FROM tasks WHERE id = ?`.

## Seed data

On first run (table empty) the server seeds three tasks, inside a transaction:

```json
[
  { "id": 1, "title": "Buy groceries", "done": false },
  { "id": 2, "title": "Walk the dog", "done": true },
  { "id": 3, "title": "Read a book", "done": false }
]
```

The seed runs only when the table is empty (`SELECT COUNT(*)` is 0), so restarting never duplicates the examples. Wrapping the three inserts in a **transaction** makes seeding all-or-nothing — a crash halfway can't leave a half-seeded table.

## API endpoints

| Method | Endpoint | Purpose | Success | Errors |
|---|---|---|---|---|
| GET | `/` | API information | 200 | — |
| GET | `/health` | Health check | 200 | — |
| GET | `/tasks` | List all tasks | 200 | 400 |
| GET | `/tasks/:id` | Get one task | 200 | 404 |
| POST | `/tasks` | Create a task | 201 | 400 |
| PUT | `/tasks/:id` | Update a task | 200 | 400, 404 |
| DELETE | `/tasks/:id` | Delete a task | 204 | 404 |
| GET | `/stats` | Task statistics (extra) | 200 | — |
| POST | `/reset` | Restore seed data (extra) | 200 | — |
| GET | `/docs` | Swagger UI | 200 | — |

## CRUD examples

### Read all tasks

```bash
curl -i http://localhost:3000/tasks
```

### Read one task

```bash
curl -i http://localhost:3000/tasks/1
```

Unknown IDs return `404`:

```bash
curl -i http://localhost:3000/tasks/99
```

Response body:

```json
{"error":"Task 99 not found"}
```

### Create a task

```bash
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk"}'
```

The server assigns the next available ID, sets `done` to `false`, and returns `201 Created`.

Invalid input such as `{}` returns `400 Bad Request`.

### Update a task

Update the completion state:

```bash
curl -i -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'
```

Update both fields:

```bash
curl -i -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy oat milk","done":true}'
```

### Delete a task

```bash
curl -i -X DELETE http://localhost:3000/tasks/1
```

A successful delete returns `204 No Content` with an empty body.

## Sample `curl -i` output

```text
$ curl -i http://localhost:3000/tasks/1
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 45
ETag: W/"2d-Gv8HDdZD1sn+UqMseo56OTgQmek"
Date: Tue, 06 Oct 2026 16:07:41 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"id":1,"title":"Buy groceries","done":false}
```

## Optional extras

Optional extras, now done in SQL (`WHERE done = ?`, `WHERE title LIKE ?`, `SELECT COUNT(*)`):

### Filter by completion

```bash
curl -i "http://localhost:3000/tasks?done=true"
```

### Search by title

```bash
curl -i "http://localhost:3000/tasks?search=milk"
```

Search is case-insensitive. The filters can also be combined:

```bash
curl -i "http://localhost:3000/tasks?done=false&search=book"
```

### Statistics

```bash
curl -i http://localhost:3000/stats
```

Example:

```json
{"total":3,"done":1,"open":2}
```

### Reset seed data

```bash
curl -i -X POST http://localhost:3000/reset
```

## Persistence proof

I created tasks, stopped the server, started it again, and `GET /tasks` still returned them — the first time the data survived a restart. I also opened `tasks.db` in DB Browser for SQLite and saw the same rows the API returns.

![DB Browser showing tasks.db](docs/db-browser.png)

## Stage 4 — SQL by hand

I opened `tasks.db` in DB Browser for SQLite and ran these queries by hand in the *Execute SQL* tab.

**1. List completed tasks** — returned one row, `Walk the dog` (`done = 1`):

```sql
SELECT * FROM tasks WHERE done = 1;
```

![Query 1 - completed tasks](docs/Query_1.png)

**2. List every task** — returned all 3 seed tasks:

```sql
SELECT * FROM tasks;
```

![Query 2 - all tasks](docs/Query_2.png)

**3. Count tasks** — returned `3`:

```sql
SELECT COUNT(*) FROM tasks;
```

![Query 3 - count](docs/Query_3.png)

**4. Mark every task completed** — `3 rows affected`:

```sql
UPDATE tasks SET done = 1;
```

![Query 4 - update](docs/Query_4.png)

After this (and **Write Changes**), `GET /tasks` showed every task with `"done": true` without restarting the server. The API and DB Browser read the same file, so there is one source of truth and no syncing.

**5. Delete completed tasks** — `3 rows affected` (all tasks were completed after query 4, so the table became empty; `POST /reset` restores the seed data):

```sql
DELETE FROM tasks WHERE done = 1;
```

![Query 5 - delete](docs/Query_5.png)

## Why identical tests passing proves storage is an implementation detail

The same curl commands from Week 2 (below) pass unchanged against the SQLite version: same status codes, same JSON. Clients only depend on the API contract, not on where data is kept, so swapping memory for SQLite changed nothing they can observe.

## What is an index?

`idx_tasks_done` is an index on `done`; it lets SQLite find rows matching `WHERE done = ?` without scanning the whole table (like a book's index).

## Swagger UI

Open:

```text
http://localhost:3000/docs
```

Swagger UI documents the API from `openapi.json` and provides a **Try it out** button for testing the endpoints without curl.

### Swagger screenshot

![Swagger UI](docs/swagger.png)

`POST /tasks` tested with **Try it out** (response `201 Created`):

![Swagger Try it out - POST /tasks](docs/swagger-tryit.png)

## Curl checkpoint

The main Stage 4 CRUD checkpoint is:

```bash
# Create
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Finish assignment"}'

# Read
curl -i http://localhost:3000/tasks

# Update
curl -i -X PUT http://localhost:3000/tasks/4 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

# Delete
curl -i -X DELETE http://localhost:3000/tasks/4
```

Expected successful status codes are `201` for create, `200` for reads/update, and `204` for delete. Unknown task IDs return `404`; invalid request bodies return `400`.

## Project structure

```text
.
├── index.js          # Express server: SQLite storage, CRUD routes, Supabase auth + middleware
├── openapi.json      # OpenAPI specification used by Swagger UI
├── tasks.db          # SQLite database (auto-created, git-ignored)
├── docs/             # Screenshots (Swagger UI, DB Browser)
├── package.json      # Project metadata and npm scripts
├── package-lock.json # Locked dependency versions
├── .env.example      # Names of required env vars (real .env is git-ignored)
├── .gitignore
└── README.md
```

## Assignment completion checklist

- [x] Stage 0 — `tasks.db` + `tasks` table created automatically, seeded once
- [x] Stage 1 — `GET /tasks` and `GET /tasks/:id` read from SQLite
- [x] Stage 2 — `POST /tasks` uses `INSERT`
- [x] Stage 3 — `PUT` / `DELETE` use `UPDATE` / `DELETE`
- [x] Stage 4 — explored SQL in DB Browser
- [x] Stage 5 — README, screenshot, public repo
- [x] Extras: SQL search/filter/stats, index, transaction

- [x] A4 — Supabase signup/login/logout, JWT verification, reusable auth middleware, Swagger bearer auth


## Week 4: security fixes and final verification

The auth server creates a separate Supabase SDK client per request so one user session is never shared across calls. Login returns an access and refresh token. The `requireAuth` middleware checks the bearer JWT using Supabase `getUser(token)` and protects profile, dashboard, and logout. User-scoped logout calls Supabase `POST /auth/v1/logout?scope=local` with the verified JWT (no privileged service-role key). Logout revokes the affected refresh-token session, but existing access JWTs may remain valid until expiration. Clients must discard both tokens.

With Node.js **22+**, run:

```bash
npm ci
npm test
npm start
```

Set `SUPABASE_URL` and the **public anon/publishable key** in a private `.env` copied from `.env.example`, then run the real checks:

```bash
npm run test:smoke
npm run capture:swagger
```

`npm test` executes mocked route tests without connecting to Supabase. `npm run test:smoke` creates a test account in **your own Supabase project**, verifies signup, login, protected reads, rejected tampered tokens, logout, and Swagger; turn off Supabase *Confirm email* for this practice exercise. `npm run capture:swagger` requires Chrome/Edge/Chromium; it writes `docs/swagger-auth.png`. Add that actual image to the repo; the older Week 3 screenshots are not bearer-auth proof.

### W4 status

- [x] Five required endpoints, a second protected endpoint, JWT middleware, bearer Swagger setup
- [x] Fixed user-scoped logout, validation, and server error responses
- [x] Automated mocked tests
- [ ] Confirm live end-to-end Supabase smoke test using your private project configuration
- [ ] Commit actual Swagger bearer-auth screenshot after capture
- [ ] Review repository history for leaked secrets

**Never commit `.env`, tokens, passwords, or a Supabase service-role key.**

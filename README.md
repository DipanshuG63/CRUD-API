# A3 — Containerize Your Stack | FlyRank Backend Internship

**Node.js + Express + PostgreSQL + Docker Compose** task API. This is the same existing CRUD-API repository, with the A3 work published on **a3-docker-postgres**. The newer W4 authentication code remains safe on **main**.

## One-command Docker startup (Windows)

Open PowerShell in this project's folder. Make sure Docker Desktop says **Engine running**.

~~~powershell
Copy-Item .env.example .env
docker compose up --build
~~~

The first command copies the public template; the second starts **both** app and PostgreSQL. Change POSTGRES_PASSWORD in your local .env and also the matching password inside DATABASE_URL; never put real secrets in Git. A clean clone needs no local PostgreSQL installation.

- API: http://localhost:3000/tasks
- Swagger UI: http://localhost:3000/docs
- Health check: http://localhost:3000/health

The app waits for Postgres, creates the tasks table automatically and inserts exactly three example tasks **only when the table is empty**. PostgreSQL saves data in the named **taskdata** Docker volume, so docker compose down and up **preserve data** (avoid docker compose down -v unless you intend to erase it).

### Local .env settings

| Key | Purpose |
|---|---|
| POSTGRES_USER | Local Postgres user |
| POSTGRES_PASSWORD | Password for local Postgres container |
| POSTGRES_DB | Database name |
| DATABASE_URL | Connection string for API; must use host **db**, not localhost |
| PORT | Published HTTP port, normally 3000 |

The public .env.example contains demo-only placeholders, not production credentials. The actual .env is ignored by Git and excluded from the Docker build.

## CRUD endpoints

| Method | Path | Meaning | Success | Errors |
|---|---|---|---|---|
| GET | / | Information | 200 | — |
| GET | /tasks | List tasks; optional done and search filters | 200 | 400 |
| GET | /tasks/:id | Read task | 200 | 404 |
| POST | /tasks | Create task with title | 201 | 400 |
| PUT | /tasks/:id | Update title and/or done | 200 | 400, 404 |
| DELETE | /tasks/:id | Delete task, empty body | 204 | 404 |
| GET | /stats | Total, completed and open counts | 200 | — |
| POST | /reset | Restore seeds (development extra) | 200 | — |
| GET | /health | Ping database | 200 | 503 |
| GET | /docs | Swagger | 200 | — |

All database queries live in **database/tasks.js** and use parameter placeholders $1, $2, etc. The same request and response shapes as the earlier SQLite API are preserved.

### Example curl -i commands

Run in Windows PowerShell. Use curl.exe rather than the older PowerShell curl alias.

~~~powershell
curl.exe -i http://localhost:3000/tasks
curl.exe -i http://localhost:3000/tasks/999999
curl.exe -i -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"Finish assignment"}'
curl.exe -i -X PUT http://localhost:3000/tasks/4 -H "Content-Type: application/json" -d '{"done":true}'
curl.exe -i -X DELETE http://localhost:3000/tasks/4
~~~

For update/delete, use the actual ID returned by POST; it will only be 4 on a fresh first run. Example **expected** response excerpt (headers and date vary in real runs):

~~~http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

[{"id":1,"title":"Buy groceries","done":false},{"id":2,"title":"Walk the dog","done":true},{"id":3,"title":"Read a book","done":false}]
~~~

The GitHub Actions evidence artifact includes the **real** curl -i output from the running containerized API.

## Full automated verification / persistence

With Node.js 22+ locally, the following PowerShell commands test the full CRUD cycle and prove persistence:

~~~powershell
docker compose up -d --build
node test/smoke.js --persist-file persistence-id.txt
docker compose down
docker compose up -d
node test/smoke.js --verify-persisted (Get-Content persistence-id.txt)
~~~

The smoke test checks seeded data, GET-by-ID, filtering, searching, 400/404 errors, POST/PUT/DELETE statuses, empty 204 body, and the stats route. A separate persistence assertion confirms the created row **survives both containers being removed and started again**.

To inspect the real SQL data:

~~~powershell
docker compose exec db psql -U taskapp -d tasks -c "\dt"
docker compose exec db psql -U taskapp -d tasks -c "SELECT id, title, done FROM tasks ORDER BY id;"
~~~

Change taskapp/tasks if you changed the local user/database. Screenshot your actual visible database result and save to docs/postgres-terminal-screenshot.png if a direct terminal screenshot is required.

The [A3 GitHub Actions workflow](https://github.com/DipanshuG63/CRUD-API/actions/workflows/a3-docker-smoke.yml) also starts genuine Docker/PG containers, runs smoke tests, performs down/up, checks the persisted row, and captures real SQL output plus curl -i evidence. If it succeeds it commits **docs/postgres-proof.png**, a clearly labeled **rendered visual of the actual live psql output** (not a direct desktop screenshot). GitHub Actions uploads original query output and PNG as **a3-postgres-proof**.

## Repository layout

~~~text
server.js                    Express API routes, validation and error handling
database/tasks.js            PostgreSQL table init, seed-once and parameterized SQL
Dockerfile                   Container recipe for Node.js
compose.yaml                 Two services and persistent volume
.env.example                 Public local-only configuration template
.gitignore / .dockerignore   Exclude secrets and unnecessary files
openapi.json                 Swagger API specification
test/smoke.js                CRUD + persistence smoke checks
scripts/render_db_proof.py  Render real CI SQL output into an evidence image
.github/workflows/           CI Docker Compose end-to-end test
README.md                    Assignment instructions and evidence
~~~

**Commit history:** This branch continues from the original A2 SQLite commit and adds six progressive A3 stage commits (environment, PostgreSQL migration, Dockerfile, Compose, tests and documentation). It does not replace the W4 main branch.

**Verification boundary:** source inspection alone cannot prove live Docker operation. Check the linked workflow status and the actual database proof before marking this assignment fully tested.

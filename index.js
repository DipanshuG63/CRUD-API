// Task API - Week 3 (SQLite) + Week 4 assignment (A4): Supabase Auth, JWT verification, protected routes.

require('dotenv').config({ quiet: true });

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const swaggerUi = require('swagger-ui-express');
const Database = require('better-sqlite3');
const path = require('path');
const openapi = require('./openapi.json');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

/* ------------------------------------------------------------------ */
/* Supabase Auth client (Identity Provider)                            */
/* ------------------------------------------------------------------ */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // anon (public) key only

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY. Copy .env.example to .env and fill them in.');
  process.exit(1);
}

// The server never keeps a login session of its own: every request carries its own token.
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/* ------------------------------------------------------------------ */
/* Storage layer: SQLite                                               */
/* ------------------------------------------------------------------ */

const SEED_TASKS = [
  { title: 'Buy groceries', done: 0 },
  { title: 'Walk the dog', done: 1 },
  { title: 'Read a book', done: 0 },
];

// Stage 0: opening a missing file creates it.
const db = new Database(path.join(__dirname, 'tasks.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id    INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    done  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
`);

const insertTask = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');

// Seed only when empty; transaction = all three inserts or none.
const seedIfEmpty = db.transaction(() => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();
  if (count === 0) {
    for (const t of SEED_TASKS) insertTask.run(t.title, t.done);
  }
});
seedIfEmpty();

const resetTasks = db.transaction(() => {
  db.prepare('DELETE FROM tasks').run();
  for (const t of SEED_TASKS) insertTask.run(t.title, t.done);
});

// SQLite stores booleans as 0/1; the API returns true/false like before.
function toTask(row) {
  return { id: row.id, title: row.title, done: row.done === 1 };
}

function getRow(id) {
  if (!Number.isInteger(id)) return undefined;
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

/* ------------------------------------------------------------------ */
/* Routes (unchanged behaviour)                                        */
/* ------------------------------------------------------------------ */

// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0',
    endpoints: [
      '/tasks', '/tasks/:id', '/stats', '/reset', '/health', '/docs',
      '/auth/signup', '/auth/login', '/auth/logout',
      '/public/info', '/protected/profile', '/protected/dashboard',
    ],
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Read - list tasks (with SQL-based filter + search extras)
app.get('/tasks', (req, res) => {
  const where = [];
  const params = [];

  if (req.query.done !== undefined) {
    if (req.query.done !== 'true' && req.query.done !== 'false') {
      return res.status(400).json({ error: 'done must be true or false' });
    }
    where.push('done = ?');
    params.push(req.query.done === 'true' ? 1 : 0);
  }

  if (req.query.search !== undefined) {
    const search = String(req.query.search).trim();
    if (search === '') {
      return res.status(400).json({ error: 'search must not be empty' });
    }
    const escaped = search.replace(/[\\%_]/g, (c) => '\\' + c);
    where.push("title LIKE ? ESCAPE '\\'");
    params.push(`%${escaped}%`);
  }

  const sql =
    'SELECT * FROM tasks' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY id';

  res.status(200).json(db.prepare(sql).all(...params).map(toTask));
});

// Read - single task
app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = getRow(id);

  if (!row) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.status(200).json(toTask(row));
});

// Create
app.post('/tasks', (req, res) => {
  const { title } = req.body ?? {};

  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({
      error: 'title is required and cannot be empty',
    });
  }

  const info = insertTask.run(title.trim(), 0);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(toTask(row));
});

// Update
app.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = getRow(id);

  if (!row) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      error: 'request body must include title and/or done',
    });
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(body, 'done');

  if (!hasTitle && !hasDone) {
    return res.status(400).json({
      error: 'request body must include title and/or done',
    });
  }

  let title = row.title;
  let done = row.done;

  if (hasTitle) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    title = body.title.trim();
  }

  if (hasDone) {
    if (typeof body.done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    done = body.done ? 1 : 0;
  }

  db.prepare('UPDATE tasks SET title = ?, done = ? WHERE id = ?').run(title, done, id);
  res.status(200).json(toTask({ id, title, done }));
});

// Delete
app.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = Number.isInteger(id)
    ? db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    : { changes: 0 };

  if (info.changes === 0) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.status(204).send();
});

// Statistics - computed in SQL
app.get('/stats', (req, res) => {
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(done), 0) AS done
       FROM tasks`
    )
    .get();

  res.status(200).json({
    total: stats.total,
    done: stats.done,
    open: stats.total - stats.done,
  });
});

// Restore seed data
app.post('/reset', (req, res) => {
  resetTasks();
  const rows = db.prepare('SELECT * FROM tasks ORDER BY id').all();
  res.status(200).json(rows.map(toTask));
});

/* ------------------------------------------------------------------ */
/* Auth routes                                                         */
/* ------------------------------------------------------------------ */

// Supabase network/server failures are not the client's fault -> 502, not 400/401.
function isUpstreamError(error) {
  return !error.status || error.status >= 500;
}

// ---- Stage 1: sign up & log in -------------------------------------

function validCredentials(body) {
  const { email, password } = body ?? {};
  return typeof email === 'string' && email.trim() !== '' &&
    typeof password === 'string' && password !== '';
}

app.post('/auth/signup', async (req, res) => {
  if (!validCredentials(req.body)) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });

  if (error) {
    if (isUpstreamError(error)) {
      return res.status(502).json({ error: 'Auth service unavailable' });
    }
    return res.status(400).json({ error: error.message });
  }

  res.status(201).json(data.user);
});

app.post('/auth/login', async (req, res) => {
  if (!validCredentials(req.body)) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    if (isUpstreamError(error)) {
      return res.status(502).json({ error: 'Auth service unavailable' });
    }
    return res.status(401).json({ error: 'Invalid login credentials' });
  }

  res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    token_type: 'bearer',
  });
});

// ---- Stage 2: public route ------------------------------------------

app.get('/public/info', (req, res) => {
  res.status(200).json({ message: 'Welcome stranger! This info is public.' });
});

// ---- Stage 4: reusable auth middleware ---------------------------------

// Verifies the bearer token with Supabase, then attaches the user to req.user.
async function requireAuth(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');

  if (!match) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = match[1];

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      if (error && isUpstreamError(error)) {
        return res.status(502).json({ error: 'Auth service unavailable' });
      }
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = data.user;
    req.token = token;
    next();
  } catch (err) {
    res.status(502).json({ error: 'Auth service unavailable' });
  }
}

app.get('/protected/profile', requireAuth, (req, res) => {
  const { id, email, created_at } = req.user;
  res.status(200).json({ id, email, created_at });
});

// Second protected route: same middleware, no new auth code.
app.get('/protected/dashboard', requireAuth, (req, res) => {
  res.status(200).json({ message: `Welcome to your dashboard, ${req.user.email}` });
});

app.post('/auth/logout', requireAuth, async (req, res) => {
  // admin.signOut(jwt) revokes the session that belongs to this user's token.
  const { error } = await supabase.auth.admin.signOut(req.token);

  if (error) {
    return res.status(502).json({ error: 'Auth service unavailable' });
  }

  res.status(204).send();
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port} and connected to Supabase (${SUPABASE_URL})`);
});

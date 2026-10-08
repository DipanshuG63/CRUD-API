// Task API - Week 3 assignment (A2)
// Same CRUD API as Week 2, but tasks are now stored in SQLite (tasks.db).

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const Database = require('better-sqlite3');
const path = require('path');
const openapi = require('./openapi.json');

const app = express();
const port = 3000;

app.use(express.json());

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
    endpoints: ['/tasks', '/tasks/:id', '/stats', '/reset', '/health', '/docs'],
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

app.listen(port, () => {
  console.log(`CRUD API listening on http://localhost:${port}`);
});

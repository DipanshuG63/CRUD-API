// Task API - Week 2 CRUD assignment
// In-memory CRUD API for a to-do list.

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi.json');

const app = express();
const port = 3000;

app.use(express.json());

// In-memory data: intentionally lost when the server restarts.
const SEED_TASKS = [
  { id: 1, title: 'Buy groceries', done: false },
  { id: 2, title: 'Walk the dog', done: true },
  { id: 3, title: 'Read a book', done: false },
];

const tasks = SEED_TASKS.map((task) => ({ ...task }));

function resetTasks() {
  tasks.length = 0;
  tasks.push(...SEED_TASKS.map((task) => ({ ...task })));
}

// Stage 0: SQLite database, table and seed
const DB_SEED_TASKS = [
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
    for (const t of DB_SEED_TASKS) insertTask.run(t.title, t.done);
  }
});
seedIfEmpty();

const resetDb = db.transaction(() => {
  db.prepare('DELETE FROM tasks').run();
  for (const t of DB_SEED_TASKS) insertTask.run(t.title, t.done);
});

// SQLite stores booleans as 0/1; the API returns true/false like before.
function toTask(row) {
  return { id: row.id, title: row.title, done: row.done === 1 };
}

function getRow(id) {
  if (!Number.isInteger(id)) return undefined;
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// Stage 0-1: root and health endpoints
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

// Stage 1: Read - list tasks (with SQL-based filter + search extras)
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

// Stage 3: Create
app.post('/tasks', (req, res) => {
  const { title } = req.body ?? {};

  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({
      error: 'title is required and cannot be empty',
    });
  }

  const nextId =
    tasks.length === 0
      ? 1
      : Math.max(...tasks.map((task) => task.id)) + 1;

  const task = {
    id: nextId,
    title: title.trim(),
    done: false,
  };

  tasks.push(task);
  res.status(201).json(task);
});

// Stage 4: Update
app.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const task = tasks.find((item) => item.id === id);

  if (!task) {
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

  if (hasTitle) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    task.title = body.title.trim();
  }

  if (hasDone) {
    if (typeof body.done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    task.done = body.done;
  }

  res.status(200).json(task);
});

// Stage 4: Delete
app.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = tasks.findIndex((item) => item.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  tasks.splice(index, 1);
  res.status(204).send();
});

// Optional extra: statistics
app.get('/stats', (req, res) => {
  const done = tasks.filter((task) => task.done).length;

  res.status(200).json({
    total: tasks.length,
    done,
    open: tasks.length - done,
  });
});

// Optional extra: restore seed data
app.post('/reset', (req, res) => {
  resetTasks();
  res.status(200).json(tasks);
});

app.listen(port, () => {
  console.log(`CRUD API listening on http://localhost:${port}`);
});

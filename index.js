// Task API - Week 2 CRUD assignment
const express = require('express');

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

// Stage 1: root and health endpoints
app.get('/', (req, res) => {
  res.json({ name: 'Task API', version: '1.0', endpoints: ['/tasks'] });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Stage 2: Read - list tasks
app.get('/tasks', (req, res) => {
  res.status(200).json(tasks);
});

// Stage 2: Read - single task
app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const task = tasks.find((item) => item.id === id);

  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.status(200).json(task);
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

app.listen(port, () => {
  console.log(`CRUD API listening on http://localhost:${port}`);
});

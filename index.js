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

app.listen(port, () => {
  console.log(`CRUD API listening on http://localhost:${port}`);
});

// Task API - Week 2 CRUD assignment
const express = require('express');

const app = express();
const port = 3000;

app.use(express.json());

// Stage 1: root and health endpoints
app.get('/', (req, res) => {
  res.json({ name: 'Task API', version: '1.0', endpoints: ['/tasks'] });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`CRUD API listening on http://localhost:${port}`);
});

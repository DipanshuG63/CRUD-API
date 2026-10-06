// Task API - Week 2 CRUD assignment
const express = require('express');

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello from the Task API!');
});

app.listen(port, () => {
  console.log(`CRUD API listening on http://localhost:${port}`);
});

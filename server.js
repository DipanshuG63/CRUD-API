'use strict';
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const repository = require('./database/tasks');
const specification = require('./openapi.json');

const app = express();
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(specification));

function validId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
function missing(res, rawId) {
  return res.status(404).json({ error: 'Task ' + rawId + ' not found' });
}

app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0',
    endpoints: ['/tasks', '/tasks/:id', '/stats', '/reset', '/health', '/docs'],
  });
});

app.get('/health', async (req, res) => {
  await repository.health();
  res.status(200).json({ status: 'ok', db: 'ok' });
});

app.get('/tasks', async (req, res) => {
  let done;
  if (req.query.done !== undefined) {
    if (req.query.done !== 'true' && req.query.done !== 'false') {
      return res.status(400).json({ error: 'done must be true or false' });
    }
    done = req.query.done === 'true';
  }
  let search;
  if (req.query.search !== undefined) {
    if (typeof req.query.search !== 'string' || req.query.search.trim() === '') {
      return res.status(400).json({ error: 'search must not be empty' });
    }
    search = req.query.search.trim();
  }
  res.status(200).json(await repository.all({ done, search }));
});

app.get('/tasks/:id', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return missing(res, req.params.id);
  const task = await repository.one(id);
  if (!task) return missing(res, req.params.id);
  res.status(200).json(task);
});

app.post('/tasks', async (req, res) => {
  const title = req.body?.title;
  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required and cannot be empty' });
  }
  res.status(201).json(await repository.create(title.trim()));
});

app.put('/tasks/:id', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return missing(res, req.params.id);
  const existing = await repository.one(id);
  if (!existing) return missing(res, req.params.id);
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'request body must include title and/or done' });
  }
  const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(body, 'done');
  if (!hasTitle && !hasDone) {
    return res.status(400).json({ error: 'request body must include title and/or done' });
  }
  if (hasTitle && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return res.status(400).json({ error: 'title cannot be empty' });
  }
  if (hasDone && typeof body.done !== 'boolean') {
    return res.status(400).json({ error: 'done must be a boolean' });
  }
  const title = hasTitle ? body.title.trim() : existing.title;
  const done = hasDone ? body.done : existing.done;
  const updated = await repository.update(id, title, done);
  if (!updated) return missing(res, req.params.id);
  res.status(200).json(updated);
});

app.delete('/tasks/:id', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return missing(res, req.params.id);
  const removed = await repository.remove(id);
  if (!removed) return missing(res, req.params.id);
  res.status(204).send();
});

app.get('/stats', async (req, res) => {
  res.status(200).json(await repository.stats());
});

app.post('/reset', async (req, res) => {
  res.status(200).json(await repository.reset());
});

app.use((error, req, res, next) => {
  if (error.status === 400 || error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error('Request failed:', error.message);
  res.status(503).json({ error: 'Database or server unavailable' });
});

async function start() {
  await repository.initialize();
  const port = Number(process.env.PORT || 3000);
  const listener = app.listen(port, '0.0.0.0', () => {
    console.log('CRUD API listening on port ' + port);
  });
  return listener;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Startup failed:', error.message);
    process.exitCode = 1;
  });
}
module.exports = { app, start, validId };

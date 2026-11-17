'use strict';
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Copy .env.example to .env and set its password.');
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const seeds = [
  ['Buy groceries', false],
  ['Walk the dog', true],
  ['Read a book', false],
];

async function initialize() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(90210)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS tasks (' +
      'id SERIAL PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT FALSE)'
    );
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done)');
    const count = await client.query('SELECT COUNT(*) AS count FROM tasks');
    if (Number(count.rows[0].count) === 0) {
      for (const [title, done] of seeds) {
        await client.query('INSERT INTO tasks (title, done) VALUES ($1, $2)', [title, done]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function all({ done, search } = {}) {
  const where = [];
  const values = [];
  if (done !== undefined) {
    values.push(done);
    where.push('done = $' + values.length);
  }
  if (search !== undefined) {
    values.push(search);
    where.push('POSITION(LOWER($' + values.length + ') IN LOWER(title)) > 0');
  }
  const sql = 'SELECT id, title, done FROM tasks' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id';
  return (await pool.query(sql, values)).rows;
}

async function one(id) {
  const result = await pool.query('SELECT id, title, done FROM tasks WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function create(title) {
  const result = await pool.query(
    'INSERT INTO tasks (title, done) VALUES ($1, $2) RETURNING id, title, done',
    [title, false]
  );
  return result.rows[0];
}

async function update(id, title, done) {
  const result = await pool.query(
    'UPDATE tasks SET title = $1, done = $2 WHERE id = $3 RETURNING id, title, done',
    [title, done, id]
  );
  return result.rows[0] || null;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

async function stats() {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE done)::int AS done FROM tasks'
  );
  const { total, done } = result.rows[0];
  return { total, done, open: total - done };
}

async function reset() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE tasks RESTART IDENTITY');
    for (const [title, done] of seeds) {
      await client.query('INSERT INTO tasks (title, done) VALUES ($1, $2)', [title, done]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return all();
}

async function health() {
  await pool.query('SELECT 1');
  return true;
}

module.exports = { initialize, all, one, create, update, remove, stats, reset, health };

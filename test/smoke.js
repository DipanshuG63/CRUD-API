'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function request(method, url, json) {
  const headers = json === undefined ? {} : { 'content-type': 'application/json' };
  const response = await fetch(base + url, {
    method, headers, body: json === undefined ? undefined : JSON.stringify(json),
  });
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : null;
  return { status: response.status, body, bodyText };
}
async function waitForHealth() {
  for (let count = 0; count < 60; count++) {
    try {
      const result = await request('GET', '/health');
      if (result.status === 200 && result.body.db === 'ok') return;
    } catch (error) {
      // Wait for the API and its database to become ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('API /health did not become ready within 60 seconds');
}
async function main() {
  await waitForHealth();

  const verifyIndex = process.argv.indexOf('--verify-persisted');
  if (verifyIndex !== -1) {
    const id = Number(process.argv[verifyIndex + 1]);
    assert.ok(Number.isSafeInteger(id) && id > 0);
    const result = await request('GET', '/tasks/' + id);
    assert.equal(result.status, 200, 'Persisted task must survive docker compose down/up');
    assert.match(result.body.title, /^PERSISTENCE_TEST_/);
    console.log('PASS: persistent Postgres task still exists after full stack restart:', id);
    return;
  }

  const listed = await request('GET', '/tasks');
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.body));
  assert.ok(listed.body.length >= 3, 'First boot must seed 3 tasks');

  const one = await request('GET', '/tasks/' + listed.body[0].id);
  assert.equal(one.status, 200);
  assert.equal(typeof one.body.done, 'boolean');

  const filter = await request('GET', '/tasks?done=true');
  assert.equal(filter.status, 200);
  assert.ok(filter.body.every((t) => t.done === true));

  const search = await request('GET', '/tasks?search=BOOK');
  assert.equal(search.status, 200);
  assert.ok(search.body.some((t) => t.title.toLowerCase().includes('book')));

  const missing = await request('GET', '/tasks/99999999');
  assert.equal(missing.status, 404);
  assert.equal(typeof missing.body.error, 'string');

  const invalid = await request('POST', '/tasks', {});
  assert.equal(invalid.status, 400);
  assert.equal(typeof invalid.body.error, 'string');

  const created = await request('POST', '/tasks', { title: 'A3 smoke task' });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, 'A3 smoke task');
  assert.equal(created.body.done, false);
  const id = created.body.id;

  const updated = await request('PUT', '/tasks/' + id, { title: 'A3 updated', done: true });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.done, true);
  assert.equal(updated.body.title, 'A3 updated');

  const invalidUpdate = await request('PUT', '/tasks/' + id, { done: 'yes' });
  assert.equal(invalidUpdate.status, 400);

  const deleted = await request('DELETE', '/tasks/' + id);
  assert.equal(deleted.status, 204);
  assert.equal(deleted.bodyText, '');

  const gone = await request('GET', '/tasks/' + id);
  assert.equal(gone.status, 404);

  const stats = await request('GET', '/stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.body.total >= 3);

  const persistent = await request('POST', '/tasks', {
    title: 'PERSISTENCE_TEST_' + Date.now(),
  });
  assert.equal(persistent.status, 201);
  const persistIndex = process.argv.indexOf('--persist-file');
  if (persistIndex !== -1) {
    fs.writeFileSync(process.argv[persistIndex + 1], String(persistent.body.id));
  }
  console.log('PASS: health, seed, read, filters, 400, 404, create, update, delete, stats');
  console.log('PASS: created persistence test task:', persistent.body.id);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

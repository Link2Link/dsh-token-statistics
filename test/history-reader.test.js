import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync, constants } from 'node:zlib';
import { createHistoricalReader } from '../history-reader.js';

const usage = { inputTokens: 10, outputTokens: 2, cacheReadTokens: 3 };
const event = (type, seq, data = {}, time = 1700000000000 + seq) => ({ type, seq, time, data });
const header = (id, version = 0, extra = {}) => ({ type: 'session', version, id, createdAt: 1700000000000, delegationDepth: 0, ...(version >= 2 ? { isSeeded: false } : {}), ...extra });
const message = (seq, extra = {}) => event('assistant/message', seq, { turn: 0, step: 0, message: { role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' }, content: [{ type: 'text', text: 'SECRET' }] }, ...extra });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'history-reader-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function put(root, id, version, records, compressed = false) {
  const dir = join(root, 'project', encodeURIComponent(id));
  await mkdir(dir, { recursive: true });
  const path = join(dir, `session${version ? `.v${version}` : ''}.jsonl${compressed ? '.zstd' : ''}`);
  const bytes = records.map(row => Buffer.from(JSON.stringify(row) + '\n'));
  await writeFile(path, compressed ? Buffer.concat(bytes.map(row => zstdCompressSync(row, { params: { [constants.ZSTD_c_checksumFlag]: 1 } }))) : Buffer.concat(bytes));
  return path;
}

test('v0 descriptor v2 is physically readable, cumulative usage settles once without content or writes', async t => {
  const root = await fixture(t);
  const records = [header('legacy'), event('subagent/descriptor', 0, { version: 2 }),
    event('request/context', 1, { provider: 'p', model: 'm', system: 'SECRET' }),
    event('assistant/chunk', 2, { turn: 0, step: 0, chunk: { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } } }),
    event('assistant/chunk', 3, { turn: 0, step: 0, chunk: { type: 'usage', usage } }), message(4), event('step/end', 5, { turn: 0, step: 0 })];
  const path = await put(root, 'legacy', 0, records, true);
  const before = await readFile(path);
  const beforeStat = await stat(path);
  const reader = createHistoricalReader(root);
  const snapshots = await reader.list();
  assert.equal(snapshots.length, 1);
  const handle = await reader.open('legacy', 'read');
  const { events } = await handle.read();
  assert.deepEqual(events.map(row => row.type), ['request/context', 'assistant/message']);
  assert.equal(events[1].seq, 4);
  assert.deepEqual(events[1].data.usage, { ...usage, legacyReported: true });
  assert.ok(!JSON.stringify(events).includes('SECRET'));
  await handle.close();
  await assert.rejects(handle.read(), /closed/);
  assert.deepEqual(await readFile(path), before);
  assert.equal((await stat(path)).mtimeMs, beforeStat.mtimeMs);
  assert.equal((await reader.list())[0].revision, snapshots[0].revision);
  await assert.rejects(reader.open('legacy', 'write'), /read-only/);
});

test('v0 packed runs retain sequence and failed attempts, retry consumes usage once', async t => {
  const root = await fixture(t);
  await put(root, 'retry', 0, [header('retry'),
    { type: 'text-chunks', seq0: 0, time0: 1700000000000, data: { turn: 0, step: 0, index: 0, dt: [1], texts: ['SECRET', 'SECRET'] } },
    event('assistant/chunk', 2, { turn: 0, step: 0, chunk: { type: 'usage', usage } }),
    event('llm/retry', 3),
    event('assistant/chunk', 4, { turn: 0, step: 0, chunk: { type: 'usage', usage: { inputTokens: 20, outputTokens: 4 } } }),
    message(5)]);
  const reader = createHistoricalReader(root);
  await reader.list();
  const handle = await reader.open('retry', 'read');
  const { events } = await handle.read();
  assert.deepEqual(events.map(row => [row.type, row.seq]), [['assistant/attempt', 2], ['assistant/message', 5]]);
  assert.equal(events[0].data.stream[0].chunk.usage.inputTokens, 10);
  assert.equal(events[1].data.usage.inputTokens, 20);
  await handle.close();
});

test('highest exact generation selected and modern inherited prefix uses marker seq', async t => {
  const root = await fixture(t);
  await put(root, 'fork', 0, [header('fork'), message(0, { usage })]);
  const path = await put(root, 'fork', 4, [header('fork', 4, { isSeeded: true }), message(0, { usage }), event('session/end-seed', 1, { inherited: true }), message(2, { usage: { ...usage, totalTokens: 15 } })], true);
  await writeFile(join(root, 'project', 'fork', 'session.v99.jsonl.tmp'), 'invalid');
  const reader = createHistoricalReader(root);
  const snapshots = await reader.list();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].header.version, 4);
  const handle = await reader.open('fork', 'read');
  assert.equal(handle.inheritedEventCount, 1);
  assert.deepEqual((await handle.read(1)).events.map(row => row.seq), [2]);
  assert.equal((await handle.read(0, 1)).events.length, 1);
  assert.ok(!(await handle.read()).events[0].data.usage.legacyReported);
  await handle.close();
  const oldRevision = snapshots[0].revision;
  const bytes = await readFile(path);
  await writeFile(path, Buffer.concat([bytes, zstdCompressSync(Buffer.from(JSON.stringify(event('step/end', 3)) + '\n'))]));
  assert.notEqual((await reader.list())[0].revision, oldRevision);
});

test('v0 seedLength excludes inherited usage exactly', async t => {
  const root = await fixture(t);
  await put(root, 'seed', 0, [header('seed', 0, { seedLength: 1 }), message(0, { usage }), event('session/end-seed', 1), message(2, { usage })]);
  const reader = createHistoricalReader(root);
  await reader.list();
  const handle = await reader.open('seed', 'read');
  assert.equal(handle.inheritedEventCount, 1);
  assert.deepEqual((await handle.read(handle.inheritedEventCount)).events.map(row => row.seq), [2]);
  await handle.close();
});

test('torn plaintext, torn compressed frame and checksum corruption refuse without repair', async t => {
  const root = await fixture(t);
  const plain = await put(root, 'plain', 0, [header('plain'), message(0, { usage })]);
  await writeFile(plain, Buffer.concat([await readFile(plain), Buffer.from('{"type":')]));
  const torn = await put(root, 'torn', 0, [header('torn'), message(0, { usage })], true);
  const tornBytes = await readFile(torn);
  await writeFile(torn, tornBytes.subarray(0, tornBytes.length - 2));
  const corrupt = await put(root, 'corrupt', 0, [header('corrupt'), message(0, { usage })], true);
  const corruptBytes = await readFile(corrupt);
  corruptBytes[corruptBytes.length - 1] ^= 1;
  await writeFile(corrupt, corruptBytes);
  const reader = createHistoricalReader(root);
  assert.equal((await reader.list()).length, 3);
  for (const id of ['plain', 'torn', 'corrupt']) await assert.rejects(reader.open(id, 'read'));
  assert.deepEqual(await readFile(corrupt), corruptBytes);
  assert.equal((await stat(torn)).size, tornBytes.length - 2);
});

test('finish boundaries separate attempts and inherited cuts may not split attempts', async t => {
  const root = await fixture(t);
  await put(root, 'terminal', 0, [header('terminal'),
    event('assistant/chunk', 0, { turn: 0, step: 0, chunk: { type: 'usage', usage } }),
    event('assistant/chunk', 1, { turn: 0, step: 0, chunk: { type: 'finish', reason: { kind: 'error' } } }),
    event('assistant/chunk', 2, { turn: 0, step: 0, chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 1 } } }),
    message(3, { usage: { inputTokens: 8, outputTokens: 2 } })]);
  await put(root, 'split', 0, [header('split', 0, { seedLength: 1 }),
    event('assistant/chunk', 0, { turn: 0, step: 0, chunk: { type: 'usage', usage } }), message(1)]);
  const reader = createHistoricalReader(root);
  await reader.list();
  const handle = await reader.open('terminal', 'read');
  const { events } = await handle.read();
  assert.deepEqual(events.map(row => [row.type, row.seq]), [['assistant/attempt', 1], ['assistant/message', 3]]);
  assert.equal(events[1].data.usage.inputTokens, 8);
  await handle.close();
  await assert.rejects(reader.open('split', 'read'), /splits/);
});

test('sequence gaps, missing inherited marker, symlinks, abort and changing snapshots fail closed', async t => {
  const root = await fixture(t);
  await put(root, 'gap', 0, [header('gap'), message(1)]);
  await put(root, 'marker', 3, [header('marker', 3, { isSeeded: true }), message(0)]);
  const changed = await put(root, 'changed', 0, [header('changed')]);
  await symlink(join(root, 'project'), join(root, 'project-link'));
  const reader = createHistoricalReader(root);
  assert.equal((await reader.list()).length, 3);
  await assert.rejects(reader.open('gap', 'read'), /gap/);
  await assert.rejects(reader.open('marker', 'read'), /marker/);
  await writeFile(changed, 'changed');
  await assert.rejects(reader.open('changed', 'read'), /changed/);
  const signal = AbortSignal.abort(new Error('cancelled'));
  await assert.rejects(reader.list({ signal }), /cancelled/);
  await assert.rejects(reader.open('gap', 'read', { signal }), /cancelled/);
});

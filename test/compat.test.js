import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_GENERATION, createHistoricalReader, loadSessionCodecs, sessionCodecs, sessionCodecsError,
} from '../history-reader.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'token-stats-compat-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
// A session in a generation this reader has never seen: the content is
// deliberately not a format it could decode.
async function putFuture(root, id, generation = MAX_GENERATION + 5) {
  const dir = join(root, 'project', id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `session.v${generation}.jsonl`), JSON.stringify({ type: 'session', version: generation, id, futureOnly: true }) + '\n');
}

test('codecs load from the installed runtime', () => {
  assert.equal(sessionCodecsError, undefined);
  for (const key of ['v0', 'v1', 'v2']) assert.equal(typeof sessionCodecs[key].createDecoder, 'function');
});

test('missing or renamed codec exports degrade instead of throwing', async () => {
  const missingModule = await loadSessionCodecs(async () => { throw new Error('Cannot find package'); });
  assert.equal(missingModule.codecs, undefined);
  assert.match(String(missingModule.error), /Cannot find package/);

  const renamed = await loadSessionCodecs(async specifier => (specifier.endsWith('v0-to-v1')
    ? { releasedV0SessionFormatCodec: { createDecoder() {} } }
    : { somethingElse: {} }));
  assert.equal(renamed.codecs, undefined);
  assert.match(renamed.error.message, /unavailable: v1, v2/);
});

test('physical reader refuses to start without codecs', () => {
  assert.throws(() => createHistoricalReader('/tmp/anything', { codecs: null }), TypeError);
});

test('future generations are delegated to the official service', async t => {
  const root = await fixture(t);
  await putFuture(root, 'future-session');
  const opened = [];
  const handle = { header: { id: 'future-session' }, inheritedEventCount: 0, read: async () => ({ events: [] }), close: async () => {} };
  const fallback = { async open(id, access) { opened.push([id, access]); return handle; } };

  const reader = createHistoricalReader(root, { fallback });
  const snapshots = await reader.list();
  assert.deepEqual(snapshots.map(snapshot => snapshot.header.id), ['future-session']);
  assert.equal(await reader.open('future-session', 'read'), handle);
  // Delegation never asks for write access, so no migration is published.
  assert.deepEqual(opened, [['future-session', 'read']]);
});

test('without a fallback, future generations still fail closed', async t => {
  const root = await fixture(t);
  await putFuture(root, 'future-session');
  const reader = createHistoricalReader(root);
  assert.equal((await reader.list()).length, 1);
  await assert.rejects(reader.open('future-session', 'read'), /Unsupported session generation/);
});

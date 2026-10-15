import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeUsage, initState, applyEvent, stateSchema, aggregateStates,
  createCollector, validateTimeZone,
} from '../statistics.js';
import { apply } from '../index.js';

const time = Date.parse('2026-01-01T18:40:00Z');
// Official runtime TokenUsage.inputTokens is uncached prompt, not inclusive input.
const usage = { inputTokens: 10, outputTokens: 4, totalTokens: 21, cacheReadTokens: 5, cacheWriteTokens: 2, reasoningTokens: 3 };
const message = (seq, extra = {}) => ({
  type: 'assistant/message', seq, time,
  data: { message: { source: { provider: 'p', model: 'm' } }, usage, stream: [], ...extra },
});
const emptySessions = { list: () => [], get: () => undefined };
const noProjections = { stateOf: () => undefined };

test('normalizes uncached input with cache subsets without double counting', () => {
  assert.deepEqual(normalizeUsage(usage), [17, 4, 5, 2, 3]);
  assert.deepEqual(normalizeUsage({ ...usage, totalTokens: undefined }), [17, 4, 5, 2, 3]);
  assert.deepEqual(normalizeUsage({ inputTokens: 10, outputTokens: 4, totalTokens: 21 }), [17, 4, null, null, null]);
  assert.deepEqual(normalizeUsage({ inputTokens: 10, outputTokens: 4 }), [10, 4, null, null, null]);
  const minimum = aggregateStates([applyEvent(initState({}), message(0, {usage:{inputTokens:10,outputTokens:4}}))], 'UTC', 1, 0);
  assert.equal(minimum.coverage.reportedMinimum,1);
  assert.equal(minimum.days[0].models[0].total,14);
  assert.equal(normalizeUsage({ ...usage, totalTokens: 8 }), null);
  assert.equal(normalizeUsage({ ...usage, reasoningTokens: 5 }), null);
  assert.equal(normalizeUsage({ ...usage, cacheReadTokens: -1 }), null);
  assert.equal(normalizeUsage({ ...usage, inputTokens: NaN }), null);
  assert.throws(() => validateTimeZone('nonsense/zone'), RangeError);
  assert.throws(() => validateTimeZone('+05:30'), RangeError);
});

test('skips inherited settlements, takes final stream sample, retains real replaced calls', () => {
  let state = initState({ origin: 'subagent' }, 2);
  assert.equal(applyEvent(state, message(0)), state);
  assert.equal(applyEvent(state, { type: 'step/end', seq: 2 }), state);
  state = applyEvent(state, { type: 'request/header', seq: 2, data: { header: { config: { provider: 'p', model: 'm' } } } });
  state = applyEvent(state, message(3));
  state = applyEvent(state, { type: 'assistant/attempt', seq: 4, time, data: { stream: [
    { type: 'chunk', chunk: { type: 'usage', usage: { ...usage, inputTokens: 1, totalTokens: 12 } } },
    { type: 'chunk', chunk: { type: 'usage', usage } },
  ] } });
  state = applyEvent(state, message(5, { usage: undefined }));
  state = applyEvent(state, { type: 'assistant/attempt', seq: 6, time, data: { stream: [] } });
  state = applyEvent(state, { ...message(7), surfaceOp: { op: 'replace', startSeq: 3, endSeq: 5 } });
  assert.ok(stateSchema.safeParse(state).success);
  const report = aggregateStates([state], 'Asia/Kolkata', 1, 0);
  assert.equal(report.days[0].date, '2026-01-02');
  assert.equal(aggregateStates([state], 'UTC', 1, 0).days[0].date, '2026-01-01');
  assert.equal(report.coverage.missingUsage, 1);
  assert.equal(report.coverage.attemptsWithoutUsage, 1);
  const row = report.days[0].models[0];
  assert.equal(row.input, 51);
  assert.equal(row.output, 12);
  assert.equal(row.total, 63);
  assert.equal(row.cacheRead, 15);
  assert.equal(row.requests, 5);
  assert.equal(row.subagentRequests, 5);
  assert.equal(row.cacheReadReported, 3);
  assert.equal(report.coverage.partialBreakdown, 0);
  const partial = applyEvent(initState({}), message(0, { usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } }));
  assert.equal(aggregateStates([partial], 'UTC', 1, 0).coverage.partialBreakdown, 1);
});

test('cold collector is read-only, bounded, revision-cached, and diagnoses failures', async () => {
  let opened = 0, closed = 0, inFlight = 0, peak = 0, revision = 'r1';
  const persistence = {
    async list() { return Array.from({ length: 9 }, (_, i) => ({ header: { id: String(i) }, revision, eventCount: 4 })); },
    async open(id, access) {
      assert.equal(access, 'read');
      opened++; inFlight++; peak = Math.max(peak, inFlight);
      await new Promise(resolve => setImmediate(resolve));
      return {
        header: { id }, inheritedEventCount: 3,
        async read(offset, length) { assert.equal(offset, 3); assert.equal(length, undefined); return { events: [message(3)] }; },
        async close() { closed++; inFlight--; },
      };
    },
  };
  const collector = createCollector({ sessionPersistence: persistence, sessions: emptySessions, sessionProjections: noProjections });
  const [first, simultaneous] = await Promise.all([collector.collect('UTC'), collector.collect('UTC')]);
  assert.equal(first.coverage.sessions, 9);
  assert.equal(simultaneous.coverage.sessions, 9);
  assert.equal(opened, 9); assert.equal(closed, 9); assert.ok(peak <= 4);
  await collector.collect('UTC'); assert.equal(opened, 9);
  revision = 'r2'; await collector.collect('UTC'); assert.equal(opened, 18);
  persistence.list = async () => { throw Error('list failed'); };
  await assert.rejects(() => collector.collect('UTC'), /list failed/);
  persistence.list = async () => [{ header: { id: 'bad' }, revision: 'r3', eventCount: 1 }];
  let failedOpens = 0;
  persistence.open = async () => { failedOpens++; throw Error('inaccessible'); };
  const failed = await collector.collect('UTC');
  assert.equal(failed.coverage.failedSessions, 1); assert.ok(failed.warnings.length > 0);
  assert.equal((await collector.collect('UTC')).coverage.failedSessions, 1);
  assert.equal(failedOpens, 1);
});

test('cancellation closes historical handles before collection settles', async () => {
  const controller = new AbortController();
  let closed = 0;
  const collector = createCollector({
    sessionPersistence: {
      async list() { return [{ header: { id: 'cancel' }, revision: 'r', eventCount: 1 }]; },
      async open() { return {
        header: {}, inheritedEventCount: 0,
        async read() { controller.abort(); return { events: [message(0)] }; },
        async close() { closed++; },
      }; },
    },
    sessions: emptySessions, sessionProjections: noProjections,
  });
  await assert.rejects(() => collector.collect('UTC', controller.signal));
  assert.equal(closed, 1);
});

test('API validates timezone, sanitizes errors, and owns registration cleanup', async () => {
  let route, cleanup, projectionDisposed = 0, routeDisposed = 0;
  const ctx = {
    effect(fn) { cleanup = fn(); },
    sessionPersistence: { list: async () => [] }, sessions: emptySessions,
    sessionProjections: { register(definition) { assert.equal(definition.wire, undefined); return () => projectionDisposed++; } },
    connection: { fetch: { register(definition) { route = definition; return async () => routeDisposed++; } } },
  };
  apply(ctx);
  assert.equal(route.path, '/api/dsh-token-statistics');
  let response = await route.fetch(new Request('http://localhost/api/dsh-token-statistics?timeZone=Asia%2FKolkata'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).coverage.sessions, 0);
  response = await route.fetch(new Request('http://localhost/api/dsh-token-statistics?timeZone=bad'));
  assert.equal(response.status, 400);
  ctx.sessionPersistence.list = async () => { throw Error('/private/session/content'); };
  response = await route.fetch(new Request('http://localhost/api/dsh-token-statistics'));
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('/private'));
  await cleanup();
  assert.equal(projectionDisposed, 1); assert.equal(routeDisposed, 1);
});

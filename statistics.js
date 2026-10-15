import { z } from 'zod';

export const PROJECTION_KEY = 'dshTokenStatistics';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalCount = count.nullable();
// One durable settlement, not one surface node: replacements retain real calls.
// [timestamp, provider, model, inclusiveInput, output, cacheRead, cacheWrite, reasoning, isAttempt]
const recordSchema = z.tuple([
  z.number().finite(), z.string(), z.string(), optionalCount, optionalCount,
  optionalCount, optionalCount, optionalCount, z.union([z.literal(0), z.literal(1)]), z.union([z.literal(0), z.literal(1)]),
]);
export const stateSchema = z.object({
  inherited: count,
  subagent: z.boolean(),
  provider: z.string(),
  model: z.string(),
  records: z.array(recordSchema),
  invalidTimes: count,
}).strict();

const isCount = value => Number.isSafeInteger(value) && value >= 0;
const name = value => typeof value === 'string' && value.length > 0 ? value : 'unknown';

/** Runtime TokenUsage.inputTokens is UNCACHED input; API input is inclusive. */
export function normalizeUsage(usage) {
  if (!usage || !isCount(usage.inputTokens) || !isCount(usage.outputTokens)) return null;
  const { inputTokens: rawInput, outputTokens: output, totalTokens: total } = usage;
  const values = ['cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'].map(key => usage[key]);
  if (values.some(value => value !== undefined && !isCount(value))) return null;
  const [read, write, reasoning] = values;
  if (reasoning !== undefined && reasoning > output) return null;
  const knownInput = rawInput + (read ?? 0) + (write ?? 0);
  if (!isCount(knownInput)) return null;
  let input = knownInput;
  if (total !== undefined) {
    if (!isCount(total)) return null;
    input = total - output;
    if (!isCount(input) || input < knownInput) return null;
    if (read !== undefined && write !== undefined && input !== knownInput) return null;
  }
  // When an exact total or cache buckets are absent, keep only reported counters;
  // the settlement carries a lower-bound flag so missing traffic is never hidden.
  if (!isCount(input + output)) return null;
  return [input, output, read ?? null, write ?? null, reasoning ?? null];
}

function finalStreamUsage(stream) {
  if (!Array.isArray(stream)) return undefined;
  for (let i = stream.length - 1; i >= 0; i--) {
    const record = stream[i];
    if (record?.type === 'chunk' && record.chunk?.type === 'usage') return record.chunk.usage;
  }
  return undefined;
}

export function initState(header, inheritedEventCount = 0) {
  return {
    inherited: inheritedEventCount, subagent: header.origin === 'subagent',
    provider: 'unknown', model: 'unknown', records: [], invalidTimes: 0,
  };
}

export function applyEvent(state, event) {
  if (event.seq < state.inherited) return state;
  if (event.type === 'request/header' || event.type === 'request/context') {
    const route = event.type === 'request/header' ? event.data.header?.config : event.data;
    const provider = name(route?.provider);
    const model = name(route?.model);
    return provider === state.provider && model === state.model ? state : { ...state, provider, model };
  }
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return state;
  // Each attempt settles as either a message OR an attempt, never both. Usage
  // chunks in a settlement are cumulative: take the last, do not sum the stream.
  const attempt = event.type === 'assistant/attempt';
  const data = event.data;
  const source = attempt ? null : data.message?.source;
  const provider = source?.provider ? name(source.provider) : state.provider;
  const model = source?.model ? name(source.model) : state.model;
  const sample = !attempt && data.usage !== undefined ? data.usage : finalStreamUsage(data.stream);
  const usage = normalizeUsage(sample);
  const validTime = Number.isFinite(event.time) && Math.abs(event.time) <= 8.64e15;
  // Do not invent a date if a corrupt record has an invalid timestamp. Keep its
  // coverage counts, but exclude it from days and report the omission.
  const time = validTime ? event.time : -8.64e15;
  const minimum = usage && sample.totalTokens === undefined && (sample.cacheReadTokens === undefined || sample.cacheWriteTokens === undefined);
  const record = [time, provider, model, ...(usage ?? [null, null, null, null, null]), attempt ? 1 : 0, minimum ? 1 : 0];
  return { ...state, records: [...state.records, record], invalidTimes: state.invalidTimes + (validTime ? 0 : 1) };
}

export const projectionDefinition = {
  key: PROJECTION_KEY, stateVersion: 2, stateSchema, init: initState, apply: applyEvent,
};

export function validateTimeZone(value = 'UTC') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100 || /^[+-]/.test(value)) {
    throw new RangeError('timeZone must be a valid IANA time zone');
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new RangeError('timeZone must be a valid IANA time zone');
  }
}

export function aggregateStates(states, timeZone, sessions, failedSessions) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'iso8601', numberingSystem: 'latn',
  });
  const models = new Map();
  const days = new Map();
  let missingUsage = 0;
  let attemptsWithoutUsage = 0;
  let partialBreakdown = 0;
  let invalidTimes = 0;
  let reportedMinimum = 0;
  for (const state of states) {
    invalidTimes += state.invalidTimes;
    for (const [time, provider, model, input, output, read, write, reasoning, attempt, minimum] of state.records) {
      const unknown = input === null;
      if (minimum) reportedMinimum++;
      if (unknown) {
        if (attempt) attemptsWithoutUsage++;
        else missingUsage++;
      } else if (read === null || write === null || reasoning === null) partialBreakdown++;
      const key = JSON.stringify([provider, model]);
      const identity = { key, provider, model };
      models.set(key, identity);
      if (time === -8.64e15) continue;
      const parts = Object.fromEntries(formatter.formatToParts(time).map(part => [part.type, part.value]));
      const date = `${parts.year}-${parts.month}-${parts.day}`;
      let day = days.get(date);
      if (!day) days.set(date, day = new Map());
      let row = day.get(key);
      if (!row) {
        row = { ...identity, input: 0, output: 0, total: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, requests: 0, missingUsage: 0, subagentRequests: 0, cacheReadReported: 0, cacheWriteReported: 0, reasoningReported: 0 };
        day.set(key, row);
      }
      row.requests++;
      if (state.subagent) row.subagentRequests++;
      if (unknown) {
        // Only assistant/message counts belong to missingUsage. Failed attempts
        // lacking samples are disclosed separately, never claimed as accounted.
        if (!attempt) row.missingUsage++;
      } else {
        row.input += input;
        row.output += output;
        row.total += input + output;
        row.cacheRead += read ?? 0;
        row.cacheWrite += write ?? 0;
        row.reasoning += reasoning ?? 0;
        if (read !== null) row.cacheReadReported++;
        if (write !== null) row.cacheWriteReported++;
        if (reasoning !== null) row.reasoningReported++;
      }
    }
  }
  const warnings = [];
  if (failedSessions) warnings.push(`${failedSessions} session(s) could not be read; their usage is excluded.`);
  if (missingUsage) warnings.push(`${missingUsage} assistant message(s) have absent or invalid usage; token totals exclude them.`);
  if (attemptsWithoutUsage) warnings.push(`${attemptsWithoutUsage} assistant attempt(s) have absent or invalid usage; failed/retried calls without usage are not included in token totals.`);
  if (partialBreakdown) warnings.push(`${partialBreakdown} call(s) lack some optional cache/reasoning fields; these breakdowns sum reported values only and may be incomplete.`);
  if (reportedMinimum) warnings.push(`${reportedMinimum} legacy call(s) lack an exact inclusive total; totals include their reported counters only and are lower bounds.`);
  if (invalidTimes) warnings.push(`${invalidTimes} call(s) have invalid timestamps and are excluded from daily totals.`);
  const byKey = (a, b) => a.key.localeCompare(b.key);
  return {
    generatedAt: new Date().toISOString(), timeZone,
    coverage: { sessions, failedSessions, missingUsage, attemptsWithoutUsage, partialBreakdown, reportedMinimum },
    models: [...models.values()].sort(byKey),
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, models: [...rows.values()].sort(byKey) })),
    warnings,
  };
}

/** Read-only historical collector; one plugin-wide gate bounds simultaneous I/O. */
export function createCollector({ sessionPersistence, sessions, sessionProjections }, lifetimeSignal) {
  const cache = new Map();
  const inFlight = new Map();
  const waiters = [];
  let active = 0;
  async function acquire(signal) {
    signal.throwIfAborted();
    if (active < 4) { active++; return; }
    await new Promise((resolve, reject) => {
      const waiter = { resolve: () => { signal.removeEventListener('abort', abort); resolve(); } };
      const abort = () => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(signal.reason);
      };
      waiters.push(waiter);
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  function release() {
    const next = waiters.shift();
    if (next) next.resolve();
    else active--;
  }
  async function readCold(snapshot, signal) {
    await acquire(signal);
    let handle;
    try {
      signal.throwIfAborted();
      handle = await sessionPersistence.open(snapshot.header.id, 'read', { signal });
      let state = initState(handle.header, handle.inheritedEventCount);
      // JSONL storage reparses the whole file per read: one read is essential.
      // Never retain the content-bearing array in the cache.
      const { events } = await handle.read(handle.inheritedEventCount, undefined, { signal });
      const end = snapshot.eventCount;
      if (end !== undefined && events.length < Math.max(0, end - handle.inheritedEventCount)) {
        throw new Error('Session log ended before its listed snapshot');
      }
      for (const event of events) {
        signal.throwIfAborted();
        if (end !== undefined && event.seq >= end) break;
        state = applyEvent(state, event);
      }
      signal.throwIfAborted();
      await handle.close();
      handle = undefined;
      return state;
    } finally {
      try { if (handle) await handle.close(); }
      finally { release(); }
    }
  }
  async function cold(snapshot, signal) {
    const id = snapshot.header.id;
    const hit = cache.get(id);
    if (hit?.revision === snapshot.revision) {
      if (hit.failed) throw new Error('Session is inaccessible at this revision');
      return hit.state;
    }
    let pending = inFlight.get(id);
    if (pending?.revision !== snapshot.revision) {
      const promise = readCold(snapshot, signal).then(state => {
        cache.set(id, { revision: snapshot.revision, state });
        return state;
      }, error => {
        // Cancellation is transient, not an inaccessible historical revision.
        if (!signal.aborted) cache.set(id, { revision: snapshot.revision, failed: true });
        throw error;
      });
      pending = { revision: snapshot.revision, promise };
      inFlight.set(id, pending);
      promise.then(() => {
        if (inFlight.get(id) === pending) inFlight.delete(id);
      }, () => {
        if (inFlight.get(id) === pending) inFlight.delete(id);
      });
    }
    try {
      const state = await pending.promise;
      signal.throwIfAborted();
      return state;
    } catch (error) {
      signal.throwIfAborted();
      // The request owning a shared read may cancel while this request remains
      // valid. Retry under this request's signal rather than caching that abort.
      if (!cache.get(id)?.failed && !inFlight.has(id)) return cold(snapshot, signal);
      throw error;
    }
  }
  return {
    async collect(timeZone = 'UTC', requestSignal) {
      timeZone = validateTimeZone(timeZone);
      const signals = [lifetimeSignal, requestSignal].filter(Boolean);
      const signal = signals.length ? AbortSignal.any(signals) : new AbortController().signal;
      signal.throwIfAborted();
      // A failed directory listing is a failed request, never a misleading empty report.
      const snapshots = await sessionPersistence.list({ signal });
      signal.throwIfAborted();
      const live = sessions.list();
      const entries = new Map(snapshots.map(snapshot => [snapshot.header.id, snapshot]));
      for (const session of live) if (!entries.has(session.id)) entries.set(session.id, null);
      for (const id of cache.keys()) if (!entries.has(id)) cache.delete(id);
      const jobs = [...entries];
      const states = [];
      let cursor = 0;
      let failedSessions = 0;
      async function worker() {
        while (cursor < jobs.length) {
          signal.throwIfAborted();
          const [id, snapshot] = jobs[cursor++];
          try {
            const session = sessions.get(id);
            let state;
            if (session) {
              state = sessionProjections.stateOf(session, PROJECTION_KEY);
              if (!state) throw new Error('Token statistics projection is unavailable');
            } else {
              if (!snapshot) throw new Error('Live session was disposed before collection');
              state = await cold(snapshot, signal);
            }
            states.push(state);
          } catch (error) {
            signal.throwIfAborted();
            failedSessions++;
          }
        }
      }
      // Drain every worker even on cancellation so all read handles close before
      // the API task (and therefore plugin unload) is considered settled.
      const results = await Promise.allSettled(Array.from({ length: Math.min(4, jobs.length) }, worker));
      signal.throwIfAborted();
      const rejected = results.find(result => result.status === 'rejected');
      if (rejected) throw rejected.reason;
      return aggregateStates(states, timeZone, entries.size, failedSessions);
    },
    clear() { cache.clear(); },
  };
}

import { createCollector, projectionDefinition } from './statistics.js';
import { createHistoricalReader } from './history-reader.js';
import { isAbsolute } from 'node:path';

export const name = 'dsh-token-statistics';
export const inject = ['connection', 'sessionPersistence', 'sessions', 'sessionProjections'];

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function apply(ctx) {
  ctx.effect(() => {
    const lifetime = new AbortController();
    const pending = new Set();
    const storage = ctx.sessionPersistence;
    // Concrete JSONL Config is public in its shipped declaration. Other storage
    // implementations retain the abstract handle-based service path.
    const root = storage.name === 'session-persistence-jsonl' ? storage.config?.root : undefined;
    const history = typeof root === 'string' && isAbsolute(root) ? createHistoricalReader(root) : storage;
    const collector = createCollector({
      sessionPersistence: history,
      sessions: ctx.sessions,
      sessionProjections: ctx.sessionProjections,
    }, lifetime.signal);
    const unregisterProjection = ctx.sessionProjections.register(projectionDefinition);
    let unregisterRoute;
    try {
      // Connection applies authentication and Host/Origin admission itself.
      unregisterRoute = ctx.connection.fetch.register({
        path: '/api/dsh-token-statistics',
        methods: ['GET'],
        requestBody: 'buffered',
        async fetch(request) {
          const task = (async () => {
            try {
              const timeZone = new URL(request.url).searchParams.get('timeZone') ?? 'UTC';
              return json(await collector.collect(timeZone, request.signal));
            } catch (error) {
              if (error instanceof RangeError) return json({ error: 'timeZone must be a valid IANA time zone' }, 400);
              if (lifetime.signal.aborted || request.signal.aborted) return json({ error: 'Statistics request cancelled' }, 503);
              // Do not expose exception text, paths, session identifiers, or logs.
              return json({ error: 'Unable to list session history. Please retry.' }, 503);
            }
          })();
          pending.add(task);
          try { return await task; }
          finally { pending.delete(task); }
        },
      });
    } catch (error) {
      lifetime.abort();
      unregisterProjection();
      collector.clear();
      throw error;
    }
    return async () => {
      lifetime.abort(new Error('Token statistics plugin unloaded'));
      try {
        await unregisterRoute();
      } finally {
        await Promise.allSettled([...pending]);
        collector.clear();
        unregisterProjection();
      }
    };
  });
}

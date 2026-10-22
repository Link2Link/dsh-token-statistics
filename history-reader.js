import { open, readdir, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { zstdDecompress } from 'node:zlib';
import { promisify } from 'node:util';

/** Highest physical generation this reader decodes itself; newer ones go to the official service. */
export const MAX_GENERATION = 4;

const isCodec = value => !!value && typeof value === 'object' && typeof value.createDecoder === 'function';

/**
 * Load the released physical codecs at runtime instead of a static import.
 * A static import that misses an export fails at link time and takes the whole
 * plugin down; a dynamic import lets the plugin fall back to the official
 * sessionPersistence service when a future runtime moves or renames them.
 * @param importer - module loader, injectable for tests.
 * @returns `{ codecs }` on success, or `{ error }` describing why they are unusable.
 */
export async function loadSessionCodecs(importer = specifier => import(specifier)) {
  try {
    const [v0ToV1, v1ToV2] = await Promise.all([
      importer('@deepseek-ai/dsh-session-format-v0-to-v1'),
      importer('@deepseek-ai/dsh-session-format-v1-to-v2'),
    ]);
    const codecs = {
      v0: v0ToV1?.releasedV0SessionFormatCodec,
      v1: v0ToV1?.releasedV1SessionFormatCodec,
      v2: v1ToV2?.releasedV2SessionFormatCodec,
    };
    const missing = Object.keys(codecs).filter(key => !isCodec(codecs[key]));
    if (missing.length) return { error: new Error(`Released session codecs unavailable: ${missing.join(', ')}`) };
    return { codecs: Object.freeze(codecs) };
  } catch (error) {
    return { error };
  }
}

const loaded = await loadSessionCodecs();
/** Codecs resolved at module load, or undefined when this runtime cannot provide them. */
export const sessionCodecs = loaded.codecs;
/** Why {@link sessionCodecs} is undefined; undefined when the codecs loaded. */
export const sessionCodecsError = loaded.error;

const decompress = promisify(zstdDecompress);
const MAX_FRAME = 128 * 1024 * 1024;
const MAX_LINE = 64 * 1024 * 1024;
const MAX_DECODED = 2 * 1024 * 1024 * 1024;
const check = signal => signal?.throwIfAborted();
const routeName = value => typeof value === 'string' ? value : undefined;
const fingerprint = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;

// Minimal frame scanner from the released JSONL backend (zstd.js). Never use
// the Node streaming decoder here: it stops after the first concatenated frame.
function scanZstdFrames(buffer, maxFrames = Infinity) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    const torn = () => ({ frames, tornStart: start });
    if (buffer.length - offset < 4) return torn();
    if (buffer.readUInt32LE(offset) !== 4247762216) throw new Error('Invalid Zstandard frame magic');
    offset += 4;
    if (offset === buffer.length) return torn();
    const descriptor = buffer[offset++];
    if (descriptor & 24) throw new Error('Reserved Zstandard frame-header bit');
    const sizeFlag = descriptor >>> 6;
    const single = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dict = descriptor & 3;
    const headerBytes = (single ? 0 : 1) + (dict === 3 ? 4 : dict) + (sizeFlag === 0 ? (single ? 1 : 0) : 1 << sizeFlag);
    if (buffer.length - offset < headerBytes) return torn();
    offset += headerBytes;
    for (;;) {
      if (buffer.length - offset < 3) return torn();
      const block = buffer.readUIntLE(offset, 3);
      offset += 3;
      const type = (block >>> 1) & 3;
      if (type === 3) throw new Error('Reserved Zstandard block type');
      const size = type === 1 ? 1 : block >>> 3;
      if (buffer.length - offset < size) return torn();
      offset += size;
      if (block & 1) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return torn();
      offset += 4;
    }
    frames.push({ start, end: offset });
    if (frames.length === maxFrames) return { frames };
  }
  return { frames };
}

async function* plaintext(file, compressed, signal) {
  let pending = Buffer.alloc(0);
  let total = 0;
  for await (const chunk of file.createReadStream({ autoClose: false, highWaterMark: 64 * 1024 })) {
    check(signal);
    if (!compressed) {
      total += chunk.length;
      if (total > MAX_DECODED) throw new Error('Session exceeds decoded size limit');
      yield chunk;
      continue;
    }
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    for (;;) {
      const { frames } = scanZstdFrames(pending, 1);
      if (!frames.length) break;
      const { end } = frames[0];
      if (end > MAX_FRAME) throw new Error('Session frame exceeds size limit');
      const decoded = await decompress(pending.subarray(0, end), { maxOutputLength: MAX_FRAME });
      check(signal);
      total += decoded.length;
      if (total > MAX_DECODED) throw new Error('Session exceeds decoded size limit');
      pending = pending.subarray(end);
      yield decoded;
      if (!pending.length) break;
    }
    if (pending.length > MAX_FRAME) throw new Error('Session frame exceeds size limit');
  }
  if (pending.length) throw new Error('Torn Zstandard tail; usage excluded (history is not repaired)');
}

async function* rows(file, compressed, signal) {
  let pending = Buffer.alloc(0);
  for await (const chunk of plaintext(file, compressed, signal)) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    let start = 0;
    for (;;) {
      const end = pending.indexOf(10, start);
      if (end < 0) break;
      if (end - start > MAX_LINE) throw new Error('Session row exceeds size limit');
      check(signal);
      const line = pending.subarray(start, end).toString('utf8');
      if (!line.trim()) throw new Error('Empty session row');
      yield JSON.parse(line);
      start = end + 1;
    }
    pending = pending.subarray(start);
    if (pending.length > MAX_LINE) throw new Error('Session row exceeds size limit');
  }
  if (pending.length) throw new Error('Torn JSONL tail; usage excluded (history is not repaired)');
}

function codecFor(codecs, header, generation) {
  if (header?.version !== generation) throw new Error('Session generation and header disagree');
  if (generation === 0) return codecs.v0.createDecoder(header, 'strict');
  if (generation === 1) return codecs.v1.createDecoder(header, 'strict');
  // V3 and V4 retain V2 physical envelopes. Their additional migrations only
  // validate/rewrite unrelated payload vocabulary, not usage or sequence numbers.
  if (generation >= 2 && generation <= MAX_GENERATION) return codecs.v2.createDecoder({ ...header, version: 2 }, 'strict');
  throw new Error(`Unsupported session generation ${generation}`);
}

/** Session id from its storage directory name (the JSONL backend's `~XXXX` segment encoding). */
const decodeSessionDir = name => name.replace(/~([0-9A-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

function minimalUsage(value, legacy) {
  if (!value || typeof value !== 'object') return undefined;
  const result = {};
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']) {
    // Invalid counters remain invalid for the collector, but can never carry
    // arbitrary objects or content out of the physical decoder.
    if (Object.hasOwn(value, key)) result[key] = typeof value[key] === 'number' ? value[key] : null;
  }
  if (legacy) result.legacyReported = true;
  return result;
}
function usageStream(usage) {
  return usage === undefined ? [] : [{ type: 'chunk', chunk: { type: 'usage', usage } }];
}

function extractor(legacy) {
  const events = [];
  const attempts = [];
  let pending;
  let cut = 0;
  function flush() {
    if (!pending) return;
    events.push({ type: 'assistant/attempt', seq: pending.lastSeq, time: pending.lastTime, data: { stream: usageStream(pending.usage) } });
    attempts.push([pending.firstSeq, pending.lastSeq]);
    pending = undefined;
  }
  function observeChunk(turn, step, firstSeq, lastSeq, lastTime, chunk) {
    if (pending && (pending.terminal || pending.turn !== turn || pending.step !== step)) flush();
    pending ??= { turn, step, firstSeq };
    pending.lastSeq = lastSeq;
    pending.lastTime = lastTime;
    if (chunk?.type === 'usage') pending.usage = minimalUsage(chunk.usage, true);
    if (chunk?.type === 'finish') pending.terminal = true;
  }
  return {
    events,
    emitRun(run) {
      if (!legacy || run.runType !== 'released-assistant-chunks') throw new Error('Unexpected packed session run');
      observeChunk(run.turn, run.step, run.firstSeq, run.lastSeq, run.lastTime);
    },
    emitEvent(event) {
      const data = event.data ?? {};
      if (event.type === 'session/end-seed' && data.inherited === true) cut = event.seq;
      if (legacy && event.type === 'assistant/chunk') {
        observeChunk(data.turn, data.step, event.seq, event.seq, event.time, data.chunk);
        return;
      }
      if (legacy && ['turn/end', 'step/end', 'llm/retry', 'llm/retry-started'].includes(event.type)) flush();
      if (event.type === 'request/context' || event.type === 'request/header') {
        const route = event.type === 'request/header' ? data.header?.config : data;
        const clean = { provider: routeName(route?.provider), model: routeName(route?.model) };
        events.push({ type: event.type, seq: event.seq, time: event.time, data: event.type === 'request/header' ? { header: { config: clean } } : clean });
      }
      if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return;
      let paired;
      if (legacy && pending) {
        if (pending.turn === data.turn && pending.step === data.step) {
          paired = pending;
          attempts.push([pending.firstSeq, event.seq]);
          pending = undefined;
        }
        else flush();
      }
      const source = data.message?.source;
      let usage = minimalUsage(data.usage, legacy);
      if (usage === undefined) {
        for (const record of data.stream ?? []) if (record?.type === 'chunk' && record.chunk?.type === 'usage') usage = minimalUsage(record.chunk.usage, legacy);
        usage ??= paired?.usage;
      }
      events.push({ type: event.type, seq: event.seq, time: event.time, data: {
        ...(event.type === 'assistant/message' ? { message: { source: { provider: source?.provider, model: source?.model } }, ...(usage === undefined ? {} : { usage }) } : {}),
        stream: usageStream(usage),
      } });
    },
    finish(inherited) {
      flush();
      if (legacy) {
        // A source cut must never bisect one attempt. Original seqs are retained.
        for (const event of events) if (!Number.isSafeInteger(event.seq)) throw new Error('Invalid session sequence');
        for (const [first, last] of attempts) if ((first < inherited) !== (last < inherited)) throw new Error('Inherited cut splits an assistant attempt');
      } else if (inherited !== cut) throw new Error('Inherited session marker mismatch');
      events.sort((a, b) => a.seq - b.seq);
    },
  };
}

/**
 * READ-ONLY physical history adapter. It never migrates, repairs or writes logs.
 * @param root - absolute JSONL session root.
 * @param options.codecs - released physical codecs (defaults to the ones loaded at module load).
 * @param options.fallback - official sessionPersistence service; sessions written in a
 *   generation newer than {@link MAX_GENERATION} are listed by directory id and opened
 *   through it instead of failing. Its `read` access never publishes migrations.
 */
export function createHistoricalReader(root, { codecs = sessionCodecs, fallback } = {}) {
  if (typeof root !== 'string' || !root) throw new TypeError('Explicit session JSONL root is required');
  if (!codecs) throw new TypeError('Released session codecs are required for the physical history reader');
  root = resolve(root);
  const headers = new Map();
  let selected = new Map();
  async function safeOpen(entry, signal) {
    check(signal);
    // Reject symlinks at every storage-layout component, not just the leaf.
    for (const path of [root, dirname(dirname(entry.path)), dirname(entry.path)]) {
      const stat = await lstat(path);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Symlink/non-directory history path refused');
    }
    const file = await open(entry.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat({ bigint: true });
      if (!stat.isFile() || fingerprint(stat) !== entry.revision) throw new Error('Session changed since listing');
      check(signal);
      return file;
    } catch (error) { await file.close(); throw error; }
  }
  return {
    async list({ signal } = {}) {
      check(signal);
      let projects;
      try {
        const stat = await lstat(root);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('History root must be a real directory');
        projects = await readdir(root, { withFileTypes: true });
      } catch (error) { if (error.code === 'ENOENT') { selected = new Map(); return []; } throw error; }
      const next = new Map();
      const snapshots = [];
      const paths = new Set();
      for (const project of projects.filter(entry => entry.isDirectory())) {
        check(signal);
        const projectPath = join(root, project.name);
        for (const session of (await readdir(projectPath, { withFileTypes: true })).filter(entry => entry.isDirectory())) {
          check(signal);
          const dir = join(projectPath, session.name);
          const candidates = (await readdir(dir, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => {
            const match = /^(?:session|session\.v([1-9][0-9]*))\.jsonl(\.zstd)?$/.exec(entry.name);
            return match ? { path: join(dir, entry.name), generation: Number(match[1] ?? 0), compressed: !!match[2] } : null;
          }).filter(Boolean).sort((a, b) => b.generation - a.generation || Number(b.compressed) - Number(a.compressed));
          const entry = candidates[0];
          if (!entry) continue;
          if (candidates[1]?.generation === entry.generation) throw new Error('Ambiguous session encoding at highest generation');
          const stat = await lstat(entry.path, { bigint: true });
          if (!stat.isFile() || stat.isSymbolicLink()) continue;
          entry.revision = fingerprint(stat);
          paths.add(entry.path);
          let header = headers.get(entry.path);
          if (entry.generation > MAX_GENERATION && fallback) {
            // Written by a newer runtime than this reader knows: do not guess at its
            // physical envelope. The official service owns that format.
            header = { revision: entry.revision, header: { id: decodeSessionDir(session.name) }, delegated: true };
            headers.set(entry.path, header);
          } else if (header?.revision !== entry.revision) {
            let file;
            try {
              file = await safeOpen(entry, signal);
              for await (const row of rows(file, entry.compressed, signal)) {
                header = { revision: entry.revision, header: { ...codecFor(codecs, row, entry.generation).header, version: entry.generation } };
                break;
              }
              if (!header || header.revision !== entry.revision) throw new Error('Missing session header');
              headers.set(entry.path, header);
            } catch (error) {
              check(signal);
              // Keep corrupt files visible as failed sessions rather than silently
              // shrinking coverage. The directory is the encoded session id.
              header = { revision: entry.revision, header: { id: decodeSessionDir(session.name) }, error };
              headers.set(entry.path, header);
            } finally { if (file) await file.close(); }
          }
          const id = header.header.id;
          if (next.has(id)) throw new Error(`Duplicate historical session id ${id}`);
          next.set(id, { ...entry, header: header.header, error: header.error, delegated: header.delegated });
          snapshots.push({ header: header.header, revision: entry.revision, sizeBytes: Number(stat.size) });
        }
      }
      check(signal);
      selected = next;
      for (const path of headers.keys()) if (!paths.has(path)) headers.delete(path);
      return snapshots;
    },
    async open(id, access, { signal } = {}) {
      if (access !== 'read') throw new Error('Historical reader is read-only');
      check(signal);
      const entry = selected.get(id);
      if (!entry) throw new Error('Historical session not listed');
      if (entry.error) throw entry.error;
      if (entry.delegated) return fallback.open(id, 'read', { signal });
      const file = await safeOpen(entry, signal);
      let decoder;
      const extract = extractor(entry.generation < 2);
      let inherited;
      try {
        for await (const row of rows(file, entry.compressed, signal)) {
          if (!decoder) decoder = codecFor(codecs, row, entry.generation);
          else decoder.decodeRow(row, extract);
        }
        if (!decoder) throw new Error('Missing session header');
        inherited = decoder.finish(extract);
        extract.finish(inherited);
        check(signal);
        if (fingerprint(await file.stat({ bigint: true })) !== entry.revision) throw new Error('Session changed during read');
      } finally { await file.close(); }
      let closed = false;
      let events = extract.events;
      return {
        header: entry.header, inheritedEventCount: inherited,
        async read(offset = 0, length, options = {}) {
          check(options.signal);
          if (closed) throw new Error('Historical handle is closed');
          if (!Number.isSafeInteger(offset) || offset < 0 || (length !== undefined && (!Number.isSafeInteger(length) || length < 0))) throw new RangeError('Invalid history read range');
          return { events: events.filter(event => event.seq >= offset && (length === undefined || event.seq < offset + length)) };
        },
        async close() { closed = true; events = []; },
      };
    },
  };
}

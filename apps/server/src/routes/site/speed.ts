import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { collectSource, vodPlay } from '@lcm/db';
import { parsePlayUrl } from '@lcm/shared';

/** 测速只取前 256KB，避免真把整条分片拖下来 */
const SAMPLE_BYTES = 256 * 1024;
/** 单条线路的超时 */
const TIMEOUT_MS = 5000;
/** 同一线路同一集的结果缓存 60 秒，避免连点反复打源站 */
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 500;

export interface SpeedResult {
  ok: boolean;
  ms: number;
  reason?: 'iframe' | 'timeout' | 'error';
}

const cache = new Map<string, { at: number; result: SpeedResult }>();

export interface SpeedRouteOpts {
  db: Db;
}

function isPrivateHost(host: string): boolean {
  const name = host.toLowerCase();
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10 || a === 127 || (a === 169 && b === 254)) return true;
  if (a === 192 && b === 168) return true;
  return a === 172 && b >= 16 && b <= 31;
}

/** 取该线路第 ep 集的地址，越界退到最后一集 */
function pickEpisode(playUrl: string, ep: number): string {
  const episodes = parsePlayUrl(playUrl);
  if (!episodes.length) return '';
  const index = Math.max(0, Math.min(episodes.length - 1, ep - 1));
  return episodes[index]?.url ?? '';
}

/** 读够 bytes 就断开，别把整个文件拖下来 */
async function readAtMost(res: Response, bytes: number): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  let got = 0;
  try {
    while (got < bytes) {
      const { done, value } = await reader.read();
      if (done) return;
      got += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** 从 m3u8 里取第一条分片地址；不是 m3u8 返回空串 */
function firstSegment(text: string, base: string): string {
  if (!text.includes('#EXTM3U')) return '';
  for (const line of text.split('\n')) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    try {
      return new URL(value, base).href;
    } catch {
      return '';
    }
  }
  return '';
}

async function measure(url: string): Promise<SpeedResult> {
  const start = performance.now();
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(url, { signal, redirect: 'follow' });
    if (!res.ok) return { ok: false, ms: Math.round(performance.now() - start), reason: 'error' };

    const type = res.headers.get('content-type') ?? '';
    if (/mpegurl/i.test(type) || /\.m3u8(\?|$)/i.test(url)) {
      // 主列表很小，取到后接着测第一条分片，才算真实加载耗时
      const segment = firstSegment(await res.text(), url);
      if (!segment) return { ok: true, ms: Math.round(performance.now() - start) };
      const part = await fetch(segment, { signal, headers: { Range: `bytes=0-${SAMPLE_BYTES - 1}` } });
      await readAtMost(part, SAMPLE_BYTES);
    } else {
      await readAtMost(res, SAMPLE_BYTES);
    }
    return { ok: true, ms: Math.round(performance.now() - start) };
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { ok: false, ms, reason: timeout ? 'timeout' : 'error' };
  }
}

export const speedRoutes: FastifyPluginAsync<SpeedRouteOpts> = async (app, opts) => {
  const { db } = opts;

  app.get('/api/play/speed/:vodId/:lineId', async (req, reply) => {
    const params = req.params as { vodId: string; lineId: string };
    const vodId = Number(params.vodId);
    const lineId = Number(params.lineId);
    const ep = Math.max(1, Number((req.query as { ep?: string }).ep) || 1);
    reply.header('cache-control', 'no-store');

    if (!Number.isInteger(vodId) || !Number.isInteger(lineId) || vodId <= 0 || lineId <= 0) {
      return reply.code(400).send({ ok: false, ms: 0, reason: 'error' });
    }

    const key = `${vodId}:${lineId}:${ep}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return reply.send(hit.result);

    const [row] = await db
      .select({
        playUrl: vodPlay.playUrl,
        parseUrl: collectSource.parseUrl,
      })
      .from(vodPlay)
      .leftJoin(collectSource, eq(collectSource.id, vodPlay.sourceId))
      .where(and(eq(vodPlay.id, lineId), eq(vodPlay.vodId, vodId)))
      .limit(1);
    if (!row) return reply.code(404).send({ ok: false, ms: 0, reason: 'error' });

    let result: SpeedResult;
    if (row.parseUrl) {
      // 网页解析线路没有直连地址，无从测速
      result = { ok: false, ms: 0, reason: 'iframe' };
    } else {
      const raw = pickEpisode(row.playUrl, ep);
      let parsed: URL | null = null;
      try {
        parsed = raw ? new URL(raw) : null;
      } catch {
        parsed = null;
      }
      if (!parsed || !/^https?:$/.test(parsed.protocol) || isPrivateHost(parsed.hostname)) {
        result = { ok: false, ms: 0, reason: 'error' };
      } else {
        result = await measure(parsed.href);
      }
    }

    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, { at: Date.now(), result });
    return reply.send(result);
  });
};

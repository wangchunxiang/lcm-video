import { createDb } from './packages/db/src/client.ts';
import { CollectClient } from './apps/server/src/lib/collect/client.ts';
import { parseVodPage } from './apps/server/src/lib/collect/parser.ts';

const { pool } = createDb({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4 });

const [rows] = await pool.query('SELECT vod_id, source_vod_id FROM lcm_vod_play WHERE source_id = 1 AND source_vod_id <> \'\'');
const bySourceId = new Map();
for (const r of rows) if (!bySourceId.has(String(r.source_vod_id))) bySourceId.set(String(r.source_vod_id), r.vod_id);
const ids = [...bySourceId.keys()];
console.log('待回填', ids.length);

const client = new CollectClient({
  id: 1, name: 'x', apiUrl: 'https://caiji.xgzyapi.com/api.php/provide/vod/from/xiguam3u8/at/json/',
  apiFormat: 'json', apiParams: '', intervalSec: 0, timeout: 30, retryTimes: 2,
});

let done = 0, changed = 0, failedChunks = 0;
for (let i = 0; i < ids.length; i += 50) {
  const chunk = ids.slice(i, i + 50);
  try {
    const data = await client.request({ ac: 'detail', ids: chunk.join(','), at: 'json' });
    const page = parseVodPage(data, 'json');
    for (const item of page.list) {
      const vodId = bySourceId.get(String(item.vodId));
      if (!vodId) continue;
      const [res] = await pool.query(
        'UPDATE lcm_vod SET release_date = ?, year = ? WHERE id = ? AND (release_date <> ? OR year <> ?)',
        [item.releaseDate, item.year || 0, vodId, item.releaseDate, item.year || 0],
      );
      if (res.affectedRows > 0) changed++;
    }
  } catch (error) {
    failedChunks++;
    console.log('chunk failed', i, error instanceof Error ? error.message : error);
  }
  done += chunk.length;
  if (i % 1000 === 0) console.log('进度', done, '改', changed, '失败块', failedChunks);
}
console.log('完成', { done, changed, failedChunks });
await pool.end();

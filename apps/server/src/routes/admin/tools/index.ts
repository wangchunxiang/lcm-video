import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { ok } from '../../../lib/http.ts';
import { auditIntegrity, cleanOrphans } from '../../../lib/integrity.ts';
import { dataRoutes } from './data.ts';
import { mergeRoutes } from './merge.ts';

export interface ToolOpts {
  db: Db;
}

export const toolRoutes: FastifyPluginAsync<ToolOpts> = async (app, opts) => {
  const { db } = opts;

  /** 数据一致性巡检：不用外键，孤儿行靠逻辑层与这个巡检兜底 */
  app.get('/integrity', async (_req, reply) => ok(reply, await auditIntegrity(db)));

  /** 清理孤儿行（线路、映射、任务、广告特征、封面体检） */
  app.post('/integrity/clean', async (_req, reply) => ok(reply, await cleanOrphans(db)));

  await app.register(dataRoutes, { db });
  await app.register(mergeRoutes, { db });
};

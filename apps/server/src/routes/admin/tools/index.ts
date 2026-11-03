import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { dataRoutes } from './data.ts';
import { mergeRoutes } from './merge.ts';

export interface ToolOpts {
  db: Db;
}

export const toolRoutes: FastifyPluginAsync<ToolOpts> = async (app, opts) => {
  const { db } = opts;
  await app.register(dataRoutes, { db });
  await app.register(mergeRoutes, { db });
};

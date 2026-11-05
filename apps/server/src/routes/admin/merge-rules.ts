import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import {
  DEFAULT_MERGE_CONFIG,
  FIXED_FIELDS,
  MERGE_FIELDS,
  STRATEGY_LABELS,
  loadMergeConfig,
  normalizeMergeConfig,
  saveMergeConfig,
} from '../../lib/collect/merge.ts';

type Options = { db: Db };

export const mergeRuleRoutes: FastifyPluginAsync<Options> = async (app, opts) => {
  const { db } = opts;

  // 页面渲染用：字段定义 + 当前取值，前端不硬编码字段表
  app.get('/', async (_req, reply) => {
    const config = await loadMergeConfig(db);
    return ok(reply, {
      mode: config.mode,
      fields: MERGE_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        hint: field.hint,
        value: config.fields[field.key] ?? field.strategies[0],
        options: field.strategies.map((strategy) => ({
          value: strategy,
          label: STRATEGY_LABELS[strategy],
        })),
      })),
      fixed: FIXED_FIELDS,
      default_mode: DEFAULT_MERGE_CONFIG.mode,
      default_fields: DEFAULT_MERGE_CONFIG.fields,
    });
  });

  app.put('/', async (req, reply) => {
    const parsed = normalizeMergeConfig(req.body);
    if (!parsed.ok) return fail(reply, 400, ErrorCode.BAD_REQUEST, parsed.msg);
    await saveMergeConfig(db, parsed.config);
    return ok(reply, { mode: parsed.config.mode });
  });
};

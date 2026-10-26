import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { setting } from '@lcm/db';
import { SETTINGS, type SettingField } from '@lcm/shared';
import type { Env } from '../../env.ts';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { getAllSettings } from '../../lib/settings.ts';

export interface SettingRouteOpts {
  db: Db;
  env: Env;
}

function validateValue(field: SettingField, raw: unknown): { value: string } | { error: string } {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: `${field.label} 格式不正确` };
  const value = raw.trim();

  if (field.type === 'number') {
    if (value === '') return { value: '' };
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return { error: `${field.label} 必须是不小于 0 的数字` };
    return { value: String(Math.trunc(n)) };
  }

  if (field.type === 'select' && field.options) {
    if (value === '') return { value: field.default };
    if (!field.options.some((option) => option.value === value)) {
      return { error: `${field.label} 取值不合法` };
    }
    return { value };
  }

  if (field.type === 'switch') {
    return { value: value === '1' ? '1' : '0' };
  }

  return { value };
}

async function listThemes(themesDir: string): Promise<{ name: string; title: string; active: boolean }[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(themesDir);
  } catch {
    return [];
  }

  const themes: { name: string; title: string; active: boolean }[] = [];
  for (const name of entries) {
    const layoutFile = path.join(themesDir, name, 'theme.json');
    try {
      const raw = await readFile(layoutFile, 'utf8');
      const parsed = JSON.parse(raw) as { title?: string };
      themes.push({ name, title: parsed.title ?? name, active: false });
    } catch {
      continue;
    }
  }
  return themes;
}

export const settingRoutes: FastifyPluginAsync<SettingRouteOpts> = async (app, opts) => {
  const { db, env } = opts;

  app.get('/', async (_req, reply) => {
    const values = await getAllSettings(db);
    const items = SETTINGS.map((field) => ({
      ...field,
      value: values[field.key] ?? field.default,
    }));
    const themes = await listThemes(env.paths.themesDir);
    const active = values['site_theme'] ?? 'default';
    return ok(reply, {
      items,
      themes: themes.map((theme) => ({ ...theme, active: theme.name === active })),
    });
  });

  app.put('/', async (req, reply) => {
    const body = (req.body ?? {}) as { values?: Record<string, unknown> };
    const values = body.values;
    if (!values || typeof values !== 'object') {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少配置内容');
    }

    const rows: { name: string; value: string }[] = [];
    for (const [key, raw] of Object.entries(values)) {
      const field = SETTINGS.find((item) => item.key === key);
      if (!field) return fail(reply, 400, ErrorCode.BAD_REQUEST, `未知的配置项：${key}`);
      const result = validateValue(field, raw);
      if ('error' in result) return fail(reply, 400, ErrorCode.BAD_REQUEST, result.error);
      rows.push({ name: key, value: result.value });
    }

    if (rows.length === 0) return ok(reply, null);

    await db
      .insert(setting)
      .values(rows)
      .onDuplicateKeyUpdate({ set: { value: sql`VALUES(value)` } });

    return ok(reply, null);
  });

  app.get('/themes', async (_req, reply) => {
    const values = await getAllSettings(db);
    const active = values['site_theme'] ?? 'default';
    const themes = await listThemes(env.paths.themesDir);
    return ok(reply, { items: themes.map((theme) => ({ ...theme, active: theme.name === active })) });
  });
};

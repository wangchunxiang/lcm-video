import { eq } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { setting } from '@lcm/db';

export async function getSetting(db: Db, name: string): Promise<string | null> {
  const rows = await db
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.name, name))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function getSettingNumber(db: Db, name: string, fallback: number): Promise<number> {
  const raw = await getSetting(db, name);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export async function getAllSettings(db: Db): Promise<Record<string, string>> {
  const rows = await db.select({ name: setting.name, value: setting.value }).from(setting);
  const result: Record<string, string> = {};
  for (const row of rows) result[row.name] = row.value ?? '';
  return result;
}

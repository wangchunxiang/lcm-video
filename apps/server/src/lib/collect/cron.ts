/** 5 段式 cron：分 时 日 月 周，按服务进程本地时区（Asia/Shanghai）解释。 */

interface CronParts {
  minute: Set<number>;
  hour: Set<number>;
  day: Set<number>;
  month: Set<number>;
  week: Set<number>;
  dayRestricted: boolean;
  weekRestricted: boolean;
}

const FIELD_LIMITS: Array<[string, number, number]> = [
  ['分钟', 0, 59],
  ['小时', 0, 23],
  ['日', 1, 31],
  ['月', 1, 12],
  ['周', 0, 6],
];

function expandField(field: string, min: number, max: number): Set<number> | string {
  const result = new Set<number>();
  for (const part of field.split(',')) {
    const piece = part.trim();
    if (!piece) return '存在空的字段项';

    const [rangePart = '', stepPart] = piece.split('/');
    let step = 1;
    if (stepPart !== undefined) {
      step = Number(stepPart);
      if (!Number.isInteger(step) || step <= 0) return `步长不合法：${piece}`;
    }

    let from: number;
    let to: number;
    if (rangePart === '*') {
      from = min;
      to = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      from = Number(a);
      to = Number(b);
      if (!Number.isInteger(from) || !Number.isInteger(to)) return `范围不合法：${piece}`;
    } else {
      const value = Number(rangePart);
      if (!Number.isInteger(value)) return `数值不合法：${piece}`;
      from = value;
      to = stepPart !== undefined ? max : value;
    }

    if (from < min || to > max || from > to) return `超出范围 ${min}-${max}：${piece}`;
    for (let v = from; v <= to; v += step) result.add(v);
  }
  if (result.size === 0) return '字段为空';
  return result;
}

export function parseCron(expr: string): CronParts | string {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return 'cron 需要 5 段：分 时 日 月 周';

  const sets: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const [label, min, max] = FIELD_LIMITS[i]!;
    // 周字段允许 7 表示周日
    const field = fields[i]!;
    const expanded = expandField(field, min, max);
    if (typeof expanded === 'string') return `${label}段：${expanded}`;
    sets.push(expanded);
  }

  const week = sets[4]!;
  if (week.has(7)) {
    week.delete(7);
    week.add(0);
  }

  return {
    minute: sets[0]!,
    hour: sets[1]!,
    day: sets[2]!,
    month: sets[3]!,
    week,
    dayRestricted: fields[2] !== '*',
    weekRestricted: fields[4] !== '*',
  };
}

export function isValidCron(expr: string): string | null {
  const parsed = parseCron(expr);
  return typeof parsed === 'string' ? parsed : null;
}

export function matchCron(expr: string, date: Date): boolean {
  const parsed = parseCron(expr);
  if (typeof parsed === 'string') return false;

  if (!parsed.minute.has(date.getMinutes())) return false;
  if (!parsed.hour.has(date.getHours())) return false;
  if (!parsed.month.has(date.getMonth() + 1)) return false;

  const dayHit = parsed.day.has(date.getDate());
  const weekHit = parsed.week.has(date.getDay());

  // 日与周同时受限时，任一命中即触发（与 Vixie cron 一致）
  if (parsed.dayRestricted && parsed.weekRestricted) return dayHit || weekHit;
  if (parsed.dayRestricted) return dayHit;
  if (parsed.weekRestricted) return weekHit;
  return true;
}

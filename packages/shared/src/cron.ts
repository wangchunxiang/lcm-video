/**
 * 5 段式 cron：分 时 日 月 周。
 * 时间按调用方所在时区解释——服务端进程时区固定 Asia/Shanghai，浏览器同样是 Asia/Shanghai。
 */

import type { CronParts } from './types/cron.ts';

const FIELD_LIMITS: Array<[string, number, number]> = [
  ['分钟', 0, 59],
  ['小时', 0, 23],
  ['日', 1, 31],
  ['月', 1, 12],
  // 周允许写 0–7：cron 里 7 也是周日，下面 parseCron 会把它并到 0
  ['周', 0, 7],
];

export const WEEK_LABELS: Array<{ value: number; label: string }> = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
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
    const expanded = expandField(fields[i]!, min, max);
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

function dayMatches(parsed: CronParts, date: Date): boolean {
  if (!parsed.month.has(date.getMonth() + 1)) return false;
  const dayHit = parsed.day.has(date.getDate());
  const weekHit = parsed.week.has(date.getDay());
  // 日与周同时受限时，任一命中即触发（与 Vixie cron 一致）
  if (parsed.dayRestricted && parsed.weekRestricted) return dayHit || weekHit;
  if (parsed.dayRestricted) return dayHit;
  if (parsed.weekRestricted) return weekHit;
  return true;
}

export function matchCron(expr: string, date: Date): boolean {
  const parsed = parseCron(expr);
  if (typeof parsed === 'string') return false;
  if (!parsed.minute.has(date.getMinutes())) return false;
  if (!parsed.hour.has(date.getHours())) return false;
  return dayMatches(parsed, date);
}

/**
 * 下一次触发时间；表达式非法或 4 年内都不会触发时返回 null。
 * from 之后的第一分钟开始找，不含 from 本身所在的那一分钟。
 */
export function nextRunAt(expr: string, from: Date = new Date()): Date | null {
  const parsed = parseCron(expr);
  if (typeof parsed === 'string') return null;

  const hours = [...parsed.hour].sort((a, b) => a - b);
  const minutes = [...parsed.minute].sort((a, b) => a - b);

  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  const firstDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let offset = 0; offset <= 366 * 4; offset++) {
    const day = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + offset);
    if (!dayMatches(parsed, day)) continue;

    for (const hour of hours) {
      for (const minute of minutes) {
        const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
        if (candidate.getTime() >= start.getTime()) return candidate;
      }
    }
  }
  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 人类可读的描述，识别不了的表达式原样返回。 */
export function describeCron(expr: string): string {
  const stepMinute = /^\*\/(\d+) \* \* \* \*$/.exec(expr.trim());
  if (stepMinute) return `每 ${stepMinute[1]} 分钟`;
  const stepHour = /^0 \*\/(\d+) \* \* \*$/.exec(expr.trim());
  if (stepHour) return `每 ${stepHour[1]} 小时`;

  const parsed = parseCron(expr);
  if (typeof parsed === 'string') return expr;

  const hours = [...parsed.hour].sort((a, b) => a - b);
  const minutes = [...parsed.minute].sort((a, b) => a - b);
  const fullHour = hours.length === 24;
  const fullMinute = minutes.length === 60;

  if (fullHour && fullMinute) return '每分钟';
  if (fullHour) {
    const minuteText = minutes.length === 1 ? `第 ${minutes[0]} 分` : `第 ${minutes.join('、')} 分`;
    return `每小时${minuteText}`;
  }
  if (minutes.length !== 1 || hours.length > 1) {
    return expr;
  }

  const time = `${pad(hours[0]!)}:${pad(minutes[0]!)}`;
  if (parsed.weekRestricted && !parsed.dayRestricted) {
    const days = WEEK_LABELS.filter((item) => parsed.week.has(item.value)).map((item) => item.label);
    return `每${days.join('、')} ${time}`;
  }
  if (parsed.dayRestricted && !parsed.weekRestricted) {
    const days = [...parsed.day].sort((a, b) => a - b);
    if (parsed.month.size < 12) {
      const months = [...parsed.month].sort((a, b) => a - b);
      return `每年 ${months.join('、')} 月的 ${days.join('、')} 号 ${time}`;
    }
    return `每月 ${days.join('、')} 号 ${time}`;
  }
  return `每天 ${time}`;
}

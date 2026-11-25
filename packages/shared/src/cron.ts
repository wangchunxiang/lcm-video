/**
 * 5 段式 cron：分 时 日 月 周。
 * 校验、匹配、推算下次时间都交给 `cron` 包（服务端已通过 @nestjs/schedule 依赖它），
 * 本文件只保留「给界面看的中文描述」。
 * 时间按调用方所在时区解释——服务端进程时区固定 Asia/Shanghai，浏览器同样是 Asia/Shanghai。
 */

import { CronTime } from 'cron';

export const WEEK_LABELS: Array<{ value: number; label: string }> = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
];

const MINUTE_MS = 60_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 校验表达式：合法返回 null，否则返回一句中文提示（附带库给的英文细节，比「格式错误」好定位）。
 * 空串单独给提示，因为库对空串的报错是 `Invalid characters, got value: `。
 */
export function isValidCron(expr: string): string | null {
  const text = expr.trim();
  if (text === '') return '请填写 cron 表达式';
  const result = CronTime.validateCronExpression(text);
  if (result.valid) return null;
  return `表达式不合法（${result.error?.message ?? '无法解析'}）`;
}

/**
 * 判断某一分钟是否会触发。
 * 做法：把这一分钟的起点往前挪 1 秒当作起点，问库「下一次是什么时候」，
 * 若正好等于这一分钟起点，说明本分钟命中。日与周同时受限时按 Vixie cron 的「任一命中」处理（库内 `_wcOrAll`）。
 */
export function matchCron(expr: string, date: Date): boolean {
  const text = expr.trim();
  if (isValidCron(text) !== null) return false;
  const minuteStart = new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);
  try {
    const next = new CronTime(text).getNextDateFrom(new Date(minuteStart.getTime() - 1_000));
    return next.toMillis() === minuteStart.getTime();
  } catch {
    return false;
  }
}

/** 下一次触发时间；表达式非法或永远不会触发时返回 null。 */
export function nextRunAt(expr: string, from: Date = new Date()): Date | null {
  const text = expr.trim();
  if (isValidCron(text) !== null) return null;
  try {
    return new CronTime(text).getNextDateFrom(from).toJSDate();
  } catch {
    return null;
  }
}

/**
 * 把一段 cron 字段展开成取值集合。
 * 只用于拼描述文案（表达式已由 `cron` 包校验过），不参与任何调度判断。
 */
function expandField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();
  for (const piece of field.split(',')) {
    const [rangePart = '', stepPart] = piece.split('/');
    const step = stepPart === undefined ? 1 : Math.max(1, Number(stepPart) || 1);
    let from = min;
    let to = max;
    if (rangePart !== '*') {
      const [start = '', end] = rangePart.split('-');
      from = Number(start);
      to = end === undefined ? (stepPart === undefined ? from : max) : Number(end);
    }
    for (let value = from; value <= to; value += step) result.add(value);
  }
  return result;
}

/** 人类可读的描述，识别不了的表达式原样返回。 */
export function describeCron(expr: string): string {
  const text = expr.trim();
  if (isValidCron(text) !== null) return expr;

  const stepMinute = /^\*\/(\d+) \* \* \* \*$/.exec(text);
  if (stepMinute) return `每 ${stepMinute[1]} 分钟`;
  const stepHour = /^0 \*\/(\d+) \* \* \*$/.exec(text);
  if (stepHour) return `每 ${stepHour[1]} 小时`;

  const [minuteField = '', hourField = '', dayField = '', monthField = '', weekField = ''] = text.split(/\s+/);
  const minutes = [...expandField(minuteField, 0, 59)].sort((a, b) => a - b);
  const hours = [...expandField(hourField, 0, 23)].sort((a, b) => a - b);
  const week = expandField(weekField, 0, 7);
  // cron 里 7 也是周日
  if (week.has(7)) {
    week.delete(7);
    week.add(0);
  }

  const fullHour = hours.length === 24;
  const fullMinute = minutes.length === 60;
  if (fullHour && fullMinute) return '每分钟';
  if (fullHour) {
    const minuteText = minutes.length === 1 ? `第 ${minutes[0]} 分` : `第 ${minutes.join('、')} 分`;
    return `每小时${minuteText}`;
  }
  if (minutes.length !== 1 || hours.length > 1) return expr;

  const time = `${pad(hours[0] ?? 0)}:${pad(minutes[0] ?? 0)}`;
  const dayRestricted = dayField !== '*';
  const weekRestricted = weekField !== '*';
  if (weekRestricted && !dayRestricted) {
    const labels = WEEK_LABELS.filter((item) => week.has(item.value)).map((item) => item.label);
    return `每${labels.join('、')} ${time}`;
  }
  if (dayRestricted && !weekRestricted) {
    const days = [...expandField(dayField, 1, 31)].sort((a, b) => a - b);
    const months = [...expandField(monthField, 1, 12)].sort((a, b) => a - b);
    if (months.length < 12) return `每年 ${months.join('、')} 月的 ${days.join('、')} 号 ${time}`;
    return `每月 ${days.join('、')} 号 ${time}`;
  }
  return `每天 ${time}`;
}

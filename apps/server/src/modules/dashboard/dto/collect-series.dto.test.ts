import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CollectSeriesDTO } from './collect-series.dto';

/** 走一遍真实的管道路径：先转型成 DTO 类，再交给 class-validator */
async function check(raw: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(CollectSeriesDTO, raw));
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('CollectSeriesDTO', () => {
  it('不传 range 时合法（服务端按本日处理）', async () => {
    expect(await check({})).toEqual([]);
  });

  it('三个自然周期都收', async () => {
    for (const range of ['day', 'week', 'month']) {
      expect(await check({ range })).toEqual([]);
    }
  });

  it('范围外的值被拒，并给出可选范围', async () => {
    // 「近 7 天」这种滚动窗口不是这里的概念，传 year 之类的一律不认
    for (const range of ['year', 'last7', 'DAY', '']) {
      expect(await check({ range })).toEqual(['只能是 day / week / month']);
    }
  });

  it('类型不对（数字、对象）也被拒', async () => {
    expect(await check({ range: 7 })).toEqual(['只能是 day / week / month']);
    expect(await check({ range: { value: 'day' } })).toEqual(['只能是 day / week / month']);
  });
});

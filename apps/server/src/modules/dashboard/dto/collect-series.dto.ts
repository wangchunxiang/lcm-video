import { IsIn, IsOptional } from 'class-validator';

/**
 * 采集量的时间范围。
 *
 * 都是**自然周期**：`day` = 今天 00:00 起（按小时），`week` = 本周一 00:00 起（按天），
 * `month` = 本月 1 号 00:00 起（按天）。与「最近 24 小时 / 近 7 天 / 近 30 天」这种滚动窗口
 * 不是一回事——滚动窗口的起点跟着此刻滑动，跨天时同一根柱子会往前挪一格。
 */
export const COLLECT_RANGES = ['day', 'week', 'month'] as const;
export type CollectRange = (typeof COLLECT_RANGES)[number];

/** 采集量曲线的时间范围，不传等同 `day`。 */
export class CollectSeriesDTO {
  @IsOptional()
  @IsIn(COLLECT_RANGES, { message: '只能是 day / week / month' })
  range?: CollectRange;
}

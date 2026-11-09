import { z } from 'zod';

const sourceFrom = z
  .string()
  .trim()
  .min(1, '线路名称不能为空')
  .max(50, '线路名称不能超过 50 个字符');

/** 整串播放地址：第1集$http://...#第2集$http://...，至少一集。 */
const playUrl = z
  .string()
  .trim()
  .min(1, '播放地址不能为空')
  .max(1_000_000, '播放地址过长');

const sourceVodId = z.string().trim().max(50, '源站影片 id 不能超过 50 个字符');

export const VodPlayCreateDTO = z.object({
  vodId: z.number().int().positive('影片不存在'),
  /** 不传 = 手工线路（库里 source_id 为 NULL） */
  sourceId: z.number().int().positive().nullish(),
  sourceFrom,
  sourceVodId: sourceVodId.default(''),
  playUrl,
});
export type VodPlayCreateDTO = z.infer<typeof VodPlayCreateDTO>;

export const VodPlayUpdateDTO = z.object({
  id: z.number().int().positive('线路不存在'),
  /** 采集来的线路不允许改名（改名会脱离采集源的线路标识） */
  sourceFrom: sourceFrom.optional(),
  playUrl: playUrl.optional(),
});
export type VodPlayUpdateDTO = z.infer<typeof VodPlayUpdateDTO>;

export const VodPlayGetDTO = z.object({
  id: z.number().int().positive().optional(),
  vodId: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  sourceFrom: z.string().trim().min(1).optional(),
  sourceVodId: z.string().trim().min(1).optional(),
});
export type VodPlayGetDTO = z.infer<typeof VodPlayGetDTO>;

export const VodPlayPageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  vodId: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  sourceFrom: z.string().trim().max(50).optional(),
  keyword: z.string().trim().max(50).optional(),
});
export type VodPlayPageDTO = z.infer<typeof VodPlayPageDTO>;

export const VodPlayAllDTO = z.object({
  vodId: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  sourceFrom: z.string().trim().max(50).optional(),
});
export type VodPlayAllDTO = z.infer<typeof VodPlayAllDTO>;

/** force=1 时才允许删掉某影片的最后一条线路（旧站 409 二次确认）。 */
export const VodPlayDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的线路'),
  force: z.boolean().optional(),
});
export type VodPlayDeleteDTO = z.infer<typeof VodPlayDeleteDTO>;

/** 详情页/编辑弹窗用：按影片取全部线路并解析剧集。 */
export const VodPlayByVodDTO = z.object({
  vodId: z.number().int().positive('影片不存在'),
});
export type VodPlayByVodDTO = z.infer<typeof VodPlayByVodDTO>;

export interface EpisodeVO {
  name: string;
  url: string;
}

export interface VodPlayVO {
  id: number;
  vodId: number;
  sourceId: number | null;
  /** 采集源名称，手工线路为空串 */
  sourceName: string;
  sourceFrom: string;
  sourceVodId: string;
  sourceUpdatedAt: string | null;
  episodeCount: number;
  collectedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** 带剧集明细的线路（旧站 GET /vods/:id/plays 的返回）。 */
export interface VodPlayDetailVO extends VodPlayVO {
  episodes: EpisodeVO[];
}

import { z } from 'zod';

const sourceFrom = z
  .string()
  .trim()
  .min(1, '线路标识不能为空')
  .max(50, '线路标识不能超过 50 个字符')
  .regex(/^[a-zA-Z0-9_-]+$/, '线路标识只能包含字母、数字、下划线和减号');

const name = z.string().trim().max(50, '显示名不能超过 50 个字符');
const sort = z.number().int().min(0, '排序不能为负数').max(999999);
const isEnabled = z.number().int().min(0).max(1);

export const PlayLineCreateDTO = z.object({
  sourceFrom,
  name: name.default(''),
  sort: sort.default(0),
  isEnabled: isEnabled.default(1),
});
export type PlayLineCreateDTO = z.infer<typeof PlayLineCreateDTO>;

/** 线路标识是前台 join 键，改了会影响历史影片的线路显示，所以只允许改显示属性。 */
export const PlayLineUpdateDTO = z.object({
  id: z.number().int().positive('线路不存在'),
  name: name.optional(),
  sort: sort.optional(),
  isEnabled: isEnabled.optional(),
});
export type PlayLineUpdateDTO = z.infer<typeof PlayLineUpdateDTO>;

export const PlayLineGetDTO = z.object({
  id: z.number().int().positive().optional(),
  sourceFrom: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
});
export type PlayLineGetDTO = z.infer<typeof PlayLineGetDTO>;

export const PlayLinePageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(50).optional(),
  isEnabled: isEnabled.optional(),
});
export type PlayLinePageDTO = z.infer<typeof PlayLinePageDTO>;

export const PlayLineAllDTO = z.object({
  isEnabled: isEnabled.optional(),
});
export type PlayLineAllDTO = z.infer<typeof PlayLineAllDTO>;

export const PlayLineDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的线路'),
});
export type PlayLineDeleteDTO = z.infer<typeof PlayLineDeleteDTO>;

/** 批量启用/停用（旧站 /batch）。 */
export const PlayLineBatchDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请先选择线路'),
  action: z.enum(['enable', 'disable']),
});
export type PlayLineBatchDTO = z.infer<typeof PlayLineBatchDTO>;

/** 按传入顺序重排，sort = (index + 1) * 10（旧站 /sort）。 */
export const PlayLineSortDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '缺少排序内容'),
});
export type PlayLineSortDTO = z.infer<typeof PlayLineSortDTO>;

export interface PlayLineVO {
  id: number;
  sourceFrom: string;
  name: string;
  sort: number;
  isEnabled: number;
  /** 采集源里登记的来源名，逗号列表里第一个匹配；没有则空串 */
  sourceName: string;
  createdAt: string;
  updatedAt: string;
}

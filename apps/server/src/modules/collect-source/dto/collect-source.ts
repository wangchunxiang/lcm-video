import { z } from 'zod';

const httpUrl = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label}不能为空`)
    .max(max, `${label}不能超过 ${max} 个字符`)
    .regex(/^https?:\/\/\S+$/i, `${label}必须以 http:// 或 https:// 开头`);

/** 由程序控制的请求参数，不允许写进额外参数。 */
const FORBIDDEN_PARAMS = ['ac', 'pg', 'pagesize', 'at', 'h'] as const;

const apiParams = z
  .string()
  .trim()
  .max(500, '额外参数不能超过 500 个字符')
  .refine(
    (value) => {
      if (value.length === 0) return true;
      const params = new URLSearchParams(value.replace(/^\?/, ''));
      return FORBIDDEN_PARAMS.every((key) => !params.has(key));
    },
    { message: `额外参数不允许包含 ${FORBIDDEN_PARAMS.join('/')}，这些参数由程序控制` },
  );

const fields = {
  name: z.string().trim().min(1, '源站名称不能为空').max(50, '源站名称不能超过 50 个字符'),
  apiUrl: httpUrl(255, '采集接口地址'),
  apiParams: apiParams.default(''),
  parseUrl: z
    .string()
    .trim()
    .max(255, '解析接口地址不能超过 255 个字符')
    .regex(/^https?:\/\/\S+$/i, '解析接口地址必须以 http:// 或 https:// 开头')
    .or(z.literal(''))
    .default(''),
  isEnabled: z.union([z.literal(0), z.literal(1)]).default(1),
  intervalSec: z.number().int().min(1, '请求间隔必须在 1 到 600 秒之间').max(600, '请求间隔必须在 1 到 600 秒之间').default(3),
  pagesize: z.number().int().min(1, '每页条数必须在 1 到 100 之间').max(100, '每页条数必须在 1 到 100 之间').default(100),
  timeout: z.number().int().min(1, '超时时间必须在 1 到 300 秒之间').max(300, '超时时间必须在 1 到 300 秒之间').default(30),
  retryTimes: z.number().int().min(0, '重试次数必须在 0 到 10 之间').max(10, '重试次数必须在 0 到 10 之间').default(2),
};

export const CollectSourceCreateDTO = z.object(fields);
export type CollectSourceCreateDTO = z.infer<typeof CollectSourceCreateDTO>;

export const CollectSourceUpdateDTO = z.object({
  id: z.number().int().positive('采集源不存在'),
  name: fields.name.optional(),
  apiUrl: fields.apiUrl.optional(),
  apiParams: fields.apiParams.optional(),
  parseUrl: fields.parseUrl.optional(),
  isEnabled: fields.isEnabled.optional(),
  intervalSec: fields.intervalSec.optional(),
  pagesize: fields.pagesize.optional(),
  timeout: fields.timeout.optional(),
  retryTimes: fields.retryTimes.optional(),
});
export type CollectSourceUpdateDTO = z.infer<typeof CollectSourceUpdateDTO>;

export const CollectSourceGetDTO = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).optional(),
  apiUrl: z.string().trim().min(1).optional(),
  isEnabled: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type CollectSourceGetDTO = z.infer<typeof CollectSourceGetDTO>;

export const CollectSourcePageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(50).optional(),
  isEnabled: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type CollectSourcePageDTO = z.infer<typeof CollectSourcePageDTO>;

export const CollectSourceAllDTO = z.object({
  isEnabled: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type CollectSourceAllDTO = z.infer<typeof CollectSourceAllDTO>;

/** 删除会连带清理该源站下的线路、分类映射、替换规则、任务、采集记录与广告特征。 */
export const CollectSourceDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择采集源'),
});
export type CollectSourceDeleteDTO = z.infer<typeof CollectSourceDeleteDTO>;

export const CollectSourceBatchDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择采集源'),
  action: z.enum(['enable', 'disable']),
});
export type CollectSourceBatchDTO = z.infer<typeof CollectSourceBatchDTO>;

export interface CollectSourceVO {
  id: number;
  name: string;
  apiUrl: string;
  apiParams: string;
  parseUrl: string;
  isEnabled: number;
  intervalSec: number;
  pagesize: number;
  timeout: number;
  retryTimes: number;
  lastSyncAt: string | null;
  /** 0 未同步 1 成功 2 失败 */
  lastSyncStatus: number;
  lastSyncMsg: string;
  /** 最近一次采集到的线路标识，逗号分隔 */
  playFrom: string;
  createdAt: string;
  updatedAt: string;
}

/** 连通性测试 / 拉取分类：只需要 id */
export const CollectSourceRunDTO = z.object({
  id: z.number().int().positive('请选择采集源'),
});
export type CollectSourceRunDTO = z.infer<typeof CollectSourceRunDTO>;

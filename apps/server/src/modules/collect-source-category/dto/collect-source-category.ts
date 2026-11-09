import { z } from 'zod';

const categoryId = z.number().int().min(0).default(0);
/** 0 未映射 1 已映射 2 已忽略 */
const status = z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0);
/** 0 无 / 1 自动 / 2 手动 */
const matchType = z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0);

/** 库里 ck_status_mapped：status=1 必有目标分类，status=2 必须没有。 */
function checkMapping(value: { status: number; categoryId: number }, ctx: z.RefinementCtx): void {
  if (value.status === 1 && value.categoryId <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '已映射的记录必须选择本站分类', path: ['categoryId'] });
  }
  if (value.status === 2 && value.categoryId !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '忽略的记录不能带本站分类', path: ['categoryId'] });
  }
}

export const CollectSourceCategoryCreateDTO = z
  .object({
    sourceId: z.number().int().positive('请选择采集源'),
    sourceTypeId: z.string().trim().min(1, '源站分类 id 不能为空').max(50, '源站分类 id 不能超过 50 个字符'),
    sourceTypeName: z.string().trim().max(100, '源站分类名不能超过 100 个字符').default(''),
    sourceTypePid: z.string().trim().max(50, '源站父分类 id 不能超过 50 个字符').default(''),
    categoryId,
    matchType,
    status,
  })
  .superRefine(checkMapping);
export type CollectSourceCategoryCreateDTO = z.infer<typeof CollectSourceCategoryCreateDTO>;

export const CollectSourceCategoryUpdateDTO = z
  .object({
    id: z.number().int().positive('映射记录不存在'),
    sourceTypeName: z.string().trim().max(100, '源站分类名不能超过 100 个字符').optional(),
    sourceTypePid: z.string().trim().max(50, '源站父分类 id 不能超过 50 个字符').optional(),
    categoryId: z.number().int().min(0).optional(),
    matchType: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    status: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === undefined && value.categoryId === undefined) return;
    if (value.status === 1 && (value.categoryId ?? 0) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '已映射的记录必须选择本站分类', path: ['categoryId'] });
    }
    if (value.status === 2 && (value.categoryId ?? 0) !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '忽略的记录不能带本站分类', path: ['categoryId'] });
    }
  });
export type CollectSourceCategoryUpdateDTO = z.infer<typeof CollectSourceCategoryUpdateDTO>;

export const CollectSourceCategoryGetDTO = z.object({
  id: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  sourceTypeId: z.string().trim().min(1).optional(),
  categoryId: z.number().int().min(0).optional(),
  status: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
});
export type CollectSourceCategoryGetDTO = z.infer<typeof CollectSourceCategoryGetDTO>;

export const CollectSourceCategoryPageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  sourceId: z.number().int().positive().optional(),
  status: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  keyword: z.string().trim().max(100).optional(),
});
export type CollectSourceCategoryPageDTO = z.infer<typeof CollectSourceCategoryPageDTO>;

export const CollectSourceCategoryAllDTO = z.object({
  sourceId: z.number().int().positive().optional(),
  status: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
});
export type CollectSourceCategoryAllDTO = z.infer<typeof CollectSourceCategoryAllDTO>;

export const CollectSourceCategoryDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的映射'),
});
export type CollectSourceCategoryDeleteDTO = z.infer<typeof CollectSourceCategoryDeleteDTO>;

/** 某个采集源的全部源站分类 + 汇总（后台分类映射页用）。 */
export const CollectSourceCategoryBySourceDTO = z.object({
  sourceId: z.number().int().positive('采集源不存在'),
});
export type CollectSourceCategoryBySourceDTO = z.infer<typeof CollectSourceCategoryBySourceDTO>;

/** 批量手动映射 / 忽略 / 取消映射。 */
export const CollectSourceCategoryMapDTO = z
  .object({
    ids: z.array(z.number().int().positive()).min(1, '请选择要映射的源站分类'),
    categoryId: z.number().int().min(0).optional(),
    status: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 1 && (value.categoryId ?? 0) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '请选择本站分类', path: ['categoryId'] });
    }
  });
export type CollectSourceCategoryMapDTO = z.infer<typeof CollectSourceCategoryMapDTO>;

/** 对某个采集源尚未映射的分类跑一次自动匹配。 */
export const CollectSourceCategoryMatchDTO = z.object({
  sourceId: z.number().int().positive('采集源不存在'),
});
export type CollectSourceCategoryMatchDTO = z.infer<typeof CollectSourceCategoryMatchDTO>;

/** 把某个本站分类下的影片批量改成该映射的目标分类。 */
export const CollectSourceCategoryRemapDTO = z.object({
  sourceId: z.number().int().positive('采集源不存在'),
  id: z.number().int().positive('映射记录不存在'),
  fromCategoryId: z.number().int().positive('请提供原分类，用于定位要重刷的影片'),
});
export type CollectSourceCategoryRemapDTO = z.infer<typeof CollectSourceCategoryRemapDTO>;

export interface CollectSourceCategoryVO {
  id: number;
  sourceId: number;
  sourceTypeId: string;
  sourceTypeName: string;
  sourceTypePid: string;
  categoryId: number;
  /** 0 无 / 1 自动 / 2 手动 */
  matchType: number;
  /** 0 未映射 1 已映射 2 已忽略 */
  status: number;
  categoryName: string;
  categoryPid: number;
  updatedAt: string;
  createdAt: string;
}

export interface CollectSourceCategorySummaryVO {
  total: number;
  mapped: number;
  ignored: number;
  unmapped: number;
}

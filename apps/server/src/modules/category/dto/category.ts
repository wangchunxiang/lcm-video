import { z } from 'zod';

/** URL 别名：小写字母、数字、减号 */
const ALIAS_RE = /^[a-z0-9-]+$/;

const alias = z
  .string()
  .trim()
  .min(1, 'URL 别名不能为空')
  .max(50, 'URL 别名不能超过 50 个字符')
  .regex(ALIAS_RE, 'URL 别名只能包含小写字母、数字和减号');

const name = z.string().trim().min(1, '分类名称不能为空').max(50, '分类名称不能超过 50 个字符');

/** 可写字段，新增与修改共用。 */
const writable = {
  pid: z.number().int().min(0, '父分类不合法').default(0),
  name,
  alias,
  matchNames: z.string().trim().max(255, '匹配串不能超过 255 个字符').default(''),
  sort: z.number().int().min(0).default(0),
  isShow: z.number().int().min(0).max(1).default(1),
};

export const CategoryCreateDTO = z.object(writable);
export type CategoryCreateDTO = z.infer<typeof CategoryCreateDTO>;

/** 修改：id 必填，其余字段可选（只更新传入的部分）。 */
export const CategoryUpdateDTO = z.object(writable).partial().extend({
  id: z.number().int().positive('分类不存在'),
});
export type CategoryUpdateDTO = z.infer<typeof CategoryUpdateDTO>;

/** 单条查询：任意条件组合。 */
export const CategoryGetDTO = z.object(writable).partial().extend({
  id: z.number().int().positive().optional(),
});
export type CategoryGetDTO = z.infer<typeof CategoryGetDTO>;

/** 分页查询。 */
export const CategoryPageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(50).optional(),
  pid: z.number().int().min(0).optional(),
  isShow: z.number().int().min(0).max(1).optional(),
});
export type CategoryPageDTO = z.infer<typeof CategoryPageDTO>;

/** 查询全部（可选过滤）。 */
export const CategoryAllDTO = z.object({
  pid: z.number().int().min(0).optional(),
  isShow: z.number().int().min(0).max(1).optional(),
});
export type CategoryAllDTO = z.infer<typeof CategoryAllDTO>;

/** 批量删除，单条也传数组。 */
export const CategoryDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的分类'),
  /** 被源站分类映射引用时必须显式传 true，否则不删。 */
  force: z.boolean().optional(),
});
export type CategoryDeleteDTO = z.infer<typeof CategoryDeleteDTO>;

/** 输出结构：一行分类。 */
export interface CategoryVO {
  id: number;
  pid: number;
  name: string;
  alias: string;
  matchNames: string;
  sort: number;
  isShow: number;
  createdAt: string;
  updatedAt: string;
}

/** 输出结构：两级树 + 影片数（后台分类页用）。 */
export interface CategoryNodeVO extends CategoryVO {
  vodCount: number;
  children: CategoryNodeVO[];
}

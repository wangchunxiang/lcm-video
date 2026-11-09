import { z } from 'zod';

/** 片名：去首尾空白后 1~255 字（入库前还会做 normalizeName 归一化）。 */
const name = z.string().trim().min(1, '影片名称不能为空').max(255, '影片名称不能超过 255 个字符');

const categoryId = z.number().int().positive('请选择分类');

const text = (max: number, label: string) => z.string().trim().max(max, `${label}不能超过 ${max} 个字符`);

/** 影片可编辑字段（create 与 update 共用，长度按新库列宽）。 */
const vodFields = {
  name,
  categoryId,
  subName: text(500, '别名').default(''),
  cover: text(1000, '封面').default(''),
  actor: text(1000, '演员').default(''),
  director: text(500, '导演').default(''),
  writer: text(500, '编剧').default(''),
  intro: text(1000, '简介').default(''),
  content: z.string().max(200_000, '详情过长').default(''),
  remarks: text(255, '备注').default(''),
  releaseDate: text(20, '上映日期').default(''),
  episodeCount: z.number().int().min(0).max(100_000).default(0),
  area: text(100, '地区').default(''),
  lang: text(100, '语言').default(''),
  year: z.number().int().min(0).max(2999, '年份不合法').default(0),
  status: z.union([z.literal(0), z.literal(1)]).default(1),
};

export const VodCreateDTO = z.object(vodFields);
export type VodCreateDTO = z.infer<typeof VodCreateDTO>;

/** update：只改传入的字段；改片名会重算 hash，改封面会重算 coverHost。 */
export const VodUpdateDTO = z.object({
  id: z.number().int().positive('影片不存在'),
  name: name.optional(),
  categoryId: categoryId.optional(),
  subName: text(500, '别名').optional(),
  cover: text(1000, '封面').optional(),
  actor: text(1000, '演员').optional(),
  director: text(500, '导演').optional(),
  writer: text(500, '编剧').optional(),
  intro: text(1000, '简介').optional(),
  content: z.string().max(200_000, '详情过长').optional(),
  remarks: text(255, '备注').optional(),
  releaseDate: text(20, '上映日期').optional(),
  episodeCount: z.number().int().min(0).max(100_000).optional(),
  area: text(100, '地区').optional(),
  lang: text(100, '语言').optional(),
  year: z.number().int().min(0).max(2999, '年份不合法').optional(),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type VodUpdateDTO = z.infer<typeof VodUpdateDTO>;

/** get：任意条件命中必须唯一（决策 2.9）。 */
export const VodGetDTO = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).optional(),
  categoryId: z.number().int().positive().optional(),
  year: z.number().int().min(0).max(2999).optional(),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type VodGetDTO = z.infer<typeof VodGetDTO>;

export const VodPageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  categoryId: z.number().int().positive().optional(),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
  keyword: z.string().trim().max(50).optional(),
  /** new = 按创建时间倒序，其余按采集时间倒序 */
  sort: z.enum(['new', 'collected']).default('collected'),
});
export type VodPageDTO = z.infer<typeof VodPageDTO>;

export const VodAllDTO = z.object({
  categoryId: z.number().int().positive().optional(),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
  keyword: z.string().trim().max(50).optional(),
  limit: z.number().int().min(1).max(1000).default(1000),
});
export type VodAllDTO = z.infer<typeof VodAllDTO>;

/** delete 是物理删除（连带线路）；只下架请用 batch 的 status 操作。 */
export const VodDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择影片'),
});
export type VodDeleteDTO = z.infer<typeof VodDeleteDTO>;

export const VodBatchDTO = z
  .object({
    ids: z.array(z.number().int().positive()).min(1, '请选择影片').max(500, '一次最多操作 500 条'),
    action: z.enum(['category', 'status']),
    categoryId: categoryId.optional(),
    status: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .refine((dto) => dto.action !== 'category' || dto.categoryId !== undefined, {
    message: '请选择目标分类',
    path: ['categoryId'],
  })
  .refine((dto) => dto.action !== 'status' || dto.status !== undefined, {
    message: '请选择目标状态',
    path: ['status'],
  });
export type VodBatchDTO = z.infer<typeof VodBatchDTO>;

/** 列表行：只带列表页需要的字段。 */
export interface VodVO {
  id: number;
  name: string;
  categoryId: number;
  categoryPid: number;
  categoryName: string;
  cover: string;
  year: number;
  area: string;
  lang: string;
  remarks: string;
  status: number;
  episodeCount: number;
  /** 实际线路数 */
  playCount: number;
  /** 各线路里集数的最大值 */
  actualEpisodes: number;
  collectedAt: string;
  createdAt: string;
}

/** 详情：全部字段 + 分类名 + 线路概况。 */
export interface VodDetailVO extends VodVO {
  subName: string;
  actor: string;
  director: string;
  writer: string;
  intro: string;
  content: string;
  releaseDate: string;
  coverHost: string;
  parentName: string;
  updatedAt: string;
  plays: VodPlayBriefVO[];
}

export interface VodPlayBriefVO {
  id: number;
  sourceId: number | null;
  sourceName: string;
  sourceFrom: string;
  episodeCount: number;
}

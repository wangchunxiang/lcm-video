import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import type { CrudOptions } from '@ackplus/nest-crud';
import { ADMIN_API_PREFIX } from '../http/api-prefix';

/**
 * 所有 CRUD 控制器的公共配置，集中在这里；控制器里只写差异项。
 *
 * - `softDelete: false`：库里没有 `deleted_at` 语义。为 false 时 nest-crud 会自己
 *   关掉 `restore` / `deleteFromTrash` / `restoreMany` / `deleteFromTrashMany` 四条
 *   回收站路由，所以控制器里不用再逐个写。
 * - `maxPerPage: 100`：库默认 5000，列表一次拉回几千行没有意义。
 * - `createMany` / `reorder` 后台没有入口，直接关掉。
 */
const DEFAULTS = {
  softDelete: false,
  maxPerPage: 100,
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
} satisfies Partial<CrudOptions>;

/**
 * `@Crud()` 的项目默认值版本。
 *
 * `path` 只写资源名（如 `'vod'`），`/api/admin` 前缀由这里统一拼，控制器不再重复。
 *
 * 不用 `NestCrudModule.forRoot()` 做这件事：它只是 `CrudConfigService.load()`，
 * 在 `app.module.ts` 求值时才执行；而 `@Crud()` 装饰器在控制器模块被 import 时
 * 就已经跑完 `mergeOptions()`，把 `routes` 与 `maxPerPage` 定死了，全局配置晚一步。
 */
export type AppCrudOptions = Omit<CrudOptions, 'path'> & { path: string };

export function AppCrud(options: AppCrudOptions): ClassDecorator {
  const { path, ...rest } = options;
  return Crud({
    ...DEFAULTS,
    ...rest,
    path: `${ADMIN_API_PREFIX}/${path}`,
    routes: { ...DEFAULTS.routes, ...options.routes },
  });
}

// 修 nest-crud 的 where 列名解析，必须在任何 CRUD 请求之前生效
import './nest-crud-where.patch';
import { CrudService } from '@ackplus/nest-crud';
import type { Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { AppBaseEntity } from './app-base.entity';

/**
 * 业务 service 的公共基类：把仓库注入 `@ackplus/nest-crud` 的 `CrudService`。
 *
 * 主键统一是 `BIGINT UNSIGNED`，在 JS 侧是 string，与 nest-crud 的 `BaseEntity.id: string`
 * 一致，因此这里不需要任何类型断言。
 *
 * 注意：`repository` 必须声明成 `public readonly`——基类里它是 public，
 * 子类构造函数参数写成 protected 会报 TS2415。
 */
export abstract class AppCrudService<T extends AppBaseEntity> extends CrudService<T> {
  protected constructor(public readonly repository: Repository<T>) {
    super(repository);
  }

  /**
   * 删除/批量删除的成功文案统一成中文。
   *
   * 库里的 `delete()` 返回的文案来自 `CrudService.msg()`，它只读全局
   * `CrudConfigService.config.messages`（本仓库没注册 `NestCrudModule.forRoot()`，也没有
   * 按控制器生效的通道），所以拿不到中文。要改只能在这里兜底。
   */
  override async delete(
    criteria: string | FindOptionsWhere<T>,
    softDelete?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    const result = await super.delete(criteria, softDelete);
    return { success: result.success, message: '已删除' };
  }

  override async deleteMany(
    params: { ids?: string[] },
    softDelete?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    const result = await super.deleteMany(params, softDelete);
    return { success: result.success, message: '已删除' };
  }
}

import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 所有业务实体的公共列（与 `docs/02-数据库/数据库设计.md` 的「全局字段」一致）：
 * `id` / `created_at` / `updated_at` 每张表都有。
 *
 * 主键用 `BIGINT UNSIGNED`，在 JS 侧是 **string**：TypeORM 的 mysql 驱动默认开
 * `supportBigNumbers + bigNumberStrings`（`MysqlDriver.js` 建连接选项处），
 * BIGINT 列一律以字符串返回，正好与 `@ackplus/nest-crud` 的 `BaseEntity.id: string` 对齐，
 * 不需要任何类型断言。代价见 `docs/01-架构/架构总览.md`「主键与 id 的约定」：id 全链路按字符串处理。
 *
 * `deletedAt` 是给 `@ackplus/nest-crud` 看的：它的 `CrudService<T extends BaseEntity>`
 * 要求实体上有这个字段，而我们的表没有 `deleted_at` 列（决策：不做软删除）。
 * 它没有 TypeORM 装饰器，因此不会被当作真实列读写；控制器里统一 `softDelete: false`。
 */
export abstract class AppBaseEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true, comment: '主键' })
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', comment: '创建时间' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', comment: '更新时间' })
  updatedAt!: Date;

  /** 仅为满足 nest-crud 的类型约束而存在，不映射数据库列。 */
  deletedAt!: Date;
}

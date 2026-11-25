import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/**
 * 源站分类 → 本站分类的映射。
 *
 * 库里有 CHECK `ck_status_mapped`：`(status = 1) = (category_id > 0)`
 * （已映射 ⇔ 有目标分类）。TypeORM 表达不了，写在 baseline 迁移里。
 */
@Entity('lcm_collect_source_category', { comment: '源站分类映射' })
export class CollectSourceCategoryEntity extends AppBaseEntity {
  @Column({
    name: 'source_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '采集源 id',
  })
  sourceId!: string;

  @Column({
    name: 'source_type_id',
    type: 'varchar',
    length: 50,
    default: '',
    comment: '源站分类 id（源站命名空间，保持字符串）',
  })
  sourceTypeId!: string;

  @Column({
    name: 'source_type_name',
    type: 'varchar',
    length: 100,
    default: '',
    comment: '源站分类名快照，同步分类时刷新',
  })
  sourceTypeName!: string;

  @Column({
    name: 'source_type_pid',
    type: 'varchar',
    length: 50,
    default: '',
    comment: '源站父分类 id，后台按两级树展示用',
  })
  sourceTypePid!: string;

  @Column({
    name: 'category_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '映射到的本站分类，0 表示未映射',
  })
  categoryId!: string;

  @Column({
    name: 'match_type',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '映射方式：0 无 1 自动 2 手动',
  })
  matchType!: number;

  @Column({
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '0 未映射 1 已映射 2 已忽略',
  })
  status!: number;
}

import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 分类，固定两级：`pid = 0` 是一级分类，二级分类的 `pid` 指向一级分类。 */
@Entity('lcm_category')
@Index('uk_alias', ['alias'], { unique: true })
@Index('idx_pid_sort', ['pid', 'sort'])
export class CategoryEntity extends AppBaseEntity {
  /** 父分类 id，0 表示一级分类 */
  @Column({ type: 'bigint', unsigned: true, default: 0 })
  pid!: string;

  @Column({ type: 'varchar', length: 50, default: '' })
  name!: string;

  /** URL 段，如 movie */
  @Column({ type: 'varchar', length: 50, default: '' })
  alias!: string;

  /** 源站分类名匹配串，逗号分隔，用于自动映射 */
  @Column({ name: 'match_names', type: 'varchar', length: 255, default: '' })
  matchNames!: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sort!: number;

  /** 1 前台显示 0 隐藏 */
  @Column({ name: 'is_show', type: 'tinyint', unsigned: true, default: 1 })
  isShow!: number;
}

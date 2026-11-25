import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 分类，固定两级：`pid = 0` 是一级分类，二级分类的 `pid` 指向一级分类。 */
@Entity('lcm_category', { comment: '分类，固定两层：pid = 0 是一级分类' })
export class CategoryEntity extends AppBaseEntity {
  @Column({
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '父分类 id，0 表示一级分类',
  })
  pid!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: '',
    comment: '分类名',
  })
  name!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: '',
    comment: 'URL 段，如 movie',
  })
  alias!: string;

  @Column({
    name: 'match_names',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '源站分类名匹配串，逗号分隔，用于自动映射',
  })
  matchNames!: string;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '排序，小的在前',
  })
  sort!: number;

  @Column({
    name: 'is_show',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '1 前台显示 0 隐藏',
  })
  isShow!: number;
}

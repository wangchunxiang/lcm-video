import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/**
 * 首页 hero 轮播位。
 *
 * 表里**只存运营配置**：片名、年份、地区、备注、分类这些内容一律实时读 `lcm_vod`，
 * 采集更新后 hero 不会停在旧数据上。少数需要人工干预的字段做成「覆盖列」：
 * 留空串就表示「用影片自己的值」，前端拼装时按 `覆盖值 || 影片值` 取。
 *
 * 一个轮播位对应一部库内影片（`uk_vod` 唯一），不支持挂专题页/站外链接。
 */
@Entity('lcm_home_hero', { comment: '首页 hero 轮播位；只存运营配置，影片内容实时读 lcm_vod' })
@Index('uk_vod', ['vodId'], { unique: true })
@Index('idx_show_sort', ['isShow', 'sort'])
export class HomeHeroEntity extends AppBaseEntity {
  @Column({
    name: 'vod_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: 'lcm_vod.id',
  })
  vodId!: string;

  @Column({
    type: 'varchar',
    length: 255,
    default: '',
    comment: '展示标题，空串用影片名',
  })
  title!: string;

  @Column({
    name: 'sub_title',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '副标题文案，空串不显示',
  })
  subTitle!: string;

  @Column({
    name: 'bg_image',
    type: 'varchar',
    length: 1000,
    default: '',
    comment: '通栏横幅图（16:9 或更宽），空串用影片封面',
  })
  bgImage!: string;

  @Column({
    type: 'varchar',
    length: 255,
    default: '',
    comment: '角标文案，空串用影片备注',
  })
  remarks!: string;

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
    comment: '1 显示 0 隐藏',
  })
  isShow!: number;

  @Column({
    name: 'start_at',
    type: 'datetime',
    nullable: true,
    comment: '定时上线，NULL 表示立即',
  })
  startAt!: Date | null;

  @Column({
    name: 'end_at',
    type: 'datetime',
    nullable: true,
    comment: '定时下线，NULL 表示长期',
  })
  endAt!: Date | null;
}

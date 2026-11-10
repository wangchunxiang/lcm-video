import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 影片主表。 */
@Entity('lcm_vod')
@Index('idx_category_status', ['categoryId', 'status'])
@Index('idx_pid_status', ['categoryPid', 'status'])
@Index('idx_category_status_year', ['categoryId', 'status', 'year'])
@Index('idx_pid_status_year', ['categoryPid', 'status', 'year'])
@Index('idx_name_hash', ['nameHash'])
@Index('idx_name_hash_loose', ['nameHashLoose'])
@Index('idx_status_collected', ['status', 'collectedAt'])
@Index('idx_cover_host', ['coverHost'])
@Index('idx_search', ['status', 'name', 'year', 'collectedAt', 'createdAt'])
export class VodEntity extends AppBaseEntity {
  /** 二级分类 id */
  @Column({ name: 'category_id', type: 'bigint', unsigned: true, default: 0 })
  categoryId!: string;

  /** 一级分类 id，冗余字段，按一级分类筛选时避免 join */
  @Column({ name: 'category_pid', type: 'bigint', unsigned: true, default: 0 })
  categoryPid!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  name!: string;

  /** 规范化片名的 MD5，严格判重用 */
  @Column({ name: 'name_hash', type: 'char', length: 32, default: '' })
  nameHash!: string;

  /** 去掉标点后的 MD5，仅用于后台提示疑似重复 */
  @Column({ name: 'name_hash_loose', type: 'char', length: 32, default: '' })
  nameHashLoose!: string;

  /** 别名 */
  @Column({ name: 'sub_name', type: 'varchar', length: 500, default: '' })
  subName!: string;

  @Column({ type: 'varchar', length: 1000, default: '' })
  cover!: string;

  /** 封面域名，写入 cover 时同步维护 */
  @Column({ name: 'cover_host', type: 'varchar', length: 255, default: '' })
  coverHost!: string;

  @Column({ type: 'varchar', length: 1000, default: '' })
  actor!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  director!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  writer!: string;

  /** 短简介，列表页用 */
  @Column({ type: 'varchar', length: 1000, default: '' })
  intro!: string;

  /** 长简介，详情页用 */
  @Column({ type: 'text', nullable: true })
  content!: string | null;

  /** 更新备注 */
  @Column({ type: 'varchar', length: 255, default: '' })
  remarks!: string;

  /** 上映日期，源站原文（Y-m-d / Y） */
  @Column({ name: 'release_date', type: 'varchar', length: 20, default: '' })
  releaseDate!: string;

  @Column({ name: 'episode_count', type: 'int', unsigned: true, default: 0 })
  episodeCount!: number;

  @Column({ type: 'varchar', length: 100, default: '' })
  area!: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  lang!: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  year!: number;

  /** 1 上架 0 下架 */
  @Column({ type: 'tinyint', unsigned: true, default: 1 })
  status!: number;

  /** 最后一次采集时间，列表排序用 */
  @Column({
    name: 'collected_at',
    type: 'datetime',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  collectedAt!: Date;
}

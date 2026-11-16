import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 影片主表。 */
@Entity('lcm_vod', { comment: '影片主表' })
@Index('idx_category_status', ['categoryId', 'status'])
@Index('idx_pid_status', ['categoryPid', 'status'])
@Index('idx_category_status_year', ['categoryId', 'status', 'year'])
@Index('idx_pid_status_year', ['categoryPid', 'status', 'year'])
@Index('idx_name_hash', ['nameHash'])
@Index('idx_name_hash_loose', ['nameHashLoose'])
@Index('idx_status_collected', ['status', 'collectedAt'])
@Index('idx_cover_host', ['coverHost'])
@Index('idx_search', ['status', 'name', 'year', 'collectedAt', 'createdAt'])
// 重复影片页的覆盖索引：按 name_hash 分组后只读窄列，避免回表读 238MB 的宽表
@Index('idx_merge_preview', ['nameHash', 'name', 'year', 'status', 'collectedAt'])
// 疑似重复：按 name_hash_loose 分组时顺带数出组内有几种严格键
@Index('idx_merge_loose', ['nameHashLoose', 'nameHash'])
// 列表「最新入库」按 created_at 排序，没有这条索引时 12 万行要 filesort（7.4 秒）
@Index('idx_status_created', ['status', 'createdAt', 'id'])
// 年份筛选的 DISTINCT year，避免每次列表都扫全部上架行
@Index('idx_status_year', ['status', 'year'])
export class VodEntity extends AppBaseEntity {
  @Column({
    name: 'category_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '二级分类 id',
  })
  categoryId!: string;

  @Column({
    name: 'category_pid',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '一级分类 id，冗余字段，按一级分类筛选时避免 join',
  })
  categoryPid!: string;

  @Column({
    type: 'varchar',
    length: 255,
    default: '',
    comment: '片名',
  })
  name!: string;

  @Column({
    name: 'name_hash',
    type: 'char',
    length: 32,
    default: '',
    comment: '规范化片名的 MD5，严格判重用',
  })
  nameHash!: string;

  @Column({
    name: 'name_hash_loose',
    type: 'char',
    length: 32,
    default: '',
    comment: '去掉标点后的 MD5，仅用于后台提示疑似重复',
  })
  nameHashLoose!: string;

  @Column({
    name: 'sub_name',
    type: 'varchar',
    length: 500,
    default: '',
    comment: '别名',
  })
  subName!: string;

  @Column({
    type: 'varchar',
    length: 1000,
    default: '',
    comment: '封面地址',
  })
  cover!: string;

  @Column({
    name: 'cover_host',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '封面域名，写入 cover 时同步维护',
  })
  coverHost!: string;

  @Column({
    type: 'varchar',
    length: 1000,
    default: '',
    comment: '主演，逗号分隔',
  })
  actor!: string;

  @Column({
    type: 'varchar',
    length: 500,
    default: '',
    comment: '导演',
  })
  director!: string;

  @Column({
    type: 'varchar',
    length: 500,
    default: '',
    comment: '编剧',
  })
  writer!: string;

  @Column({
    type: 'varchar',
    length: 1000,
    default: '',
    comment: '短简介，列表页用',
  })
  intro!: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: '长简介，详情页用',
  })
  content!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    default: '',
    comment: '更新备注',
  })
  remarks!: string;

  @Column({
    name: 'release_date',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '上映日期，源站原文，不做规范化',
  })
  releaseDate!: string;

  @Column({
    name: 'episode_count',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '集数',
  })
  episodeCount!: number;

  @Column({
    type: 'varchar',
    length: 100,
    default: '',
    comment: '地区',
  })
  area!: string;

  @Column({
    type: 'varchar',
    length: 100,
    default: '',
    comment: '语言',
  })
  lang!: string;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '年份',
  })
  year!: number;

  @Column({
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '1 上架 0 下架',
  })
  status!: number;

  @Column({
    name: 'collected_at',
    type: 'datetime',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
    comment: '最后一次采集时间，列表排序用',
  })
  collectedAt!: Date;
}

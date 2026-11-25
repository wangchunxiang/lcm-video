import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CategoryEntity } from './category.entity';
import type { CreateCategoryDTO, UpdateCategoryDTO } from './dto/category.dto';

/** 前台导航用：一级分类 + 其下二级分类。 */
export interface CategoryTreeNode extends CategoryEntity {
  children: CategoryEntity[];
}

/**
 * 分类表。
 *
 * 固定两级（决策：不做无限层级）：`pid = 0` 为一级，二级的 `pid` 指向一级。
 * 删除保护：有子分类、或分类下有影片时不允许删。
 */
@Injectable()
export class CategoryService extends AppCrudService<CategoryEntity> {
  constructor(
    @InjectRepository(CategoryEntity) repository: Repository<CategoryEntity>,
    private readonly dataSource: DataSource,
  ) {
    super(repository);
  }

  override async create(data: Partial<CategoryEntity>): Promise<CategoryEntity> {
    const dto = data as unknown as CreateCategoryDTO;
    await this.assertAliasFree(dto.alias);
    const pid = dto.pid ?? '0';
    if (pid !== '0') await this.assertIsTopCategory(pid);

    return super.create({
      pid,
      name: dto.name.trim(),
      alias: dto.alias,
      matchNames: dto.matchNames ?? '',
      sort: dto.sort ?? 0,
      isShow: dto.isShow ?? 1,
    });
  }

  override async update(
    criteria: string | FindOptionsWhere<CategoryEntity>,
    data: Partial<CategoryEntity>,
  ): Promise<CategoryEntity> {
    const dto = data as unknown as UpdateCategoryDTO;
    const patch: Partial<CategoryEntity> = {};

    // 同一个分类在本次请求里只查一次：别名查重和「不能挂到自己下面」都要它
    let current: CategoryEntity | null = null;
    const requireCurrent = async (): Promise<CategoryEntity> => {
      if (current === null) current = await this.findOneOrFail(criteria);
      return current;
    };

    if (dto.alias !== undefined) {
      const target = await requireCurrent();
      if (dto.alias !== target.alias) await this.assertAliasFree(dto.alias);
      patch.alias = dto.alias;
    }
    if (dto.pid !== undefined) {
      const target = await requireCurrent();
      if (dto.pid === target.id) throw new BadRequestException('不能把分类挂到自己下面');
      if (dto.pid !== '0') {
        await this.assertIsTopCategory(dto.pid);
        const hasChildren = await this.repository.count({ where: { pid: target.id } });
        if (hasChildren > 0) throw new BadRequestException('该分类下还有子分类，不能再挂到别的分类下');
      }
      patch.pid = dto.pid;
    }
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.matchNames !== undefined) patch.matchNames = dto.matchNames;
    if (dto.sort !== undefined) patch.sort = dto.sort;
    if (dto.isShow !== undefined) patch.isShow = dto.isShow;
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');

    return super.update(criteria, patch);
  }

  override async delete(
    criteria: string | FindOptionsWhere<CategoryEntity>,
    softDelete?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    if (typeof criteria === 'string') {
      const children = await this.repository.count({ where: { pid: criteria } });
      if (children > 0) throw new BadRequestException('该分类下还有子分类，先删子分类');

      const [used] = await this.dataSource.query<Array<{ total: string }>>(
        'SELECT COUNT(*) AS total FROM lcm_vod WHERE category_id = ?',
        [criteria],
      );
      if (used !== undefined && Number(used.total) > 0) {
        throw new BadRequestException(`该分类下还有 ${used.total} 部影片，先移走或删除影片`);
      }
    }
    return super.delete(criteria, softDelete);
  }

  /** 前台导航：一级分类连同二级分类一次取出。 */
  async tree(): Promise<CategoryTreeNode[]> {
    const rows = await this.repository.find({ order: { sort: 'ASC', id: 'ASC' } });
    const tops = rows.filter((row) => row.pid === '0');
    return tops.map((top) => ({
      ...top,
      children: rows.filter((row) => row.pid === top.id),
    }));
  }

  /** 影视管理里的分类下拉：只要「一级 + 二级」扁平列表。 */
  async selectOptions(): Promise<Array<{ id: string; name: string; pid: string }>> {
    const rows = await this.repository.find({
      select: ['id', 'name', 'pid', 'sort'],
      order: { sort: 'ASC', id: 'ASC' },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, pid: row.pid }));
  }

  private async assertAliasFree(alias: string): Promise<void> {
    const exists = await this.repository.findOne({ where: { alias } });
    if (exists !== null) throw new BadRequestException(`别名 ${alias} 已被占用`);
  }

  /** 二级分类只能挂在 `pid = 0` 的一级分类下。 */
  private async assertIsTopCategory(pid: string): Promise<void> {
    const parent = await this.repository.findOne({ where: { id: pid } });
    if (parent === null) throw new BadRequestException('父分类不存在');
    if (parent.pid !== '0') throw new BadRequestException('最多两级分类，二级分类不能再挂子分类');
  }

  private async findOneOrFail(
    criteria: string | FindOptionsWhere<CategoryEntity>,
  ): Promise<CategoryEntity> {
    const row = await this.repository.findOne({
      where: typeof criteria === 'string' ? { id: criteria } : criteria,
    });
    if (row === null) throw new BadRequestException('分类不存在');
    return row;
  }
}

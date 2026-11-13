import { AppCrud } from '../../common/crud/app-crud.decorator';
import { Post } from '@nestjs/common';
import { CategoryEntity } from './category.entity';
import { CategoryService } from './category.service';
import type { CategoryTreeNode } from './category.service';
import { CreateCategoryDTO, UpdateCategoryDTO } from './dto/category.dto';

/**
 * 分类管理：`@Crud()` 生成标准 REST，另加 `tree`（前台导航树）与 `options`（下拉）。
 */
@AppCrud({
  entity: CategoryEntity,
  path: 'category',
  dto: { create: CreateCategoryDTO, update: UpdateCategoryDTO },
})
export class CategoryController {
  constructor(public readonly service: CategoryService) {}

  /** 两级导航树。 */
  @Post('tree')
  tree(): Promise<CategoryTreeNode[]> {
    return this.service.tree();
  }

  /** 下拉用的扁平列表。 */
  @Post('options')
  options(): Promise<Array<{ id: string; name: string; pid: string }>> {
    return this.service.selectOptions();
  }
}

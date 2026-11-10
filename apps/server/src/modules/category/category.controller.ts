import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { Post } from '@nestjs/common';
import { CategoryEntity } from './category.entity';
import { CategoryService } from './category.service';
import type { CategoryTreeNode } from './category.service';
import { CreateCategoryDTO, UpdateCategoryDTO } from './dto/category.dto';

/**
 * 分类管理：`@Crud()` 生成标准 REST，另加 `tree`（前台导航树）与 `options`（下拉）。
 */
@Crud({
  entity: CategoryEntity,
  path: 'api/admin/category',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateCategoryDTO, update: UpdateCategoryDTO },
  messages: { deleted: '分类已删除' },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
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

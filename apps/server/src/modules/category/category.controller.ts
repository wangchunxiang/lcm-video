import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { Page } from '../../common/page';
import { CategoryService } from './category.service';
import type {
  CategoryAllDTO,
  CategoryCreateDTO,
  CategoryDeleteDTO,
  CategoryGetDTO,
  CategoryNodeVO,
  CategoryPageDTO,
  CategoryUpdateDTO,
  CategoryVO,
} from './dto/category';
import {
  CategoryAllDTO as AllSchema,
  CategoryCreateDTO as CreateSchema,
  CategoryDeleteDTO as DeleteSchema,
  CategoryGetDTO as GetSchema,
  CategoryPageDTO as PageSchema,
  CategoryUpdateDTO as UpdateSchema,
} from './dto/category';

/**
 * 分类表的标准六件套 + 一个额外接口（tree）。
 * 全部 POST，路径 /api/admin/category/<动作>，见 docs/架构-v2.md「表的默认接口」。
 */
@Controller('api/admin/category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post('create')
  async create(@Body(new ZodValidationPipe(CreateSchema)) dto: CategoryCreateDTO): Promise<CategoryVO> {
    return this.categoryService.create(dto);
  }

  @Post('update')
  async update(@Body(new ZodValidationPipe(UpdateSchema)) dto: CategoryUpdateDTO): Promise<CategoryVO> {
    return this.categoryService.update(dto);
  }

  @Post('delete')
  async delete(
    @Body(new ZodValidationPipe(DeleteSchema)) dto: CategoryDeleteDTO,
  ): Promise<{ deleted: number; resetMappings: number }> {
    return this.categoryService.delete(dto);
  }

  @Post('get')
  async get(@Body(new ZodValidationPipe(GetSchema)) dto: CategoryGetDTO): Promise<CategoryVO> {
    return this.categoryService.get(dto);
  }

  @Post('page')
  async page(@Body(new ZodValidationPipe(PageSchema)) dto: CategoryPageDTO): Promise<Page<CategoryVO>> {
    return this.categoryService.page(dto);
  }

  @Post('all')
  async all(@Body(new ZodValidationPipe(AllSchema)) dto: CategoryAllDTO): Promise<CategoryVO[]> {
    return this.categoryService.all(dto);
  }

  /** 额外接口：两级树 + 影片数。 */
  @Post('tree')
  async tree(): Promise<CategoryNodeVO[]> {
    return this.categoryService.tree();
  }
}

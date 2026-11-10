import {
  Controller,
  Post,
} from '@nestjs/common';

import type {
  Page,
} from '../../common/pagination/page';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  CategoryService,
} from './category.service';

import {
  CategoryAllDTO,
  CategoryCreateDTO,
  CategoryDeleteDTO,
  CategoryGetDTO,
  CategoryPageDTO,
  CategoryUpdateDTO,
} from './dto/category';

import type {
  CategoryNodeVO,
  CategoryVO,
} from './dto/category';

/**
 * 分类表的标准六件套 + 一个额外接口（tree）。
 * 全部 POST，路径 /api/admin/category/<动作>，见 docs/架构-v2.md「表的默认接口」。
 */
@Controller('api/admin/category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post('create')
  async create(@ZodBody(CategoryCreateDTO) dto: CategoryCreateDTO): Promise<CategoryVO> {
    return this.categoryService.create(dto);
  }

  @Post('update')
  async update(@ZodBody(CategoryUpdateDTO) dto: CategoryUpdateDTO): Promise<CategoryVO> {
    return this.categoryService.update(dto);
  }

  @Post('delete')
  async delete(
    @ZodBody(CategoryDeleteDTO) dto: CategoryDeleteDTO,
  ): Promise<{ deleted: number; resetMappings: number }> {
    return this.categoryService.delete(dto);
  }

  @Post('get')
  async get(@ZodBody(CategoryGetDTO) dto: CategoryGetDTO): Promise<CategoryVO> {
    return this.categoryService.get(dto);
  }

  @Post('page')
  async page(@ZodBody(CategoryPageDTO) dto: CategoryPageDTO): Promise<Page<CategoryVO>> {
    return this.categoryService.page(dto);
  }

  @Post('all')
  async all(@ZodBody(CategoryAllDTO) dto: CategoryAllDTO): Promise<CategoryVO[]> {
    return this.categoryService.all(dto);
  }

  /** 额外接口：两级树 + 影片数。 */
  @Post('tree')
  async tree(): Promise<CategoryNodeVO[]> {
    return this.categoryService.tree();
  }
}

import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { IdDTO } from '../../common/dto/id.dto';
import { CollectSourceEntity } from './collect-source.entity';
import { CollectSourceService } from './collect-source.service';
import type { CollectSourceTestResult, FetchCategoriesResult } from './collect-source.service';
import type { StartResult } from '../collect/runner';
import { CreateCollectSourceDTO, RunDTO, UpdateCollectSourceDTO } from './dto/collect-source.dto';

/** 采集源站：标准 REST + 连通性测试 + 拉取分类。 */
@AppCrud({
  entity: CollectSourceEntity,
  path: 'api/admin/collect-source',
  dto: { create: CreateCollectSourceDTO, update: UpdateCollectSourceDTO },
})
export class CollectSourceController {
  constructor(public readonly service: CollectSourceService) {}

  /** 拉一次分类验证连通性，不落库。 */
  @Post('test')
  test(@Body() dto: IdDTO): Promise<CollectSourceTestResult> {
    return this.service.test(dto.id);
  }

  /** 拉取源站分类，写入映射并自动匹配。 */
  @Post('fetch-categories')
  fetchCategories(@Body() dto: IdDTO): Promise<FetchCategoriesResult> {
    return this.service.fetchCategories(dto.id);
  }

  /** 手动采集这个源站（异步启动，立即返回记录 id）。 */
  @Post('run')
  run(@Body() dto: RunDTO): Promise<StartResult> {
    return this.service.run(dto.id, dto.confirmEmpty === true, dto.rangeType);
  }
}

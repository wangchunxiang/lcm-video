import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { PlayLineEntity } from './play-line.entity';
import { PlayLineService } from './play-line.service';
import {
  CreatePlayLineDTO,
  SortPlayLineDTO,
  SwitchPlayLineDTO,
  UpdatePlayLineDTO,
} from './dto/play-line.dto';

/**
 * 全站线路：`@Crud()` 生成标准 REST（列表/详情/新建/修改/删除/批量删除），
 * 另外补两个本表专属动作：拖拽排序、批量启停。
 *
 * 注意：`@Crud()` 自带 `@Controller`，这个类不要再加 `@Controller` 装饰器；
 * 且必须暴露名为 `service` 的属性，路由处理器才能拿到它。
 */
@AppCrud({
  entity: PlayLineEntity,
  path: 'api/admin/play-line',
  dto: { create: CreatePlayLineDTO, update: UpdatePlayLineDTO },
})
export class PlayLineController {
  constructor(public readonly service: PlayLineService) {}

  @Post('sort')
  sort(@Body() dto: SortPlayLineDTO): Promise<{ updated: number }> {
    return this.service.sort(dto.ids);
  }

  @Post('switch')
  switchMany(@Body() dto: SwitchPlayLineDTO): Promise<{ updated: number }> {
    return this.service.switchMany(dto.ids, dto.isEnabled);
  }
}

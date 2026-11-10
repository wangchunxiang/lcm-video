import { Body, Post } from '@nestjs/common';
import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
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
@Crud({
  entity: PlayLineEntity,
  path: 'api/admin/play-line',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreatePlayLineDTO, update: UpdatePlayLineDTO },
  messages: {
    deleted: '线路已删除',
    noItemsToDelete: '没有要删除的线路',
  },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
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

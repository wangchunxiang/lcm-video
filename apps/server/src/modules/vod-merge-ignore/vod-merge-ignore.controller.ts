import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { VodMergeIgnoreService } from './vod-merge-ignore.service';
import {
  VodMergeIgnoreAllDTO as AllDTO,
  VodMergeIgnoreByKeysDTO as ByKeysDTO,
  VodMergeIgnoreCreateDTO as CreateDTO,
  VodMergeIgnoreDeleteDTO as DeleteDTO,
  VodMergeIgnoreGetDTO as GetDTO,
  VodMergeIgnorePageDTO as PageDTO,
  VodMergeIgnoreToggleDTO as ToggleDTO,
  VodMergeIgnoreUpdateDTO as UpdateDTO,
} from './dto/vod-merge-ignore';

@Controller('api/admin/vod-merge-ignore')
export class VodMergeIgnoreController {
  constructor(private readonly ignores: VodMergeIgnoreService) {}

  @Post('create')
  create(@Body(new ZodValidationPipe(CreateDTO)) dto: CreateDTO) {
    return this.ignores.create(dto);
  }

  @Post('update')
  update(@Body(new ZodValidationPipe(UpdateDTO)) dto: UpdateDTO) {
    return this.ignores.update(dto);
  }

  @Post('delete')
  remove(@Body(new ZodValidationPipe(DeleteDTO)) dto: DeleteDTO) {
    return this.ignores.delete(dto);
  }

  @Post('get')
  get(@Body(new ZodValidationPipe(GetDTO)) dto: GetDTO) {
    return this.ignores.get(dto);
  }

  @Post('page')
  page(@Body(new ZodValidationPipe(PageDTO)) dto: PageDTO) {
    return this.ignores.page(dto);
  }

  @Post('all')
  all(@Body(new ZodValidationPipe(AllDTO)) dto: AllDTO) {
    return this.ignores.all(dto);
  }

  @Post('toggle')
  toggle(@Body(new ZodValidationPipe(ToggleDTO)) dto: ToggleDTO) {
    return this.ignores.toggle(dto);
  }

  @Post('by-keys')
  byKeys(@Body(new ZodValidationPipe(ByKeysDTO)) dto: ByKeysDTO) {
    return this.ignores.byKeys(dto);
  }
}

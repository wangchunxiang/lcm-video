import {
  Controller,
  Post,
} from '@nestjs/common';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  VodMergeIgnoreService,
} from './vod-merge-ignore.service';

import {
  VodMergeIgnoreAllDTO,
  VodMergeIgnoreByKeysDTO,
  VodMergeIgnoreCreateDTO,
  VodMergeIgnoreDeleteDTO,
  VodMergeIgnoreGetDTO,
  VodMergeIgnorePageDTO,
  VodMergeIgnoreToggleDTO,
  VodMergeIgnoreUpdateDTO,
} from './dto/vod-merge-ignore';

@Controller('api/admin/vod-merge-ignore')
export class VodMergeIgnoreController {
  constructor(private readonly ignores: VodMergeIgnoreService) {}

  @Post('create')
  create(@ZodBody(VodMergeIgnoreCreateDTO) dto: VodMergeIgnoreCreateDTO) {
    return this.ignores.create(dto);
  }

  @Post('update')
  update(@ZodBody(VodMergeIgnoreUpdateDTO) dto: VodMergeIgnoreUpdateDTO) {
    return this.ignores.update(dto);
  }

  @Post('delete')
  remove(@ZodBody(VodMergeIgnoreDeleteDTO) dto: VodMergeIgnoreDeleteDTO) {
    return this.ignores.delete(dto);
  }

  @Post('get')
  get(@ZodBody(VodMergeIgnoreGetDTO) dto: VodMergeIgnoreGetDTO) {
    return this.ignores.get(dto);
  }

  @Post('page')
  page(@ZodBody(VodMergeIgnorePageDTO) dto: VodMergeIgnorePageDTO) {
    return this.ignores.page(dto);
  }

  @Post('all')
  all(@ZodBody(VodMergeIgnoreAllDTO) dto: VodMergeIgnoreAllDTO) {
    return this.ignores.all(dto);
  }

  @Post('toggle')
  toggle(@ZodBody(VodMergeIgnoreToggleDTO) dto: VodMergeIgnoreToggleDTO) {
    return this.ignores.toggle(dto);
  }

  @Post('by-keys')
  byKeys(@ZodBody(VodMergeIgnoreByKeysDTO) dto: VodMergeIgnoreByKeysDTO) {
    return this.ignores.byKeys(dto);
  }
}

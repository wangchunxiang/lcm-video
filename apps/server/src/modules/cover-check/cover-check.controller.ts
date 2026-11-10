import {
  Controller,
  Post,
} from '@nestjs/common';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  CoverCheckService,
} from './cover-check.service';

import {
  CoverCheckAllDTO,
  CoverCheckClearDTO,
  CoverCheckCreateDTO,
  CoverCheckDeleteDTO,
  CoverCheckGetDTO,
  CoverCheckHostVodsDTO,
  CoverCheckPageDTO,
  CoverCheckRepairDTO,
  CoverCheckScanDTO,
  CoverCheckUpdateDTO,
} from './dto/cover-check';

@Controller('api/admin/cover-check')
export class CoverCheckController {
  constructor(private readonly checks: CoverCheckService) {}

  @Post('create')
  create(@ZodBody(CoverCheckCreateDTO) dto: CoverCheckCreateDTO) {
    return this.checks.create(dto);
  }

  @Post('update')
  update(@ZodBody(CoverCheckUpdateDTO) dto: CoverCheckUpdateDTO) {
    return this.checks.update(dto);
  }

  @Post('delete')
  remove(@ZodBody(CoverCheckDeleteDTO) dto: CoverCheckDeleteDTO) {
    return this.checks.delete(dto);
  }

  @Post('get')
  get(@ZodBody(CoverCheckGetDTO) dto: CoverCheckGetDTO) {
    return this.checks.get(dto);
  }

  @Post('page')
  page(@ZodBody(CoverCheckPageDTO) dto: CoverCheckPageDTO) {
    return this.checks.page(dto);
  }

  @Post('all')
  all(@ZodBody(CoverCheckAllDTO) dto: CoverCheckAllDTO) {
    return this.checks.all(dto);
  }

  /** 图片检查页的域名列表（影片数实时统计 + 上次检查结果） */
  @Post('hosts')
  hosts() {
    return this.checks.hosts();
  }

  /** 检查一个域名或全部域名 */
  @Post('scan')
  scan(@ZodBody(CoverCheckScanDTO) dto: CoverCheckScanDTO) {
    return this.checks.scan(dto);
  }

  /** 清空某域名下的封面 */
  @Post('clear')
  clear(@ZodBody(CoverCheckClearDTO) dto: CoverCheckClearDTO) {
    return this.checks.clear(dto);
  }

  /** 修复某域名下的封面 */
  @Post('repair')
  repair(@ZodBody(CoverCheckRepairDTO) dto: CoverCheckRepairDTO) {
    return this.checks.repair(dto);
  }

  /** 某域名下的影片，供换封面/清空前预览 */
  @Post('host-vods')
  hostVods(@ZodBody(CoverCheckHostVodsDTO) dto: CoverCheckHostVodsDTO) {
    return this.checks.hostVods(dto);
  }
}

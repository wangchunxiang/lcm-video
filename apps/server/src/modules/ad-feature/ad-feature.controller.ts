import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdFeatureService } from './ad-feature.service';
import {
  AdFeatureAllDTO as AllDTO,
  AdFeatureBySourceDTO as BySourceDTO,
  AdFeatureCreateDTO as CreateDTO,
  AdFeatureDeleteDTO as DeleteDTO,
  AdFeatureGetDTO as GetDTO,
  AdFeaturePageDTO as PageDTO,
  AdFeatureUpdateDTO as UpdateDTO,
} from './dto/ad-feature';

@Controller('api/admin/ad-feature')
export class AdFeatureController {
  constructor(private readonly features: AdFeatureService) {}

  @Post('create')
  create(@Body(new ZodValidationPipe(CreateDTO)) dto: CreateDTO) {
    return this.features.create(dto);
  }

  @Post('update')
  update(@Body(new ZodValidationPipe(UpdateDTO)) dto: UpdateDTO) {
    return this.features.update(dto);
  }

  @Post('delete')
  remove(@Body(new ZodValidationPipe(DeleteDTO)) dto: DeleteDTO) {
    return this.features.delete(dto);
  }

  @Post('get')
  get(@Body(new ZodValidationPipe(GetDTO)) dto: GetDTO) {
    return this.features.get(dto);
  }

  @Post('page')
  page(@Body(new ZodValidationPipe(PageDTO)) dto: PageDTO) {
    return this.features.page(dto);
  }

  @Post('all')
  all(@Body(new ZodValidationPipe(AllDTO)) dto: AllDTO) {
    return this.features.all(dto);
  }

  @Post('by-source')
  bySource(@Body(new ZodValidationPipe(BySourceDTO)) dto: BySourceDTO) {
    return this.features.bySource(dto);
  }
}

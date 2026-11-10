import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { AdFeatureEntity } from './ad-feature.entity';

@Injectable()
export class AdFeatureService extends AppCrudService<AdFeatureEntity> {
  constructor(@InjectRepository(AdFeatureEntity) repository: Repository<AdFeatureEntity>) {
    super(repository);
  }
}

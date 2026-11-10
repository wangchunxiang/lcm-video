import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { SourceRuleEntity } from './source-rule.entity';

@Injectable()
export class SourceRuleService extends AppCrudService<SourceRuleEntity> {
  constructor(@InjectRepository(SourceRuleEntity) repository: Repository<SourceRuleEntity>) {
    super(repository);
  }
}

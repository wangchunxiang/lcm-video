import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CollectTaskLogEntity } from './collect-task-log.entity';

@Injectable()
export class CollectTaskLogService extends AppCrudService<CollectTaskLogEntity> {
  constructor(@InjectRepository(CollectTaskLogEntity) repository: Repository<CollectTaskLogEntity>) {
    super(repository);
  }
}

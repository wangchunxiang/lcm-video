import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CollectTaskLogDetailEntity } from './collect-task-log-detail.entity';

@Injectable()
export class CollectTaskLogDetailService extends AppCrudService<CollectTaskLogDetailEntity> {
  constructor(@InjectRepository(CollectTaskLogDetailEntity) repository: Repository<CollectTaskLogDetailEntity>) {
    super(repository);
  }
}

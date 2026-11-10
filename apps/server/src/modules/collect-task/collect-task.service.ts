import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CollectTaskEntity } from './collect-task.entity';

@Injectable()
export class CollectTaskService extends AppCrudService<CollectTaskEntity> {
  constructor(@InjectRepository(CollectTaskEntity) repository: Repository<CollectTaskEntity>) {
    super(repository);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CollectSourceEntity } from './collect-source.entity';

@Injectable()
export class CollectSourceService extends AppCrudService<CollectSourceEntity> {
  constructor(@InjectRepository(CollectSourceEntity) repository: Repository<CollectSourceEntity>) {
    super(repository);
  }
}

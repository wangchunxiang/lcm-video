import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CollectSourceCategoryEntity } from './collect-source-category.entity';

@Injectable()
export class CollectSourceCategoryService extends AppCrudService<CollectSourceCategoryEntity> {
  constructor(@InjectRepository(CollectSourceCategoryEntity) repository: Repository<CollectSourceCategoryEntity>) {
    super(repository);
  }
}

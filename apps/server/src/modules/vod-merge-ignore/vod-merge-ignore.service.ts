import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { VodMergeIgnoreEntity } from './vod-merge-ignore.entity';

@Injectable()
export class VodMergeIgnoreService extends AppCrudService<VodMergeIgnoreEntity> {
  constructor(@InjectRepository(VodMergeIgnoreEntity) repository: Repository<VodMergeIgnoreEntity>) {
    super(repository);
  }
}

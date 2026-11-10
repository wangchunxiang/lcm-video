import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CoverCheckEntity } from './cover-check.entity';

@Injectable()
export class CoverCheckService extends AppCrudService<CoverCheckEntity> {
  constructor(@InjectRepository(CoverCheckEntity) repository: Repository<CoverCheckEntity>) {
    super(repository);
  }
}

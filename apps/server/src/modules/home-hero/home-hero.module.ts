import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeHeroEntity } from './home-hero.entity';
import { HomeHeroController } from './home-hero.controller';
import { HomeHeroService } from './home-hero.service';

@Module({
  imports: [TypeOrmModule.forFeature([HomeHeroEntity])],
  controllers: [HomeHeroController],
  providers: [HomeHeroService],
  exports: [HomeHeroService],
})
export class HomeHeroModule {}

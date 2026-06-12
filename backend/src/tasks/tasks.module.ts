import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [AuthModule, CloudinaryModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}

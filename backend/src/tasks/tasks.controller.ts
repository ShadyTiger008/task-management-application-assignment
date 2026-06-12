import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UsePipes } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskSchema, CreateTaskDto, UpdateTaskSchema, UpdateTaskDto, GetTasksQuerySchema, GetTasksQueryDto } from './tasks.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(CreateTaskSchema))
  async create(@CurrentUser() user: any, @Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(user.id, createTaskDto);
  }

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    // Validate and parse query parameters manually inside the method
    // to allow optional/defaults to parse cleanly from strings
    const parsedQuery = GetTasksQuerySchema.parse(query);
    return this.tasksService.findAll(user.id, parsedQuery);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tasksService.findOne(user.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTaskSchema)) updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.id, id, updateTaskDto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tasksService.remove(user.id, id);
  }
}

import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UsePipes, HttpCode, HttpStatus, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TasksService } from './tasks.service';
import { CreateTaskSchema, CreateTaskDto, UpdateTaskSchema, UpdateTaskDto, GetTasksQuerySchema, GetTasksQueryDto, GenerateDescriptionSchema, GenerateDescriptionDto } from './tasks.dto';
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

  @Post('generate-description')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(GenerateDescriptionSchema))
  async generateDescription(@Body() dto: GenerateDescriptionDto) {
    return this.tasksService.generateDescription(dto.title);
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

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.tasksService.uploadAttachment(user.id, id, file);
  }

  @Delete(':id/attachments/:attachmentId')
  async deleteAttachment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.tasksService.deleteAttachment(user.id, id, attachmentId);
  }
}

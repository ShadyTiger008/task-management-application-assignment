import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto, GetTasksQueryDto } from './tasks.dto';
import { Task, TaskPriority, TaskStatus } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status ?? TaskStatus.PENDING,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        dueDate: dto.dueDate,
        userId,
      },
    });
  }

  async findAll(userId: string, query: GetTasksQueryDto) {
    const { status, priority, search, sortBy, sortOrder, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build standard Prisma filters
    const where: any = { userId };

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    if (search) {
      where.title = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // Get total count for pagination
    const total = await this.prisma.task.count({ where });

    let tasks: Task[];

    // If sorting by priority, we need custom ordering because HIGH, MEDIUM, LOW is not alphabetical
    if (sortBy === 'priority') {
      // We can use a raw SQL query or fetch and sort in memory if appropriate,
      // but to preserve pagination in the database, we can use prisma.$queryRaw.
      // To prevent SQL injection, we build the query with raw SQL parameters.
      const statusFilter = status ? status : null;
      const priorityFilter = priority ? priority : null;
      const searchPattern = search ? `%${search}%` : null;

      // Define order CASE statement
      // asc: LOW (1), MEDIUM (2), HIGH (3)
      // desc: HIGH (1), MEDIUM (2), LOW (3)
      const orderCase = sortOrder === 'asc'
        ? `CASE WHEN "priority"::text = 'LOW' THEN 1 WHEN "priority"::text = 'MEDIUM' THEN 2 WHEN "priority"::text = 'HIGH' THEN 3 ELSE 4 END ASC`
        : `CASE WHEN "priority"::text = 'HIGH' THEN 1 WHEN "priority"::text = 'MEDIUM' THEN 2 WHEN "priority"::text = 'LOW' THEN 3 ELSE 4 END ASC`;

      // Build the raw query with dynamic filters
      // Note: We use queryRawUnsafe since we need to inject the ORDER BY clause dynamically,
      // but we parameterize the filters to prevent SQL injection.
      const queryStr = `
        SELECT * FROM "Task"
        WHERE "userId" = $1
          AND ($2::text IS NULL OR "status"::text = $2)
          AND ($3::text IS NULL OR "priority"::text = $3)
          AND ($4::text IS NULL OR "title" ILIKE $4)
        ORDER BY ${orderCase}, "createdAt" DESC
        LIMIT $5 OFFSET $6
      `;

      tasks = await this.prisma.$queryRawUnsafe<Task[]>(
        queryStr,
        userId,
        statusFilter,
        priorityFilter,
        searchPattern,
        limit,
        skip,
      );
    } else {
      // Standard sorting for dueDate or createdAt
      tasks = await this.prisma.task.findMany({
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      });
    }

    return {
      tasks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(userId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    return task;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(userId, id);

    return this.prisma.task.update({
      where: { id: task.id },
      data: {
        title: dto.title !== undefined ? dto.title : undefined,
        description: dto.description !== undefined ? dto.description : undefined,
        status: dto.status !== undefined ? dto.status : undefined,
        priority: dto.priority !== undefined ? dto.priority : undefined,
        dueDate: dto.dueDate !== undefined ? dto.dueDate : undefined,
      },
    });
  }

  async remove(userId: string, id: string) {
    const task = await this.findOne(userId, id);
    await this.prisma.task.delete({
      where: { id: task.id },
    });
    return { message: 'Task deleted successfully' };
  }
}

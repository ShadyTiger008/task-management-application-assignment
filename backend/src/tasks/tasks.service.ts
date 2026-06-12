import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateTaskDto, UpdateTaskDto, GetTasksQueryDto } from './tasks.dto';
import { Task, TaskPriority, TaskStatus, Attachment } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async logActivity(
    userId: string,
    taskId: string,
    taskTitle: string,
    action: string,
    changes: string,
  ) {
    try {
      await this.prisma.activityLog.create({
        data: {
          taskId,
          taskTitle,
          userId,
          action,
          changes,
        },
      });
    } catch (err) {
      console.error('Failed to log activity:', err);
    }
  }

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status ?? TaskStatus.PENDING,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        dueDate: dto.dueDate,
        userId,
      },
    });

    await this.logActivity(
      userId,
      task.id,
      task.title,
      'CREATE',
      `Task created: "${task.title}". Status: ${task.status}, Priority: ${task.priority}.`,
    );

    return task;
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

      // Batch load attachments for raw SQL results
      if (tasks.length > 0) {
        const taskIds = tasks.map((t) => t.id);
        const attachments = await this.prisma.attachment.findMany({
          where: { taskId: { in: taskIds } },
        });
        tasks = tasks.map((t) => ({
          ...t,
          attachments: attachments.filter((a) => a.taskId === t.id),
        })) as any;
      }
    } else {
      // Standard sorting for dueDate or createdAt
      tasks = await this.prisma.task.findMany({
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          attachments: true,
        },
        skip,
        take: limit,
      }) as any;
    }

    return {
      tasks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAllAdmin(query: GetTasksQueryDto) {
    const { status, priority, search, userId, sortBy, sortOrder, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

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

    if (userId) {
      where.userId = userId;
    }

    const total = await this.prisma.task.count({ where });

    let tasks: Task[];

    if (sortBy === 'priority') {
      const statusFilter = status ? status : null;
      const priorityFilter = priority ? priority : null;
      const searchPattern = search ? `%${search}%` : null;
      const userFilter = userId ? userId : null;

      const orderCase = sortOrder === 'asc'
        ? `CASE WHEN t."priority"::text = 'LOW' THEN 1 WHEN t."priority"::text = 'MEDIUM' THEN 2 WHEN t."priority"::text = 'HIGH' THEN 3 ELSE 4 END ASC`
        : `CASE WHEN t."priority"::text = 'HIGH' THEN 1 WHEN t."priority"::text = 'MEDIUM' THEN 2 WHEN t."priority"::text = 'LOW' THEN 3 ELSE 4 END ASC`;

      const queryStr = `
        SELECT t.*, u."name" as "userName", u."email" as "userEmail"
        FROM "Task" t
        JOIN "User" u ON t."userId" = u."id"
        WHERE ($1::text IS NULL OR t."status"::text = $1)
          AND ($2::text IS NULL OR t."priority"::text = $2)
          AND ($3::text IS NULL OR t."title" ILIKE $3)
          AND ($6::text IS NULL OR t."userId" = $6)
        ORDER BY ${orderCase}, t."createdAt" DESC
        LIMIT $4 OFFSET $5
      `;

      tasks = await this.prisma.$queryRawUnsafe<any[]>(
        queryStr,
        statusFilter,
        priorityFilter,
        searchPattern,
        limit,
        skip,
        userFilter,
      );

      if (tasks.length > 0) {
        const taskIds = tasks.map((t) => t.id);
        const attachments = await this.prisma.attachment.findMany({
          where: { taskId: { in: taskIds } },
        });
        tasks = tasks.map((t) => ({
          ...t,
          user: {
            id: t.userId,
            name: (t as any).userName,
            email: (t as any).userEmail,
          },
          attachments: attachments.filter((a) => a.taskId === t.id),
        })) as any;
      }
    } else {
      tasks = await this.prisma.task.findMany({
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          attachments: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
        skip,
        take: limit,
      }) as any;
    }

    return {
      tasks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(userId: string, id: string, userRole?: string): Promise<any> {
    const where: any = { id };
    if (userRole !== 'ADMIN') {
      where.userId = userId;
    }
    const task = await this.prisma.task.findFirst({
      where,
      include: {
        attachments: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    return task;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto, userRole?: string): Promise<Task> {
    const task = await this.findOne(userId, id, userRole);

    const changesList: string[] = [];
    if (dto.title !== undefined && dto.title !== task.title) {
      changesList.push(`Title changed from "${task.title}" to "${dto.title}"`);
    }
    if (dto.description !== undefined && dto.description !== task.description) {
      changesList.push(`Description updated`);
    }
    if (dto.status !== undefined && dto.status !== task.status) {
      changesList.push(`Status changed from ${task.status} to ${dto.status}`);
    }
    if (dto.priority !== undefined && dto.priority !== task.priority) {
      changesList.push(`Priority changed from ${task.priority} to ${dto.priority}`);
    }
    if (dto.dueDate !== undefined) {
      const oldDate = task.dueDate ? new Date(task.dueDate).toISOString() : null;
      const newDate = dto.dueDate ? new Date(dto.dueDate).toISOString() : null;
      if (oldDate !== newDate) {
        changesList.push(`Due date updated`);
      }
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        title: dto.title !== undefined ? dto.title : undefined,
        description: dto.description !== undefined ? dto.description : undefined,
        status: dto.status !== undefined ? dto.status : undefined,
        priority: dto.priority !== undefined ? dto.priority : undefined,
        dueDate: dto.dueDate !== undefined ? dto.dueDate : undefined,
      },
    });

    if (changesList.length > 0) {
      await this.logActivity(
        userId,
        task.id,
        updatedTask.title,
        'UPDATE',
        changesList.join(', '),
      );
    }

    return updatedTask;
  }

  async remove(userId: string, id: string, userRole?: string) {
    const task = await this.findOne(userId, id, userRole);
    await this.prisma.task.delete({
      where: { id: task.id },
    });

    await this.logActivity(
      userId,
      task.id,
      task.title,
      'DELETE',
      `Task deleted: "${task.title}"`,
    );

    return { message: 'Task deleted successfully' };
  }

  async generateDescription(title: string): Promise<{ description: string }> {
    const prompt = `You are a professional task planner. Generate a clear, concise, and actionable description/checklist for a task with the title: "${title}".
Provide only the description. Do not include any intro, outro, conversational text, formatting characters like markdown backticks, or titles. Just output the task description itself. Maximum 3-4 sentences or a clean bulleted list.`;

    const groqKey = this.configService.get<string>('GROQ_API_KEY');
    const openRouterKey = this.configService.get<string>('OPENROUTER_API_KEY');

    // 1. Try Groq
    if (groqKey) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 300,
          }),
        });

        if (response.ok) {
          const data = await response.json() as any;
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            return { description: content.trim() };
          }
        } else {
          console.warn(`Groq API responded with status ${response.status}`);
        }
      } catch (err) {
        console.warn('Failed to generate description with Groq API, attempting fallback...', err);
      }
    }

    // 2. Try OpenRouter (Fallback)
    if (openRouterKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterKey}`,
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Task Management App',
          },
          body: JSON.stringify({
            model: 'google/gemma-4-31b-it:free',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 300,
          }),
        });

        if (response.ok) {
          const data = await response.json() as any;
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            return { description: content.trim() };
          }
        } else {
          console.warn(`OpenRouter API responded with status ${response.status}`);
        }
      } catch (err) {
        console.warn('Failed to generate description with OpenRouter API', err);
      }
    }

    throw new InternalServerErrorException(
      'AI Description generation failed. Please ensure your API keys are configured and try again.',
    );
  }

  async uploadAttachment(userId: string, taskId: string, file: Express.Multer.File, userRole?: string): Promise<Attachment> {
    // Check if task exists and belongs to user
    const task = await this.findOne(userId, taskId, userRole);

    const uploadResult = await this.cloudinaryService.uploadFile(file, 'task_attachments');

    const attachment = await this.prisma.attachment.create({
      data: {
        name: file.originalname,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        taskId,
      },
    });

    await this.logActivity(
      userId,
      taskId,
      task.title,
      'ATTACHMENT_ADD',
      `Attachment added: "${file.originalname}"`,
    );

    return attachment;
  }

  async deleteAttachment(userId: string, taskId: string, attachmentId: string, userRole?: string) {
    // Check if task exists and belongs to user
    const task = await this.findOne(userId, taskId, userRole);

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, taskId },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment with ID "${attachmentId}" not found for this task`);
    }

    if (attachment.publicId) {
      try {
        await this.cloudinaryService.deleteFile(attachment.publicId);
      } catch (err) {
        console.error('Failed to delete from Cloudinary:', err);
      }
    }

    await this.prisma.attachment.delete({
      where: { id: attachmentId },
    });

    await this.logActivity(
      userId,
      taskId,
      task.title,
      'ATTACHMENT_DELETE',
      `Attachment deleted: "${attachment.name}"`,
    );

    return { message: 'Attachment deleted successfully' };
  }

  async findTaskActivity(userId: string, taskId: string, userRole?: string) {
    await this.findOne(userId, taskId, userRole);

    return this.prisma.activityLog.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async findAdminActivity() {
    return this.prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }
}

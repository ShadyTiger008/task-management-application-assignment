import { z } from 'zod';
import { TaskStatus, TaskPriority } from '@prisma/client';

export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(1000).optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional().default(TaskStatus.PENDING),
  priority: z.nativeEnum(TaskPriority).optional().default(TaskPriority.MEDIUM),
  dueDate: z
    .string()
    .datetime({ message: 'dueDate must be a valid ISO-8601 date string' })
    .optional()
    .nullable()
    .or(z.date().optional().nullable())
    .transform((val) => (val ? new Date(val) : null)),
});

export const UpdateTaskSchema = CreateTaskSchema.partial();

export const GetTasksQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['dueDate', 'priority', 'createdAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
});

export class CreateTaskDto {
  title!: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
}

export class UpdateTaskDto {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
}

export type GetTasksQueryDto = z.infer<typeof GetTasksQuerySchema>;

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/context/auth-context";
import { apiRequest } from "~/utils/api-client";
import { z } from "zod";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  createdAt: string;
}

const taskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().max(1000, "Description must be less than 1000 characters").optional().nullable(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  dueDate: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val).toISOString() : null)),
});

export default function HomePage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Filter & pagination state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"dueDate" | "priority" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal & Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStatus, setTaskStatus] = useState<"PENDING" | "IN_PROGRESS" | "COMPLETED">("PENDING");
  const [taskPriority, setTaskPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [taskDueDate, setTaskDueDate] = useState("");
  
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsTasksLoading(true);
    setTasksError(null);

    try {
      const data = await apiRequest<{
        tasks: Task[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>("/tasks", {
        method: "GET",
        params: {
          search,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          sortBy,
          sortOrder,
          page,
          limit,
        },
      });

      setTasks(data.tasks);
      setTotalTasks(data.total);
      setTotalPages(data.totalPages);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load tasks.";
      setTasksError(message);
    } finally {
      setIsTasksLoading(false);
    }
  }, [isAuthenticated, search, statusFilter, priorityFilter, sortBy, sortOrder, page, limit]);

  // Trigger task fetch on filter changes
  useEffect(() => {
    fetchTasks().catch(console.error);
  }, [fetchTasks]);

  // Handle Search Input Change (Debounced/Instantly)
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handlePriorityFilterChange = (priority: string) => {
    setPriorityFilter(priority);
    setPage(1);
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  // Open Create Modal
  const openCreateModal = () => {
    setModalMode("create");
    setEditingTaskId(null);
    setTaskTitle("");
    setTaskDescription("");
    setTaskStatus("PENDING");
    setTaskPriority("MEDIUM");
    setTaskDueDate("");
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (task: Task) => {
    setModalMode("edit");
    setEditingTaskId(task.id);
    setTaskTitle(task.title);
    setTaskDescription(task.description ?? "");
    setTaskStatus(task.status);
    setTaskPriority(task.priority);
    setTaskDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] ?? "" : "");
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Submit Modal Form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setIsFormSubmitting(true);

    const rawData = {
      title: taskTitle,
      description: taskDescription || null,
      status: taskStatus,
      priority: taskPriority,
      dueDate: taskDueDate || null,
    };

    try {
      // Client-side validation
      taskSchema.parse(rawData);

      if (modalMode === "create") {
        await apiRequest<Task>("/tasks", {
          method: "POST",
          body: JSON.stringify(rawData),
        });
      } else {
        await apiRequest<Task>(`/tasks/${editingTaskId}`, {
          method: "PATCH",
          body: JSON.stringify(rawData),
        });
      }

      setIsModalOpen(false);
      await fetchTasks();
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const errorsMap: Record<string, string> = {};
        err.errors.forEach((validationError) => {
          if (validationError.path[0]) {
            errorsMap[validationError.path[0] as string] = validationError.message;
          }
        });
        setFormErrors(errorsMap);
      } else {
        const message = err instanceof Error ? err.message : "Failed to save task.";
        setFormErrors({ form: message });
      }
    } finally {
      setIsFormSubmitting(false);
    }
  };

  // Generate description with AI based on title
  const generateDescriptionWithAi = async () => {
    if (!taskTitle.trim()) return;
    setIsGeneratingDescription(true);
    setFormErrors((prev) => ({ ...prev, description: "" }));

    try {
      const data = await apiRequest<{ description: string }>("/tasks/generate-description", {
        method: "POST",
        body: JSON.stringify({ title: taskTitle }),
      });
      setTaskDescription(data.description);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate description.";
      setFormErrors((prev) => ({ ...prev, description: message }));
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  // Delete Task
  const handleDeleteTask = async (id: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      await apiRequest<{ message: string }>(`/tasks/${id}`, {
        method: "DELETE",
      });
      await fetchTasks();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete task.";
      alert(message);
    }
  };

  // Quick Toggle Task Completion
  const handleToggleComplete = async (task: Task) => {
    const newStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    try {
      await apiRequest<Task>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchTasks();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update task status.";
      alert(message);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      {/* Glows */}
      <div className="absolute top-0 right-1/4 h-96 w-96 rounded-full bg-indigo-600/5 blur-3xl"></div>
      <div className="absolute top-1/2 left-1/4 h-96 w-96 rounded-full bg-emerald-600/5 blur-3xl"></div>

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-900 pb-6 mb-8">
          <div>
            <span className="text-2xl font-extrabold tracking-tight text-white">
              Task<span className="text-indigo-400">Flow</span>
            </span>
            <p className="text-slate-400 text-sm mt-1">
              Welcome back, <span className="text-slate-200 font-semibold">{user?.name}</span>
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all transform hover:-translate-y-[1px] active:translate-y-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Task
            </button>
            <button
              onClick={() => logout()}
              className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-900 hover:text-white transition-all"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Filters and Controls */}
        <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {/* Search */}
            <div className="relative md:col-span-2">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search tasks by title..."
                value={search}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
              >
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div>
              <select
                value={priorityFilter}
                onChange={(e) => handlePriorityFilterChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
              >
                <option value="">All Priorities</option>
                <option value="LOW">Low Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="HIGH">High Priority</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center justify-between border-t border-slate-900/50 mt-4 pt-4">
            <div className="flex flex-wrap gap-2 text-sm text-slate-400">
              <span className="font-medium">Sort by:</span>
              <button
                onClick={() => setSortBy("createdAt")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  sortBy === "createdAt"
                    ? "bg-indigo-500/10 text-indigo-400 font-semibold"
                    : "hover:text-slate-200"
                }`}
              >
                Date Created
              </button>
              <button
                onClick={() => setSortBy("dueDate")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  sortBy === "dueDate"
                    ? "bg-indigo-500/10 text-indigo-400 font-semibold"
                    : "hover:text-slate-200"
                }`}
              >
                Due Date
              </button>
              <button
                onClick={() => setSortBy("priority")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  sortBy === "priority"
                    ? "bg-indigo-500/10 text-indigo-400 font-semibold"
                    : "hover:text-slate-200"
                }`}
              >
                Priority
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleSortOrder}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg transition-all"
              >
                <span>Order:</span>
                <span className="font-semibold text-indigo-400">{sortOrder.toUpperCase()}</span>
                {sortOrder === "asc" ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Task List Container */}
        {tasksError && (
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-center text-rose-400 mb-6">
            {tasksError}
          </div>
        )}

        {isTasksLoading ? (
          <div className="space-y-4">
            {[...Array<number>(3)].map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-900/30 border border-slate-900 rounded-2xl p-6 h-28"></div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-900/20 border border-dashed border-slate-900 rounded-2xl py-16 px-4 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-300">No tasks found</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              {search || statusFilter || priorityFilter
                ? "No tasks match your current filter settings. Try resetting them."
                : "Get started by creating your very first task!"}
            </p>
            {!search && !statusFilter && !priorityFilter && (
              <button
                onClick={openCreateModal}
                className="mt-6 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-all"
              >
                Create Task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const isCompleted = task.status === "COMPLETED";
              return (
                <div
                  key={task.id}
                  className={`group bg-slate-900/40 border border-slate-900 rounded-2xl p-5 hover:border-slate-800 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isCompleted ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => handleToggleComplete(task)}
                      className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                        isCompleted
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-slate-700 hover:border-indigo-500"
                      }`}
                    >
                      {isCompleted && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <div>
                      <h4 className={`text-base font-bold text-slate-100 ${isCompleted ? "line-through text-slate-500" : ""}`}>
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className={`text-sm text-slate-400 mt-1 max-w-2xl ${isCompleted ? "line-through text-slate-600" : ""}`}>
                          {task.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 items-center mt-3">
                        {/* Status badge */}
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                            task.status === "COMPLETED"
                              ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                              : task.status === "IN_PROGRESS"
                              ? "bg-amber-500/5 border-amber-500/20 text-amber-400"
                              : "bg-rose-500/5 border-rose-500/20 text-rose-400"
                          }`}
                        >
                          {task.status.replace("_", " ")}
                        </span>

                        {/* Priority badge */}
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                            task.priority === "HIGH"
                              ? "bg-rose-500/5 border-rose-500/20 text-rose-400"
                              : task.priority === "MEDIUM"
                              ? "bg-amber-500/5 border-amber-500/20 text-amber-400"
                              : "bg-blue-500/5 border-blue-500/20 text-blue-400"
                          }`}
                        >
                          {task.priority}
                        </span>

                        {/* Due Date badge */}
                        {task.dueDate && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Task Action Buttons */}
                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={() => openEditModal(task)}
                      className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-850 hover:border-slate-750 rounded-xl transition-all"
                      title="Edit task"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 text-slate-400 hover:text-rose-400 bg-slate-900 border border-slate-850 hover:border-rose-900/30 rounded-xl transition-all"
                      title="Delete task"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-900 mt-6 pt-6">
            <div className="text-sm text-slate-400">
              Showing page <span className="font-semibold text-slate-200">{page}</span> of{" "}
              <span className="font-semibold text-slate-200">{totalPages}</span> ({totalTasks} total tasks)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-slate-900 rounded-xl bg-slate-900/20 hover:bg-slate-900 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-slate-900 rounded-xl bg-slate-900/20 hover:bg-slate-900 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task Creation & Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>

          {/* Modal Content */}
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 overflow-hidden">
            <h3 className="text-xl font-bold text-slate-100">
              {modalMode === "create" ? "Create New Task" : "Edit Task"}
            </h3>

            {formErrors.form && (
              <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-400">
                {formErrors.form}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Title</label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className={`mt-1 block w-full rounded-xl border bg-slate-950/80 px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm ${
                    formErrors.title ? "border-rose-500/50" : "border-slate-800"
                  }`}
                  placeholder="Complete frontend assignment..."
                />
                {formErrors.title && <p className="mt-1 text-xs text-rose-400">{formErrors.title}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-300">Description</label>
                  <button
                    type="button"
                    onClick={generateDescriptionWithAi}
                    disabled={isGeneratingDescription || !taskTitle.trim()}
                    className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none"
                    title={!taskTitle.trim() ? "Please enter a task title first" : "Generate task description using AI"}
                  >
                    {isGeneratingDescription ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border border-indigo-400 border-t-transparent"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 animate-pulse text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Generate with AI
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  rows={3}
                  className={`mt-1 block w-full rounded-xl border bg-slate-950/80 px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm ${
                    formErrors.description ? "border-rose-500/50" : "border-slate-800"
                  }`}
                  placeholder={!taskTitle.trim() ? "Enter a title to unlock AI generation, or write details here..." : "Task details..."}
                />
                {formErrors.description && <p className="mt-1 text-xs text-rose-400">{formErrors.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300">Status</label>
                  <select
                    value={taskStatus}
                    onChange={(e) => setTaskStatus(e.target.value as "PENDING" | "IN_PROGRESS" | "COMPLETED")}
                    className="mt-1 block w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
                    className="mt-1 block w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">Due Date</label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-850 hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isFormSubmitting}
                  className="flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
                >
                  {isFormSubmitting ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  ) : modalMode === "create" ? (
                    "Create Task"
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

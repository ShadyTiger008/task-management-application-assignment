"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/context/auth-context";
import { apiRequest } from "~/utils/api-client";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "~/utils/cn";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Calendar } from "~/components/ui/calendar";
import { useTheme } from "next-themes";

interface Attachment {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  createdAt: string;
  attachments?: Attachment[];
}

const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().max(1000, "Description must be less than 1000 characters").optional().nullable(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  dueDate: z.date().optional().nullable(),
});

export default function HomePage() {
  const { user, isAuthenticated, isLoading, logout, updateProfile, generateAvatar, uploadAvatar } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
  
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Profile settings state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [isProfileUpdating, setIsProfileUpdating] = useState(false);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const openProfileModal = () => {
    setProfileName(user?.name ?? "");
    setProfileError(null);
    setIsProfileModalOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      setProfileError("Name is required");
      return;
    }
    setIsProfileUpdating(true);
    setProfileError(null);
    try {
      await updateProfile(profileName);
      setIsProfileModalOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update profile";
      setProfileError(message);
    } finally {
      setIsProfileUpdating(false);
    }
  };

  const handleGenerateAvatar = async () => {
    setIsGeneratingAvatar(true);
    setProfileError(null);
    try {
      await generateAvatar();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate avatar";
      setProfileError(message);
    } finally {
      setIsGeneratingAvatar(false);
    }
  };

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileError("Image size must be less than 5MB.");
      return;
    }

    setIsUploadingAvatar(true);
    setProfileError(null);
    try {
      await uploadAvatar(file);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload avatar.";
      setProfileError(message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Task attachments state
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const currentEditingTask = tasks.find((t) => t.id === editingTaskId);

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTaskId) return;

    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError("File size must be less than 10MB.");
      return;
    }

    setIsUploadingAttachment(true);
    setAttachmentError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      await apiRequest(`/tasks/${editingTaskId}/attachments`, {
        method: "POST",
        body: formData,
      });

      await fetchTasks();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload attachment.";
      setAttachmentError(message);
    } finally {
      setIsUploadingAttachment(false);
      e.target.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!editingTaskId || !confirm("Are you sure you want to delete this attachment?")) return;

    setAttachmentError(null);
    try {
      await apiRequest(`/tasks/${editingTaskId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });

      await fetchTasks();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete attachment.";
      setAttachmentError(message);
    }
  };

  // React Hook Form setup
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "PENDING",
      priority: "MEDIUM",
      dueDate: null,
    },
  });

  const taskTitle = watch("title");
  const watchedDueDate = watch("dueDate");

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

  // Handle Search Input Change
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
    reset({
      title: "",
      description: "",
      status: "PENDING",
      priority: "MEDIUM",
      dueDate: null,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (task: Task) => {
    setModalMode("edit");
    setEditingTaskId(task.id);
    reset({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? new Date(task.dueDate) : null,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Submit Modal Form
  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setFormErrors({});
    setIsFormSubmitting(true);

    const payload = {
      ...data,
      dueDate: data.dueDate ? data.dueDate.toISOString() : null,
    };

    try {
      if (modalMode === "create") {
        await apiRequest<Task>("/tasks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest<Task>(`/tasks/${editingTaskId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      setIsModalOpen(false);
      await fetchTasks();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save task.";
      setFormErrors({ form: message });
    } finally {
      setIsFormSubmitting(false);
    }
  };

  // Generate description with AI based on title
  const generateDescriptionWithAi = async () => {
    if (!taskTitle?.trim()) return;
    setIsGeneratingDescription(true);
    setFormErrors((prev) => ({ ...prev, description: "" }));

    try {
      const data = await apiRequest<{ description: string }>("/tasks/generate-description", {
        method: "POST",
        body: JSON.stringify({ title: taskTitle }),
      });
      setValue("description", data.description);
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      {/* Glows */}
      <div className="absolute top-0 right-1/4 h-96 w-96 rounded-full bg-indigo-600/5 blur-3xl opacity-50 dark:opacity-100"></div>
      <div className="absolute top-1/2 left-1/4 h-96 w-96 rounded-full bg-emerald-600/5 blur-3xl opacity-50 dark:opacity-100"></div>

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-900 pb-6 mb-8">
          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-10 w-10 rounded-full object-cover border border-slate-200 dark:border-slate-800 shadow-inner"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-indigo-600/10 dark:bg-indigo-600/25 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-base shadow-inner">
                {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
              </div>
            )}
            <div>
              <span className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Task<span className="text-indigo-600 dark:text-indigo-400">Flow</span>
              </span>
              <p className="text-slate-550 dark:text-slate-400 text-sm mt-0.5">
                Welcome back,{" "}
                <button
                  onClick={openProfileModal}
                  className="text-slate-800 dark:text-slate-200 font-semibold hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-all cursor-pointer text-left focus:outline-none"
                >
                  {user?.name}
                </button>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 sm:gap-3 items-center">
            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
              title="Toggle theme"
            >
              {mounted && theme === "dark" ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              onClick={openProfileModal}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/45 dark:bg-slate-900/40 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-550 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
            <button
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all transform hover:-translate-y-[1px] active:translate-y-0 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Task
            </button>
            <button
              onClick={() => logout()}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/45 dark:bg-slate-900/40 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Filters and Controls */}
        <section className="bg-white/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-900 rounded-2xl p-4 mb-6 transition-all duration-200">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {/* Search */}
            <div className="relative md:col-span-2">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search tasks by title..."
                value={search}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm cursor-pointer"
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
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm cursor-pointer"
              >
                <option value="">All Priorities</option>
                <option value="LOW">Low Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="HIGH">High Priority</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center justify-between border-t border-slate-200 dark:border-slate-900/50 mt-4 pt-4">
            <div className="flex flex-wrap gap-2 text-sm text-slate-550 dark:text-slate-400">
              <span className="font-medium self-center">Sort by:</span>
              <button
                onClick={() => setSortBy("createdAt")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  sortBy === "createdAt"
                    ? "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 font-semibold"
                    : "hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                Date Created
              </button>
              <button
                onClick={() => setSortBy("dueDate")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  sortBy === "dueDate"
                    ? "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 font-semibold"
                    : "hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                Due Date
              </button>
              <button
                onClick={() => setSortBy("priority")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  sortBy === "priority"
                    ? "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 font-semibold"
                    : "hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                Priority
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleSortOrder}
                className="flex items-center gap-1 text-sm text-slate-550 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                <span>Order:</span>
                <span className="font-semibold text-indigo-650 dark:text-indigo-400">{sortOrder.toUpperCase()}</span>
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
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white/40 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-900 rounded-2xl p-6 h-28"></div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-white/40 dark:bg-slate-900/20 border border-dashed border-slate-200 dark:border-slate-900 rounded-2xl py-16 px-4 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-400 dark:text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No tasks found</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              {search || statusFilter || priorityFilter
                ? "No tasks match your current filter settings. Try resetting them."
                : "Get started by creating your very first task!"}
            </p>
            {!search && !statusFilter && !priorityFilter && (
              <button
                onClick={openCreateModal}
                className="mt-6 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-all cursor-pointer"
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
                  className={`group bg-white/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-900 rounded-2xl p-5 hover:border-slate-300 dark:hover:border-slate-800 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isCompleted ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => handleToggleComplete(task)}
                      className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all cursor-pointer ${
                        isCompleted
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-slate-300 dark:border-slate-700 hover:border-indigo-500"
                      }`}
                    >
                      {isCompleted && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <div>
                      <h4 className={`text-base font-bold text-slate-900 dark:text-slate-100 ${isCompleted ? "line-through text-slate-400 dark:text-slate-500" : ""}`}>
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className={`text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl ${isCompleted ? "line-through text-slate-400/85 dark:text-slate-600" : ""}`}>
                          {task.description}
                        </p>
                      )}
                      {task.attachments && task.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 pb-1">
                          {task.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-250/50 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all font-medium"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-405 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              <span className="max-w-[140px] truncate">{att.name}</span>
                            </a>
                          ))}
                        </div>
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
                      className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 hover:border-slate-300 dark:hover:border-slate-750 rounded-xl transition-all cursor-pointer"
                      title="Edit task"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 hover:border-rose-300 dark:hover:border-rose-900/30 rounded-xl transition-all cursor-pointer"
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
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-900 mt-6 pt-6">
            <div className="text-sm text-slate-550 dark:text-slate-400">
              Showing page <span className="font-semibold text-slate-800 dark:text-slate-200">{page}</span> of{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">{totalPages}</span> ({totalTasks} total tasks)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-slate-200 dark:border-slate-900 rounded-xl bg-white dark:bg-slate-900/20 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-slate-200 dark:border-slate-900 rounded-xl bg-white dark:bg-slate-900/20 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
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
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-hidden">
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {modalMode === "create" ? "Create New Task" : "Edit Task"}
            </h3>

            {formErrors.form && (
              <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-600 dark:text-rose-400">
                {formErrors.form}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Title</label>
                <input
                  type="text"
                  {...register("title")}
                  className={cn(
                    "block w-full rounded-xl border bg-white dark:bg-slate-950/80 px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm",
                    errors.title ? "border-rose-500/50 focus:ring-rose-500" : "border-slate-200 dark:border-slate-800"
                  )}
                  placeholder="Complete frontend assignment..."
                />
                {errors.title && <p className="mt-1 text-xs text-rose-500 dark:text-rose-400 font-medium">{errors.title.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Description</label>
                  <button
                    type="button"
                    onClick={generateDescriptionWithAi}
                    disabled={isGeneratingDescription || !taskTitle?.trim()}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none cursor-pointer"
                    title={!taskTitle?.trim() ? "Please enter a task title first" : "Generate task description using AI"}
                  >
                    {isGeneratingDescription ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 animate-pulse text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Generate with AI
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  {...register("description")}
                  rows={3}
                  className={cn(
                    "block w-full rounded-xl border bg-white dark:bg-slate-950/80 px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm",
                    errors.description ? "border-rose-500/50 focus:ring-rose-500" : "border-slate-200 dark:border-slate-800"
                  )}
                  placeholder={!taskTitle?.trim() ? "Enter a title to unlock AI generation, or write details here..." : "Task details..."}
                />
                {errors.description && <p className="mt-1 text-xs text-rose-500 dark:text-rose-400 font-medium">{errors.description.message}</p>}
                {formErrors.description && <p className="mt-1 text-xs text-rose-500 dark:text-rose-400 font-medium">{formErrors.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Status</label>
                  <select
                    {...register("status")}
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/80 px-3 py-2.5 text-slate-700 dark:text-slate-355 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm cursor-pointer"
                  >
                    <option value="PENDING" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-300">Pending</option>
                    <option value="IN_PROGRESS" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-300">In Progress</option>
                    <option value="COMPLETED" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-300">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Priority</label>
                  <select
                    {...register("priority")}
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/80 px-3 py-2.5 text-slate-700 dark:text-slate-355 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm cursor-pointer"
                  >
                    <option value="LOW" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-300">Low</option>
                    <option value="MEDIUM" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-300">Medium</option>
                    <option value="HIGH" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-300">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Due Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/80 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 transition-all hover:bg-slate-100 dark:hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer",
                        !watchedDueDate && "text-slate-400 dark:text-slate-500"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        {watchedDueDate ? format(watchedDueDate, "PPP") : "Pick a date"}
                      </span>
                      {watchedDueDate && (
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            setValue("dueDate", null);
                          }}
                          className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 px-1 cursor-pointer"
                        >
                          Clear
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={watchedDueDate ?? undefined}
                      onSelect={(date) => setValue("dueDate", date ?? null)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {modalMode === "edit" && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-4 mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Attachments</label>
                    <button
                      type="button"
                      onClick={() => document.getElementById("attachment-input")?.click()}
                      disabled={isUploadingAttachment}
                      className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold transition-all disabled:opacity-40 cursor-pointer"
                    >
                      {isUploadingAttachment ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Add File
                        </>
                      )}
                    </button>
                    <input
                      type="file"
                      id="attachment-input"
                      className="hidden"
                      onChange={handleUploadAttachment}
                    />
                  </div>

                  {attachmentError && (
                    <p className="text-xs text-rose-500 dark:text-rose-450 font-medium bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">{attachmentError}</p>
                  )}

                  {currentEditingTask?.attachments && currentEditingTask.attachments.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {currentEditingTask.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 text-sm"
                        >
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-slate-755 dark:text-slate-300 hover:text-indigo-650 dark:hover:text-indigo-400 hover:underline truncate"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            <span className="truncate max-w-[240px] font-medium">{att.name}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer"
                            title="Delete attachment"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 dark:text-slate-500 italic bg-slate-50 dark:bg-slate-950 p-3 text-center rounded-xl border border-slate-200 dark:border-slate-850">No attachments uploaded yet.</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-650 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isFormSubmitting}
                  className="flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50 cursor-pointer"
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

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-80 p-6 shadow-2xl shadow-black/10 dark:shadow-black/80 transition-all duration-200">
            {/* Decorative Glows */}
            <div className="absolute top-0 right-0 h-48 w-48 rounded-full bg-indigo-500/5 dark:bg-indigo-500/10 blur-3xl"></div>
            <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-emerald-500/5 dark:bg-emerald-500/10 blur-3xl"></div>

            <div className="relative z-10">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-850 pb-4 mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Profile Settings</h2>
                <button
                  onClick={() => setIsProfileModalOpen(false)}
                  className="rounded-lg p-1 text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-80 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Profile Info Form */}
              <div className="space-y-6">
                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-4">
                  <div 
                    onClick={() => document.getElementById("avatar-upload-input")?.click()}
                    className="relative group cursor-pointer"
                    title="Click to upload a custom image"
                  >
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="h-24 w-24 rounded-full object-cover border-2 border-slate-200 dark:border-slate-80 shadow-md transition-all group-hover:scale-105 group-hover:brightness-75"
                      />
                    ) : (
                      <div className="h-24 w-24 rounded-full bg-indigo-600/10 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-500/20 flex items-center justify-center font-bold text-3xl shadow-md transition-all group-hover:scale-105 group-hover:brightness-90">
                        {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </div>

                  <input
                    type="file"
                    id="avatar-upload-input"
                    className="hidden"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => document.getElementById("avatar-upload-input")?.click()}
                      disabled={isUploadingAvatar || isGeneratingAvatar}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-white bg-slate-100 dark:bg-slate-80 hover:bg-slate-200 dark:hover:bg-slate-75 active:bg-slate-300 dark:active:bg-slate-80 border border-slate-200 dark:border-slate-70 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploadingAvatar ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-slate-700 dark:text-white" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Upload Photo
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleGenerateAvatar}
                      disabled={isUploadingAvatar || isGeneratingAvatar}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-white bg-slate-100 dark:bg-slate-80 hover:bg-slate-200 dark:hover:bg-slate-75 active:bg-slate-300 dark:active:bg-slate-80 border border-slate-200 dark:border-slate-70 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGeneratingAvatar ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-slate-700 dark:text-white" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Unsplash Avatar
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Name Field */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-450">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                    placeholder="Enter your name"
                  />
                </div>

                {/* Email (Read Only) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-450">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={user?.email ?? ""}
                    readOnly
                    className="w-full px-4 py-2.5 bg-slate-100/55 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-90 rounded-xl text-slate-500 cursor-not-allowed text-sm focus:outline-none"
                  />
                </div>

                {profileError && (
                  <p className="text-xs font-medium text-red-650 dark:text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                    {profileError}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 justify-end border-t border-slate-200 dark:border-slate-850 pt-4 mt-6">
                  <button
                    onClick={() => setIsProfileModalOpen(false)}
                    className="rounded-xl border border-slate-200 dark:border-slate-80 bg-white dark:bg-slate-950 px-4 py-2 text-sm font-medium text-slate-650 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-90 hover:text-slate-900 dark:hover:text-slate-200 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={isProfileUpdating}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProfileUpdating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

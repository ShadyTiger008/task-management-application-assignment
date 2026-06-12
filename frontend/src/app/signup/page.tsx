"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "~/context/auth-context";
import { z } from "zod";

const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

export default function SignupPage() {
  const { signup, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setApiError(null);
    setIsSubmitting(true);

    try {
      // Client-side validation
      signupSchema.parse({ name, email, password });

      await signup(name, email, password);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.errors.forEach((validationError) => {
          if (validationError.path[0]) {
            fieldErrors[validationError.path[0] as string] = validationError.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        const message = err instanceof Error ? err.message : "Failed to create account. Email may already be registered.";
        setApiError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-12 sm:px-6 lg:px-8 transition-colors duration-200">
      {/* Background Gradients */}
      <div className="absolute top-0 right-1/4 h-72 w-72 rounded-full bg-indigo-500/5 dark:bg-indigo-500/10 blur-3xl"></div>
      <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-emerald-500/5 dark:bg-emerald-500/10 blur-3xl"></div>

      <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Task<span className="text-indigo-600 dark:text-indigo-400">Flow</span>
          </span>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Create a new account
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
          Or{" "}
          <Link href="/login" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors">
            sign in to your existing account
          </Link>
        </p>
      </div>

      <div className="relative z-10 mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 px-4 py-8 shadow-2xl rounded-2xl sm:px-10">
          {apiError && (
            <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-600 dark:text-rose-400">
              {apiError}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Full Name
              </label>
              <div className="mt-1">
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`block w-full rounded-xl border bg-white dark:bg-slate-950/80 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    errors.name ? "border-rose-500/50" : "border-slate-200 dark:border-slate-800 focus:border-indigo-500"
                  }`}
                  placeholder="John Doe"
                />
                {errors.name && <p className="mt-1 text-xs text-rose-500 dark:text-rose-400">{errors.name}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`block w-full rounded-xl border bg-white dark:bg-slate-950/80 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    errors.email ? "border-rose-500/50" : "border-slate-200 dark:border-slate-800 focus:border-indigo-500"
                  }`}
                  placeholder="you@example.com"
                />
                {errors.email && <p className="mt-1 text-xs text-rose-500 dark:text-rose-400">{errors.email}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`block w-full rounded-xl border bg-white dark:bg-slate-950/80 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    errors.password ? "border-rose-500/50" : "border-slate-200 dark:border-slate-800 focus:border-indigo-500"
                  }`}
                  placeholder="••••••••"
                />
                {errors.password && <p className="mt-1 text-xs text-rose-500 dark:text-rose-400">{errors.password}</p>}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:-translate-y-[1px] active:translate-y-0"
              >
                {isSubmitting ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  "Create Account"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

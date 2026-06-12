"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "~/utils/api-client";

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  generateAvatar: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check for existing session
    const storedUser = localStorage.getItem("user");
    const accessToken = localStorage.getItem("accessToken");

    if (storedUser && accessToken) {
      try {
        setUser(JSON.parse(storedUser) as User);
      } catch {
        localStorage.removeItem("user");
        localStorage.removeItem("accessToken");
      }
    }
    setIsLoading(false);
  }, []);

  interface AuthResponse {
    user: User;
    accessToken: string;
  }

  const login = async (email: string, password: string) => {
    const data = await apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("accessToken", data.accessToken);
    setUser(data.user);
    router.push("/");
  };

  const signup = async (name: string, email: string, password: string) => {
    const data = await apiRequest<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });

    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("accessToken", data.accessToken);
    setUser(data.user);
    router.push("/");
  };

  const logout = async () => {
    try {
      await apiRequest<{ message: string }>("/auth/logout", {
        method: "POST",
      });
    } catch (e) {
      console.error("Failed logout request to API", e);
    } finally {
      localStorage.removeItem("user");
      localStorage.removeItem("accessToken");
      setUser(null);
      router.push("/login");
    }
  };

  const updateProfile = async (name: string) => {
    const data = await apiRequest<User>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
  };

  const generateAvatar = async () => {
    const data = await apiRequest<{ avatarUrl: string }>("/auth/profile/avatar/generate", {
      method: "POST",
    });
    if (user) {
      const updatedUser = { ...user, avatarUrl: data.avatarUrl };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        updateProfile,
        generateAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

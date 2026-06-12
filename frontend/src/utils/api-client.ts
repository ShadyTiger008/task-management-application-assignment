import { config } from "~/config";

const API_URL = config.apiUrl;

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiError extends Error {
  status: number;
  errors?: unknown;

  constructor(message: string, status: number, errors?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

interface RefreshResponse {
  accessToken: string;
}

interface ErrorResponse {
  message?: string;
  errors?: unknown;
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function handleTokenRefresh(): Promise<string> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  const data = (await response.json()) as RefreshResponse;
  localStorage.setItem("accessToken", data.accessToken);
  return data.accessToken;
}

export async function apiRequest<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers, ...rest } = options;

  let url = `${API_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  // Append query params if any
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const getHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const defaultHeaders: Record<string, string> = {};

    if (!(options.body instanceof FormData)) {
      defaultHeaders["Content-Type"] = "application/json";
    }

    if (token) {
      defaultHeaders.Authorization = `Bearer ${token}`;
    }

    return {
      ...defaultHeaders,
      ...headers,
    };
  };

  const executeRequest = async (): Promise<Response> => {
    return fetch(url, {
      ...rest,
      headers: getHeaders(),
      credentials: "include",
    });
  };

  let response = await executeRequest();

  // If unauthorized, attempt token refresh
  if (
    response.status === 401 &&
    typeof window !== "undefined" &&
    localStorage.getItem("accessToken") &&
    !endpoint.includes("/auth/login") &&
    !endpoint.includes("/auth/signup") &&
    !endpoint.includes("/auth/refresh")
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const newAccessToken = await handleTokenRefresh();
        isRefreshing = false;
        onRefreshed(newAccessToken);
        response = await executeRequest();
      } catch {
        isRefreshing = false;
        onRefreshed("");
        // Refresh failed, clear tokens and redirect
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        window.location.href = "/login?expired=true";
        throw new ApiError("Session expired. Please log in again.", 401);
      }
    } else {
      // Wait for refresh to finish if concurrent requests are running
      const retryPromise = new Promise<Response>((resolve, reject) => {
        subscribeTokenRefresh((token) => {
          if (!token) {
            reject(new ApiError("Session expired. Please log in again.", 401));
          } else {
            resolve(executeRequest());
          }
        });
      });

      response = await retryPromise;
    }
  }

  const responseText = await response.text();
  let data: ErrorResponse;
  try {
    data = (responseText ? JSON.parse(responseText) : {}) as ErrorResponse;
  } catch {
    data = { message: responseText };
  }

  if (!response.ok) {
    throw new ApiError(
      data.message ?? "Something went wrong",
      response.status,
      data.errors
    );
  }

  return data as unknown as T;
}

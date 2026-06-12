# Task Management Application (Full-Stack Assessment)

A full-stack task management application with a NestJS (TypeScript) backend and Next.js frontend, backed by a PostgreSQL database with Prisma ORM.

This repository is organized as a unified codebase with both backend and frontend directories sharing a single Git history.

---

## 🏗️ Project Architecture

```
task-management-application/
├── backend/            # NestJS Application
│   ├── prisma/         # Prisma configuration & migrations
│   ├── src/            # NestJS source code (Auth, Tasks, Prisma, Pipes)
│   └── test/           # Integration/E2E test suites
└── frontend/           # Next.js Application (Next 15 + React 19)
```

---

## 🔒 Authentication & Session Management

This project implements a **hybrid database-backed JWT authentication system** to combine stateless JWT benefits with stateful session management capabilities.

### Key Features
1. **Short-Lived Access Tokens**: Emitted JWTs expire in 15 minutes.
2. **Long-Lived Refresh Tokens**: Used to exchange for a new access token without re-entering credentials.
3. **Database-Backed Session Check**: Both access and refresh tokens are stored in the database. When a request is made:
   - The token's signature is verified.
   - The token's existence in the database is verified. This allows support for instant remote logouts (single device or all devices).
4. **Race-Condition Mitigation**: When refreshing tokens, the server generates a new access token but returns the *same* refresh token. This prevents front-end concurrent requests from invalidating overlapping requests.
5. **Session Bloat Prevention**: Before issuing new tokens, the database is pruned of user access tokens older than 1 hour.

---

## 🗄️ Database Schema (PostgreSQL with Prisma)

The database schema defines three primary models and two session-related tracking tables:

### User
- `id` (UUID, Primary Key)
- `name` (String)
- `email` (String, Unique)
- `password` (String, Hashed using bcryptjs)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

### UserToken (Access Session)
- `id` (UUID, Primary Key)
- `token` (String, Active JWT access token)
- `userId` (UUID, Foreign Key cascade on User delete)
- `createdAt` (DateTime)

### UserRefreshToken (Refresh Session)
- `id` (UUID, Primary Key)
- `token` (String, Active JWT refresh token)
- `expiresAt` (DateTime)
- `userId` (UUID, Foreign Key cascade on User delete)
- `createdAt` (DateTime)

### Task
- `id` (UUID, Primary Key)
- `title` (String)
- `description` (String, Optional)
- `status` (Enum: `PENDING`, `IN_PROGRESS`, `COMPLETED`)
- `priority` (Enum: `LOW`, `MEDIUM`, `HIGH`)
- `dueDate` (DateTime, Optional)
- `userId` (UUID, Foreign Key cascade on User delete)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

---

## 🚀 Backend API Endpoints

All write and read endpoints (except signup/login/refresh) are protected by the `JwtAuthGuard` and database presence checks.

### Authentication
* `POST /auth/signup` - Register a new user
* `POST /auth/login` - Authenticate user & return tokens
* `POST /auth/refresh` - Refresh access token (using the same refresh token)
* `POST /auth/logout` - Logout from current device session (removes active access/refresh tokens)
* `POST /auth/logout-all` - Logout from all active device sessions (wipes all user tokens)

### Tasks (Protected)
* `POST /tasks` - Create a task
* `GET /tasks` - List authenticated user's tasks
  * **Filtering**: `status` (`PENDING`, `IN_PROGRESS`, `COMPLETED`), `priority` (`LOW`, `MEDIUM`, `HIGH`)
  * **Sorting**: `sortBy` (`dueDate`, `priority`, `createdAt`) & `sortOrder` (`asc`, `desc`)
    * *Custom Priority Sorting*: Tasks sorted by `priority` use a PostgreSQL custom `CASE` structure (e.g. HIGH -> MEDIUM -> LOW or vice versa).
  * **Search**: Case-insensitive title search via `search` query parameter.
  * **Pagination**: Paginated queries using `page` and `limit` query parameters.
* `GET /tasks/:id` - Fetch details for a specific task (ownership-protected)
* `PATCH /tasks/:id` - Partially update a task (ownership-protected)
* `DELETE /tasks/:id` - Delete a task (ownership-protected)

---

## 🛠️ Getting Started (Backend Setup)

### Prerequisites
- Node.js (v18+)
- pnpm (Recommended)
- PostgreSQL database instance

### Setup Steps
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Copy the `.env.example` file to `.env` and fill in your details:
   ```bash
   cp .env.example .env
   ```
   Ensure both `DB_CONNECTION` and `DATABASE_URL` point to your PostgreSQL instance.
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Run migrations to initialize the database tables:
   ```bash
   pnpm prisma migrate dev --name init
   ```
5. Generate the Prisma client:
   ```bash
   pnpm prisma generate
   ```
6. Start the development server:
   ```bash
   pnpm run start:dev
   ```
   The backend will run on `http://localhost:3001` (or `PORT` specified in `.env`).

### Running Tests
To run unit and integration tests:
```bash
pnpm run test
```
This runs the unit tests verifying authentication, token generation, password hashing, and token revocation.

---

## 💻 Getting Started (Frontend Setup)

### Prerequisites
- Node.js (v18+)
- pnpm (Recommended)

### Setup Steps
1. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Set your target backend API URL in `.env` (defaults to local port 3001, or you can use the production URL):
   ```env
   NEXT_PUBLIC_API_URL="http://localhost:3001"
   ```
4. Install dependencies:
   ```bash
   pnpm install
   ```
5. Start the frontend development server:
   ```bash
   pnpm run dev
   ```
   The frontend will run on `http://localhost:3000`.

---

## 🌟 Advanced & Bonus Features Implemented

1. **AI-Powered Task Description Generation (Groq/OpenRouter)**
   - Integrated AI description generation. When creating or editing a task, users can input a title and click "Generate with AI" to generate a description.
   - Built with fallback support: primary calls target Groq's API (`llama-3.3-70b-versatile`), and fall back automatically to OpenRouter (`google/gemma-4-31b-it:free`) if needed.
2. **Unsplash-Powered Random Avatar Generation**
   - Users can update their names or dynamically generate random profile avatars via Unsplash (`https://api.unsplash.com/photos/random`) directly in the Profile Settings panel.
3. **Persistent Dark Mode**
   - Integrated `next-themes` and configured class-based light/dark theme toggling with Tailwind CSS v4.
   - Designed a fluid theme-toggle widget in the Header, preserving users' theme preferences between page loads.
4. **Transparent Silent Token Refresh Retry Queue**
   - Implemented a custom API client interceptor. If an access token expires (15 mins), the first request receiving a `401 Unauthorized` halts, triggers a silent refresh using the `HttpOnly` refresh token cookie, and re-executes automatically.
   - Intercepted requests running concurrently are queued and executed transparently once the refresh resolves, preventing user interruption.

---

## 🧠 Assumptions & Trade-offs

1. **Backend Framework (NestJS over Go)**
   - *Decision*: Next.js was selected for the frontend and NestJS (Node.js/TypeScript) for the backend.
   - *Rationale*: A TypeScript backend allows the reuse of types, validation constraints, and schema structures between the client and server. NestJS provides a solid, modular structure (similar to Angular) that makes dependency injection, interceptors, guards, and piping robust and easy to verify.
2. **Database Driver Adapter for Serverless/Edge Readiness**
   - *Decision*: Configured Prisma Client with a PostgreSQL driver adapter (`@prisma/adapter-pg`) rather than standard TCP bindings.
   - *Rationale*: Prepares the backend for serverless environments and connection pooling safety.
3. **Session Cookie Isolation (`HttpOnly` Refresh Token)**
   - *Decision*: Stored access tokens in the frontend memory/localStorage and kept refresh tokens in secure `HttpOnly` cookies.
   - *Rationale*: Significantly reduces XSS exposure for persistent sessions. The frontend only handles the access token explicitly, and the refresh API is securely triggered via cookies.
4. **Custom Priority Sorting**
   - *Decision*: Sorted priority (`LOW`, `MEDIUM`, `HIGH`) using custom SQL expressions instead of simple string sorting.
   - *Rationale*: Keeps order logical in the database layer rather than sorting client-side, making page queries consistent.

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

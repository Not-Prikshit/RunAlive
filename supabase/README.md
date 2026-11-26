# Supabase Database Setup Guide for RunAlive

This guide covers how to set up and connect your Supabase database with the **RunAlive** server.

---

## Option 1: Quick Setup via Supabase Web Dashboard (Easiest)

1. **Create or Open Your Supabase Project:**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard) and create a new project (e.g. `RunAlive`).

2. **Execute Database Migrations:**
   - In your project's left sidebar, click **SQL Editor**.
   - Click **+ New Query**.
   - Copy the contents of [`supabase/migrations/20261125000000_init_runalive.sql`](file:///C:/RunAlive/supabase/migrations/20261125000000_init_runalive.sql) and paste into the editor.
   - Click **Run** (or `Ctrl+Enter`).
   - *This creates all tables, PostGIS extensions, geometry/geography indices, and foreign keys.*

3. **(Optional) Seed Demo Users:**
   - In the **SQL Editor**, open another query tab.
   - Copy the contents of [`supabase/seed.sql`](file:///C:/RunAlive/supabase/seed.sql) and paste into the editor.
   - Click **Run**.
   - *This provisions the 3 demo users (`demo@runalive.test`, `runner@runalive.test`, `seeker@runalive.test` with password `RunAlive2026!`).*

4. **Retrieve Database Connection String:**
   - Go to **Project Settings** (gear icon) -> **Database**.
   - Under **Connection string**, select **URI** or **Transaction pooler / Session pooler (Node.js)**:
     ```text
     postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require
     ```
     *(Or direct port 5432: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require`)*

5. **Update Server `.env`:**
   - Open [`apps/server/.env`](file:///C:/RunAlive/apps/server/.env) and update `DATABASE_URL`:
     ```env
     DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require"
     ```

---

## Option 2: Automated CLI Setup (Supabase CLI or `pnpm db:migrate`)

You can also run migrations directly from your terminal:

```bash
# In the apps/server directory:
cd apps/server

# Set your Supabase connection string in apps/server/.env:
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require"

# Run migrations:
pnpm db:migrate

# Seed demo users:
pnpm db:seed
```

---

## Summary of Supabase Files Prepared

| File | Purpose |
| :--- | :--- |
| [`supabase/migrations/20261125000000_init_runalive.sql`](file:///C:/RunAlive/supabase/migrations/20261125000000_init_runalive.sql) | Full PostgreSQL + PostGIS schema migration script (13 tables, spatial indices, constraints). |
| [`supabase/seed.sql`](file:///C:/RunAlive/supabase/seed.sql) | Pre-hashed seed data creating Host, Runner, and Seeker demo accounts. |
| [`supabase/README.md`](file:///C:/RunAlive/supabase/README.md) | Step-by-step documentation for connecting RunAlive with Supabase. |

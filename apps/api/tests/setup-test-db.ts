import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";
import { PrismaClient } from "@prisma/client";

export interface IsolatedTestDb {
  prisma: PrismaClient;
  dbUrl: string;
  close: () => Promise<void>;
}

export async function setupIsolatedTestDatabase(port = 5433): Promise<IsolatedTestDb> {
  // If external PostgreSQL is specified and reachable, use it
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("127.0.0.1:5433")) {
    try {
      const prisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } },
      });
      await prisma.$connect();
      return {
        prisma,
        dbUrl: process.env.DATABASE_URL,
        close: async () => {
          await prisma.$disconnect();
        },
      };
    } catch {
      // Fallback to local isolated PGlite instance
    }
  }

  // Spin up an in-process PostgreSQL instance using PGlite
  const pg = new PGlite();
  const migrationsDir = fs.existsSync(path.resolve(process.cwd(), "prisma/migrations"))
    ? path.resolve(process.cwd(), "prisma/migrations")
    : path.resolve(process.cwd(), "apps/api/prisma/migrations");

  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  for (const folder of migrationFolders) {
    const sqlFile = path.join(migrationsDir, folder, "migration.sql");
    if (fs.existsSync(sqlFile)) {
      const sql = fs.readFileSync(sqlFile, "utf8");
      await pg.exec(sql);
    }
  }

  const server = createServer(pg);
  await new Promise<void>((resolve, reject) => {
    server.listen(port, () => resolve());
    server.on("error", reject);
  });

  const dbUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.DATABASE_URL = dbUrl;

  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });
  await prisma.$connect();

  return {
    prisma,
    dbUrl,
    close: async () => {
      await prisma.$disconnect();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

import { PrismaClient } from "@prisma/client";

// Global Prisma singleton
declare global {
  // eslint-disable-next-line no-var
  var prisma: any | undefined;
}

let realPrismaInstance: PrismaClient | null = null;

function getPrismaInstance(): any {
  if (globalThis.prisma) {
    return globalThis.prisma;
  }
  if (!realPrismaInstance) {
    realPrismaInstance = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            "postgresql://milestonepay:dev@localhost:5432/milestonepay_db",
        },
      },
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return realPrismaInstance;
}

// Dynamic proxy to support testing and custom delegates seamlessly
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    const instance = getPrismaInstance();
    const val = instance[prop];
    if (typeof val === "function") {
      return val.bind(instance);
    }
    return val;
  },
});

import "dotenv/config";

export const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  databaseUrl: process.env.DATABASE_URL || "postgres://dag:dag@localhost:5432/dag_engine",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || "4", 10),
  jwtSecret: process.env.JWT_SECRET || "change-me",
};

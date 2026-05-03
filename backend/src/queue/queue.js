import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const QUEUE_NAME = "dag-executions";
export const executionQueue = new Queue(QUEUE_NAME, { connection });
export const queueEvents = new QueueEvents(QUEUE_NAME, { connection });
export { connection as redisConnection };

export async function enqueueExecution(payload) {
  return executionQueue.add("execute", payload, {
    removeOnComplete: 1000,
    removeOnFail: 1000,
    attempts: 1, // retries are handled per-node by the engine, not the queue.
  });
}

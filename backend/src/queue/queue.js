import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { propagation, context } from "@opentelemetry/api";
import { config } from "../config.js";

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const QUEUE_NAME = "dag-executions";
export const executionQueue = new Queue(QUEUE_NAME, { connection });
export const queueEvents = new QueueEvents(QUEUE_NAME, { connection });
export { connection as redisConnection };

/**
 * Enqueue an execution. We inject the active OTel context onto the job
 * payload so the worker can attach the workflow.run span to whatever
 * trace fired this enqueue (typically a /graphs/:id/execute HTTP
 * request, but also a trigger or a workflow.fire spawn).
 *
 * Without this step Redis would discard the trace context (it carries
 * no headers), and every workflow.run would start a fresh detached
 * trace — useless for end-to-end debugging.
 */
export async function enqueueExecution(payload) {
  const otel = {};
  propagation.inject(context.active(), otel);
  return executionQueue.add(
    "execute",
    { ...payload, _otel: otel },
    {
      removeOnComplete: 1000,
      removeOnFail: 1000,
      attempts: 1, // retries are handled per-node by the engine, not the queue.
    },
  );
}

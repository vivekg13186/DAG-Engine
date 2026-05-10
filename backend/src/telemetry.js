// OpenTelemetry bootstrap.
//
// IMPORTANT: this file MUST be the very first import of any process that
// wants tracing. The auto-instrumentations work by hooking Node's module
// loader; modules imported BEFORE sdk.start() are not instrumented.
//
// Both `server.js` and `worker.js` import this at the top of their
// import list — that's enough to instrument pg, ioredis, undici (fetch),
// http, and express across the whole runtime without code changes.
//
// Custom span types (workflow.run, node.execute, plugin.<name>) are
// emitted from the engine's own files using `trace.getTracer(...)` —
// this file just sets up the SDK + exporters.
//
// Configuration (env vars):
//   OTEL_SERVICE_NAME              service name (default: "daisy-dag")
//   OTEL_EXPORTER_OTLP_ENDPOINT    OTLP/HTTP collector URL (e.g. http://localhost:4318).
//                                  When unset, the SDK keeps spans + drops them at shutdown
//                                  (cheap; no exporter traffic in dev). When set, traces
//                                  flow to the collector.
//   OTEL_LOG_LEVEL                 SDK's internal log level (debug | info | warn | error)
//   NODE_ENV                       used as deployment.environment

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]:
      process.env.OTEL_SERVICE_NAME || "daisy-dag",
    [SemanticResourceAttributes.SERVICE_VERSION]:
      process.env.npm_package_version || "0.1.0",
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
      process.env.NODE_ENV || "development",
  }),

  // Only wire an exporter when an endpoint is configured. Without one,
  // spans are still created (useful for unit tests / programmatic
  // inspection) but nothing leaves the process.
  traceExporter: endpoint
    ? new OTLPTraceExporter({ url: endpoint.replace(/\/$/, "") + "/v1/traces" })
    : undefined,

  instrumentations: [
    getNodeAutoInstrumentations({
      // The fs instrumentation is extremely noisy (every file read becomes
      // a span). Keep it off; we don't need that level of detail.
      "@opentelemetry/instrumentation-fs": { enabled: false },
      // Keep DNS off too — barely useful, lots of spans.
      "@opentelemetry/instrumentation-dns": { enabled: false },
    }),
  ],
});

sdk.start();

// Graceful flush on shutdown so in-flight spans aren't dropped. Both
// server.js and worker.js trap SIGTERM separately for their own cleanup;
// we hook in here too so this concern stays contained.
async function shutdown() {
  try { await sdk.shutdown(); } catch { /* swallow */ }
}
process.once("SIGTERM", shutdown);
process.once("SIGINT",  shutdown);

import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { trace, context } from "@opentelemetry/api";
import type { TelemetryConfig } from "./config";

let loggerProvider: LoggerProvider | null = null;

export function initLogs(config: TelemetryConfig): LoggerProvider {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
  });

  const processor = new BatchLogRecordProcessor(
    new OTLPLogExporter({
      url: `${config.endpoint}/v1/logs`,
      headers: config.apiKey ? { Authorization: config.apiKey } : undefined,
    }),
  );

  const provider = new LoggerProvider({
    resource,
    // Some browser builds of the OTel logs SDK expect processors in the constructor,
    // while older builds require addLogRecordProcessor() after construction.
    processors: [processor],
  } as LoggerProvider & { processors?: BatchLogRecordProcessor[] });

  const sharedState = (provider as { _sharedState?: { registeredLogRecordProcessors?: unknown[] } })._sharedState;
  if ((sharedState?.registeredLogRecordProcessors?.length ?? 0) === 0) {
    const addProcessor = (provider as { addLogRecordProcessor?: (p: BatchLogRecordProcessor) => void }).addLogRecordProcessor;
    if (typeof addProcessor === "function") {
      addProcessor.call(provider, processor);
    }
  }

  loggerProvider = provider;

  interceptConsoleErrors();

  return loggerProvider;
}

function interceptConsoleErrors() {
  const originalError = console.error;

  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);

    if (!loggerProvider) return;

    const logger = loggerProvider.getLogger("console");
    const activeSpan = trace.getSpan(context.active());

    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
      attributes: {
        "log.source": "console.error",
        ...(activeSpan
          ? {
              "trace.id": activeSpan.spanContext().traceId,
              "span.id": activeSpan.spanContext().spanId,
            }
          : {}),
      },
    });
  };
}

export function getLoggerProvider(): LoggerProvider | null {
  return loggerProvider;
}

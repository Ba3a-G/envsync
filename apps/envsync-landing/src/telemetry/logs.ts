import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { trace, context } from "@opentelemetry/api";
import type { TelemetryConfig } from "./config";

let loggerProvider: LoggerProvider | null = null;
let currentSurface: TelemetryConfig["surface"] = "landing";

function canAddLogRecordProcessor(
  provider: LoggerProvider,
): provider is LoggerProvider & {
  addLogRecordProcessor: (recordProcessor: BatchLogRecordProcessor) => void;
} {
  return typeof (provider as { addLogRecordProcessor?: unknown }).addLogRecordProcessor === "function";
}

export function initLogs(config: TelemetryConfig): LoggerProvider {
  currentSurface = config.surface;
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
  });

  if (canAddLogRecordProcessor(provider)) {
    provider.addLogRecordProcessor(processor);
  } else {
    console.warn("OpenTelemetry LoggerProvider does not support addLogRecordProcessor; browser log export disabled");
  }

  loggerProvider = provider;
  if (canAddLogRecordProcessor(provider)) {
    interceptConsoleErrors();
  }

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
        "envsync.event_name": "frontend_error",
        "envsync.event_category": "frontend_error",
        "envsync.surface": currentSurface,
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

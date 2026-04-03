#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const STACK_NAME = process.env.ENVSYNC_STACK_NAME ?? "envsync";
const ROOT_DOMAIN = process.env.ENVSYNC_ROOT_DOMAIN ?? "envsync.local";
const CLICKSTACK_SERVICE_NAME = `${STACK_NAME}_clickstack`;
const CLICKSTACK_API_URL = "http://127.0.0.1:8000/api/v2";
const SELFHOST_OPERATOR_EMAIL = process.env.ENVSYNC_CLICKSTACK_OPERATOR_EMAIL ?? `operator@${ROOT_DOMAIN}`;
const SELFHOST_OPERATOR_PASSWORD = process.env.ENVSYNC_CLICKSTACK_OPERATOR_PASSWORD ?? "";
const SELFHOST_DASHBOARD_ACCESS_KEY =
	process.env.ENVSYNC_CLICKSTACK_ACCESS_KEY ?? `envsync-selfhost-${ROOT_DOMAIN}-dashboard-access-key`;

function run(cmd, args) {
	return execFileSync(cmd, args, {
		stdio: ["ignore", "pipe", "pipe"],
		encoding: "utf8",
	}).trim();
}

function resolveClickstackContainerId() {
	const output = run("docker", [
		"ps",
		"--filter",
		`label=com.docker.swarm.service.name=${CLICKSTACK_SERVICE_NAME}`,
		"--format",
		"{{.ID}}",
	]);
	const containerId = output.split(/\r?\n/).map(line => line.trim()).find(Boolean);
	if (!containerId) {
		throw new Error(`Could not resolve running ClickStack container for service ${CLICKSTACK_SERVICE_NAME}`);
	}
	return containerId;
}

function runClickstackNodeScript(containerId, script) {
	const payload = Buffer.from(script, "utf8").toString("base64");
	return run("docker", [
		"exec",
		"-e",
		`HDX_SCRIPT=${payload}`,
		containerId,
		"node",
		"-e",
		"eval(Buffer.from(process.env.HDX_SCRIPT, 'base64').toString('utf8'))",
	]);
}

function runClickstackMongoScript(containerId, script) {
	const payload = Buffer.from(script, "utf8").toString("base64");
	return run("docker", [
		"exec",
		"-e",
		`HDX_SCRIPT=${payload}`,
		containerId,
		"sh",
		"-lc",
		"printf '%s' \"$HDX_SCRIPT\" | base64 -d >/tmp/hdx-bootstrap.js && mongo hyperdx --quiet /tmp/hdx-bootstrap.js",
	]);
}

function ensureSelfHostedBootstrap(containerId) {
	const output = runClickstackMongoScript(containerId, `
var now = new Date();
var accessKey = ${JSON.stringify(SELFHOST_DASHBOARD_ACCESS_KEY)};
var teamName = "EnvSync Self-Hosted Team";
var connectionName = "Default ClickHouse";

var team = db.teams.findOne({ name: teamName });
if (!team) {
  db.teams.insertOne({
    name: teamName,
    hookId: "envsync-selfhost-hook-id",
    apiKey: "envsync-selfhost-team-api-key",
    collectorAuthenticationEnforced: false,
    createdAt: now,
    updatedAt: now
  });
  team = db.teams.findOne({ name: teamName });
}

var connection = db.connections.findOne({ team: team._id, name: connectionName });
if (!connection) {
  db.connections.insertOne({
    team: team._id,
    name: connectionName,
    host: "http://ch-server:8123",
    username: "default",
    password: "",
    createdAt: now,
    updatedAt: now
  });
  connection = db.connections.findOne({ team: team._id, name: connectionName });
}

function ensureSource(name, kind, document) {
  var source = db.sources.findOne({ team: team._id, name: name });
  var baseDocument = Object.assign({}, document, {
    name: name,
    kind: kind,
    team: team._id,
    connection: connection._id,
    updatedAt: now
  });
  if (!source) {
    baseDocument.createdAt = now;
    db.sources.insertOne(baseDocument);
  } else {
    db.sources.updateOne({ _id: source._id }, { $set: baseDocument });
  }
  source = db.sources.findOne({ team: team._id, name: name });
  return source;
}

var traces = ensureSource("Traces", "trace", {
  from: { databaseName: "default", tableName: "otel_traces" },
  timestampValueExpression: "Timestamp",
  displayedTimestampValueExpression: "Timestamp",
  defaultTableSelectExpression: "Timestamp, ServiceName, SpanName, StatusCode",
  durationExpression: "Duration",
  durationPrecision: 9,
  serviceNameExpression: "ServiceName",
  traceIdExpression: "TraceId",
  spanIdExpression: "SpanId",
  parentSpanIdExpression: "ParentSpanId",
  spanNameExpression: "SpanName",
  spanKindExpression: "SpanKind",
  statusCodeExpression: "StatusCode",
  statusMessageExpression: "StatusMessage",
  eventAttributesExpression: "SpanAttributes",
  spanEventsValueExpression: "Events",
  resourceAttributesExpression: "ResourceAttributes",
  highlightedTraceAttributeExpressions: [
    { sqlExpression: "ServiceName", alias: "ServiceName", luceneExpression: "ServiceName" },
    { sqlExpression: "ResourceAttributes['host.name']", alias: "host.name", luceneExpression: "ResourceAttributes.host.name" }
  ],
  highlightedRowAttributeExpressions: [
    { sqlExpression: "SpanAttributes['db.system']", alias: "db.system", luceneExpression: "SpanAttributes.db.system" },
    { sqlExpression: "SpanAttributes['db.operation.name']", alias: "db.operation.name", luceneExpression: "SpanAttributes.db.operation.name" },
    { sqlExpression: "SpanAttributes['http.method']", alias: "http.method", luceneExpression: "SpanAttributes.http.method" },
    { sqlExpression: "SpanAttributes['http.route']", alias: "http.route", luceneExpression: "SpanAttributes.http.route" }
  ],
  materializedViews: [],
  querySettings: []
});

var metrics = ensureSource("Metrics", "metric", {
  from: { databaseName: "default", tableName: "" },
  metricTables: {
    gauge: "otel_metrics_gauge",
    sum: "otel_metrics_sum",
    histogram: "otel_metrics_histogram"
  },
  timestampValueExpression: "TimeUnix",
  serviceNameExpression: "ServiceName",
  resourceAttributesExpression: "ResourceAttributes",
  querySettings: []
});

var logs = ensureSource("Logs", "log", {
  from: { databaseName: "default", tableName: "otel_logs" },
  timestampValueExpression: "Timestamp",
  displayedTimestampValueExpression: "TimestampTime",
  defaultTableSelectExpression: "TimestampTime, ServiceName, SeverityText, Body",
  serviceNameExpression: "ServiceName",
  severityTextExpression: "SeverityText",
  bodyExpression: "Body",
  eventAttributesExpression: "LogAttributes",
  resourceAttributesExpression: "ResourceAttributes",
  traceIdExpression: "TraceId",
  spanIdExpression: "SpanId",
  implicitColumnExpression: "Body",
  highlightedTraceAttributeExpressions: [],
  highlightedRowAttributeExpressions: [],
  materializedViews: [],
  querySettings: []
});

db.sources.updateOne(
  { _id: logs._id },
  { $set: { traceSourceId: traces._id.valueOf(), metricSourceId: metrics._id.valueOf(), updatedAt: now } }
);

db.sources.updateOne(
  { _id: traces._id },
  { $set: { logSourceId: logs._id.valueOf(), metricSourceId: metrics._id.valueOf(), updatedAt: now } }
);

print(accessKey);
`);

	const accessKey = output.split("\n").map(line => line.trim()).filter(Boolean).at(-1);
	if (!accessKey) {
		throw new Error("Could not resolve self-hosted ClickStack access key");
	}
	return accessKey;
}

function ensureSelfHostedOperator(containerId, accessKey) {
	if (!SELFHOST_OPERATOR_PASSWORD) {
		throw new Error("Missing ENVSYNC_CLICKSTACK_OPERATOR_PASSWORD for self-hosted ClickStack bootstrap");
	}

	const authFields = JSON.parse(runClickstackNodeScript(containerId, `
const User = require("/app/packages/api/build/models/user").default;

const accessKey = ${JSON.stringify(accessKey)};
const email = ${JSON.stringify(SELFHOST_OPERATOR_EMAIL.toLowerCase())};
const password = ${JSON.stringify(SELFHOST_OPERATOR_PASSWORD)};
const operatorName = "EnvSync Self-Hosted Operator";

const user = new User({
  name: operatorName,
  email,
  accessKey,
});

user.setPassword(password, error => {
  if (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
    return;
  }
  process.stdout.write(JSON.stringify({
    email,
    name: operatorName,
    accessKey,
    hash: user.hash,
    salt: user.salt,
  }));
});
`));

	const output = runClickstackMongoScript(containerId, `
var now = new Date();
var teamName = "EnvSync Self-Hosted Team";
var email = ${JSON.stringify(SELFHOST_OPERATOR_EMAIL.toLowerCase())};
var operatorName = "EnvSync Self-Hosted Operator";
var accessKey = ${JSON.stringify(accessKey)};
var hash = ${JSON.stringify(authFields.hash)};
var salt = ${JSON.stringify(authFields.salt)};

var team = db.teams.findOne({ name: teamName });
if (!team) {
  throw new Error("Self-hosted ClickStack team was not created before operator bootstrap");
}

var existingUser = db.users.findOne({ email: email });
if (!existingUser) {
  db.users.insertOne({
    name: operatorName,
    email: email,
    team: team._id,
    accessKey: accessKey,
    hash: hash,
    salt: salt,
    createdAt: now,
    updatedAt: now
  });
} else {
  db.users.updateOne(
    { _id: existingUser._id },
    {
      $set: {
        name: operatorName,
        email: email,
        team: team._id,
        accessKey: accessKey,
        hash: hash,
        salt: salt,
        updatedAt: now
      }
    }
  );
}

print(JSON.stringify({ email: email, accessKey: accessKey, teamId: team._id.valueOf() }));
`);

	const parsed = output.split("\n").map(line => line.trim()).filter(Boolean).at(-1);
	if (!parsed) {
		throw new Error("Could not resolve self-hosted ClickStack operator output");
	}
	return JSON.parse(parsed);
}

function clickstackApi(containerId, accessKey, method, routePath, body) {
	const payload = body == null ? "" : Buffer.from(JSON.stringify(body), "utf8").toString("base64");
	const script = `
const body = process.env.HDX_BODY ? Buffer.from(process.env.HDX_BODY, "base64").toString("utf8") : undefined;
fetch("${CLICKSTACK_API_URL}" + process.env.HDX_PATH, {
  method: process.env.HDX_METHOD,
  headers: {
    Authorization: "Bearer " + process.env.HDX_ACCESS_KEY,
    "Content-Type": "application/json",
  },
  body,
})
  .then(async (res) => {
    const text = await res.text();
    if (!res.ok) {
      console.error(text);
      process.exit(1);
    }
    process.stdout.write(text);
  })
  .catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
`;

	const output = runClickstackNodeScript(containerId, `
process.env.HDX_ACCESS_KEY = ${JSON.stringify(accessKey)};
process.env.HDX_METHOD = ${JSON.stringify(method)};
process.env.HDX_PATH = ${JSON.stringify(routePath)};
process.env.HDX_BODY = ${JSON.stringify(payload)};
${script}
`);

	return JSON.parse(output);
}

function numberTile(name, sourceId, x, y, where, extra = {}) {
	const select = { aggFn: "count", ...extra };
	if (where) {
		select.where = where;
		select.whereLanguage = "sql";
	}
	return {
		name,
		x,
		y,
		w: 4,
		h: 3,
		config: {
			displayType: "number",
			sourceId,
			select: [select],
		},
	};
}

function lineTile(name, sourceId, x, y, where, select, groupBy) {
	const normalizedSelect = { ...select };
	if (where) {
		normalizedSelect.where = where;
		normalizedSelect.whereLanguage = "sql";
	}
	return {
		name,
		x,
		y,
		w: 6,
		h: 4,
		config: {
			displayType: "line",
			sourceId,
			select: [normalizedSelect],
			...(groupBy?.length ? { groupBy: groupBy.join(",") } : {}),
		},
	};
}

function getDashboardDefinitions(sourceIds) {
	const logs = sourceIds.Logs;
	const traces = sourceIds.Traces;
	if (!logs || !traces) {
		throw new Error(`Missing required ClickStack sources: ${JSON.stringify(sourceIds)}`);
	}

	return [
		{
			name: "EnvSync Overview",
			tags: ["envsync", "overview"],
			filters: [],
			tiles: [
				numberTile("HTTP Requests", logs, 0, 0, "LogAttributes['log.type'] = 'http_request'"),
				numberTile("Error Logs", logs, 4, 0, "SeverityText = 'error'"),
				numberTile("Trace Spans", traces, 8, 0),
				lineTile("HTTP Requests Over Time", logs, 0, 3, "LogAttributes['log.type'] = 'http_request'", { aggFn: "count" }),
				lineTile("Error Logs Over Time", logs, 6, 3, "SeverityText = 'error'", { aggFn: "count" }),
				lineTile("Span Volume", traces, 0, 7, undefined, { aggFn: "count" }),
				lineTile("Span Volume by Service", traces, 6, 7, undefined, { aggFn: "count" }, ["ServiceName"]),
			],
		},
		{
			name: "EnvSync Response Times",
			tags: ["envsync", "latency"],
			filters: [],
			tiles: [
				lineTile("p50 Span Duration", traces, 0, 0, undefined, {
					aggFn: "quantile",
					level: 0.5,
					valueExpression: "Duration",
					numberFormat: { output: "time" },
				}),
				lineTile("p95 Span Duration", traces, 6, 0, undefined, {
					aggFn: "quantile",
					level: 0.95,
					valueExpression: "Duration",
					numberFormat: { output: "time" },
				}),
				lineTile("p95 Span Duration by Service", traces, 0, 4, undefined, {
					aggFn: "quantile",
					level: 0.95,
					valueExpression: "Duration",
					numberFormat: { output: "time" },
				}, ["ServiceName"]),
				lineTile("Error Span Volume", traces, 6, 4, "StatusCode = 'error'", { aggFn: "count" }),
			],
		},
		{
			name: "EnvSync Request Inspector",
			tags: ["envsync", "requests"],
			filters: [],
			tiles: [
				lineTile("HTTP Requests by Severity", logs, 0, 0, "LogAttributes['log.type'] = 'http_request'", { aggFn: "count" }, ["SeverityText"]),
				lineTile("Error Logs by Severity", logs, 6, 0, "SeverityText = 'error'", { aggFn: "count" }, ["SeverityText"]),
				lineTile("Spans by Name", traces, 0, 4, undefined, { aggFn: "count" }, ["SpanName"]),
				lineTile("Spans by Service", traces, 6, 4, undefined, { aggFn: "count" }, ["ServiceName"]),
			],
		},
		{
			name: "EnvSync Infra Logs",
			tags: ["envsync", "infra"],
			filters: [],
			tiles: [
				lineTile("Logs by Severity", logs, 0, 0, undefined, { aggFn: "count" }, ["SeverityText"]),
				lineTile("Logs by Service", logs, 6, 0, undefined, { aggFn: "count" }, ["ServiceName"]),
				lineTile("Error Logs by Severity", logs, 0, 6, "SeverityText = 'error'", { aggFn: "count" }, ["SeverityText"]),
				lineTile("Traces by Service", traces, 6, 6, undefined, { aggFn: "count" }, ["ServiceName"]),
			],
		},
	];
}

function main() {
	const containerId = resolveClickstackContainerId();
	const accessKey = ensureSelfHostedBootstrap(containerId);
	const operator = ensureSelfHostedOperator(containerId, accessKey);
	const sourcesResp = clickstackApi(containerId, accessKey, "GET", "/sources");
	const dashboardsResp = clickstackApi(containerId, accessKey, "GET", "/dashboards");
	const sourceIds = Object.fromEntries(sourcesResp.data.map(source => [source.name, source.id]));
	const dashboardsByName = new Map(dashboardsResp.data.map(dashboard => [dashboard.name, dashboard.id]));
	const definitions = getDashboardDefinitions(sourceIds);

	for (const definition of definitions) {
		const existingId = dashboardsByName.get(definition.name);
		if (existingId) {
			clickstackApi(containerId, accessKey, "PUT", `/dashboards/${existingId}`, definition);
			console.log(`Updated dashboard: ${definition.name}`);
			continue;
		}
		clickstackApi(containerId, accessKey, "POST", "/dashboards", definition);
		console.log(`Created dashboard: ${definition.name}`);
	}

	console.log(`ClickStack operator email: ${operator.email}`);
	console.log(`ClickStack operator password: ${SELFHOST_OPERATOR_PASSWORD}`);
	console.log(`ClickStack access key: ${accessKey}`);
}

main();

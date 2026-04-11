type Json =
	| string
	| number
	| boolean
	| null
	| Json[]
	| { [key: string]: Json };

type ClickStackSource = {
	id: string;
	name: string;
	kind: "log" | "trace" | "metric" | "session";
};

type ClickStackDashboard = {
	id: string;
	name: string;
};

type DashboardTile = {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	config: Record<string, Json>;
};

type DashboardDefinition = {
	name: string;
	tags: string[];
	filters: Json[];
	tiles: DashboardTile[];
};

const CLICKSTACK_CONTAINER = "monorepo-clickstack-1";
const CLICKSTACK_API_URL = "http://127.0.0.1:8000/api/v2";
const LOCAL_OPERATOR_EMAIL = "local-operator@envsync.local";
const LOCAL_OPERATOR_PASSWORD = "EnvSyncLocal!Aa1";
const LOCAL_DASHBOARD_ACCESS_KEY = "envsync-local-dashboard-access-key";

function run(cmd: string[]) {
	const proc = Bun.spawnSync(cmd, {
		stdout: "pipe",
		stderr: "pipe",
	});

	if (proc.exitCode !== 0) {
		throw new Error(Buffer.from(proc.stderr).toString() || `Command failed: ${cmd.join(" ")}`);
	}

	return Buffer.from(proc.stdout).toString().trim();
}

function runClickstackNodeScript(script: string) {
	const payload = Buffer.from(script).toString("base64");

	return run([
		"docker",
		"exec",
		"-e",
		`HDX_SCRIPT=${payload}`,
		CLICKSTACK_CONTAINER,
		"node",
		"-e",
		"eval(Buffer.from(process.env.HDX_SCRIPT, 'base64').toString('utf8'))",
	]);
}

function runClickstackMongoScript(script: string) {
	const payload = Buffer.from(script).toString("base64");

	return run([
		"docker",
		"exec",
		"-e",
		`HDX_SCRIPT=${payload}`,
		CLICKSTACK_CONTAINER,
		"sh",
		"-lc",
		"printf '%s' \"$HDX_SCRIPT\" | base64 -d >/tmp/hdx-bootstrap.js && mongo hyperdx --quiet /tmp/hdx-bootstrap.js",
	]);
}

function ensureLocalBootstrap() {
	const output = runClickstackMongoScript(`
var now = new Date();
var accessKey = ${JSON.stringify(LOCAL_DASHBOARD_ACCESS_KEY)};
var teamName = "EnvSync Local Team";
var connectionName = "Default ClickHouse";

var team = db.teams.findOne({ name: teamName });
if (!team) {
  db.teams.insertOne({
    name: teamName,
    hookId: "envsync-local-hook-id",
    apiKey: "envsync-local-team-api-key",
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
  displayedTimestampValueExpression: "Timestamp",
  defaultTableSelectExpression: "Timestamp, ServiceName, SeverityText, Body",
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

var sessions = ensureSource("Sessions", "session", {
  from: { databaseName: "default", tableName: "hyperdx_sessions" },
  timestampValueExpression: "Timestamp",
  displayedTimestampValueExpression: "Timestamp",
  defaultTableSelectExpression: "Timestamp, ServiceName, Body",
  serviceNameExpression: "ServiceName",
  bodyExpression: "Body",
  eventAttributesExpression: "LogAttributes",
  resourceAttributesExpression: "ResourceAttributes",
  traceIdExpression: "TraceId",
  spanIdExpression: "SpanId",
  implicitColumnExpression: "Body",
  highlightedTraceAttributeExpressions: [],
  highlightedRowAttributeExpressions: [
    { sqlExpression: "ServiceName", alias: "service.name", luceneExpression: "ServiceName" },
    { sqlExpression: "LogAttributes['envsync.event_name']", alias: "envsync.event_name", luceneExpression: "LogAttributes.envsync.event_name" },
    { sqlExpression: "LogAttributes['envsync.event_category']", alias: "envsync.event_category", luceneExpression: "LogAttributes.envsync.event_category" },
    { sqlExpression: "LogAttributes['envsync.org_id']", alias: "envsync.org_id", luceneExpression: "LogAttributes.envsync.org_id" },
    { sqlExpression: "LogAttributes['envsync.role_name']", alias: "envsync.role_name", luceneExpression: "LogAttributes.envsync.role_name" },
    { sqlExpression: "LogAttributes['envsync.user_id']", alias: "envsync.user_id", luceneExpression: "LogAttributes.envsync.user_id" }
  ],
  materializedViews: [],
  querySettings: []
});

db.sources.updateOne(
  { _id: logs._id },
  { $set: { traceSourceId: traces._id.valueOf(), metricSourceId: metrics._id.valueOf(), updatedAt: now } }
);

db.sources.updateOne(
  { _id: traces._id },
  { $set: { logSourceId: logs._id.valueOf(), metricSourceId: metrics._id.valueOf(), sessionSourceId: sessions._id.valueOf(), updatedAt: now } }
);

db.sources.updateOne(
  { _id: sessions._id },
  { $set: { traceSourceId: traces._id.valueOf(), updatedAt: now } }
);

print(accessKey);
`);

	const accessKey = output.split("\n").map(line => line.trim()).filter(Boolean).at(-1);
	if (!accessKey) {
		throw new Error("Could not resolve local ClickStack access key");
	}

	return accessKey;
}

function ensureLocalOperator(accessKey: string) {
	const authFields = JSON.parse(runClickstackNodeScript(`
const User = require("/app/packages/api/build/models/user").default;

const accessKey = ${JSON.stringify(accessKey)};
const email = ${JSON.stringify(LOCAL_OPERATOR_EMAIL)};
const password = ${JSON.stringify(LOCAL_OPERATOR_PASSWORD)};
const operatorName = "EnvSync Local Operator";

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

	const output = runClickstackMongoScript(`
var now = new Date();
var teamName = "EnvSync Local Team";
var email = ${JSON.stringify(LOCAL_OPERATOR_EMAIL)};
var operatorName = "EnvSync Local Operator";
var accessKey = ${JSON.stringify(accessKey)};
var hash = ${JSON.stringify(authFields.hash)};
var salt = ${JSON.stringify(authFields.salt)};

var team = db.teams.findOne({ name: teamName });
if (!team) {
  throw new Error("Local ClickStack team was not created before operator bootstrap");
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
		throw new Error("Could not resolve local ClickStack operator output");
	}
	return JSON.parse(parsed) as { email: string; accessKey: string; teamId: string };
}

function clickstackApi<T>(accessKey: string, method: string, path: string, body?: Json): T {
	const payload = body == null ? "" : Buffer.from(JSON.stringify(body)).toString("base64");
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

	const output = runClickstackNodeScript(`
process.env.HDX_ACCESS_KEY = ${JSON.stringify(accessKey)};
process.env.HDX_METHOD = ${JSON.stringify(method)};
process.env.HDX_PATH = ${JSON.stringify(path)};
process.env.HDX_BODY = ${JSON.stringify(payload)};
${script}
`);

	return JSON.parse(output) as T;
}

function numberTile(name: string, sourceId: string, x: number, y: number, where?: string, extra: Record<string, Json> = {}): DashboardTile {
	const select: Record<string, Json> = {
		aggFn: "count",
		...extra,
	};

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

function lineTile(
	name: string,
	sourceId: string,
	x: number,
	y: number,
	where: string | undefined,
	select: Record<string, Json>,
	groupBy?: string[],
): DashboardTile {
	const normalizedSelect: Record<string, Json> = { ...select };
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

function tableTile(
	name: string,
	sourceId: string,
	x: number,
	y: number,
	where: string | undefined,
	select: Record<string, Json>,
	groupBy: string,
	orderBy?: string,
): DashboardTile {
	const normalizedSelect: Record<string, Json> = { ...select };
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
			displayType: "table",
			sourceId,
			select: [normalizedSelect],
			groupBy,
			...(orderBy ? { orderBy } : {}),
		},
	};
}

function getDashboardDefinitions(sourceIds: Record<string, string>): DashboardDefinition[] {
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
				numberTile("Error Logs", logs, 4, 0, "SeverityText = 'ERROR'"),
				numberTile("Trace Spans", traces, 8, 0),
				lineTile("Request Rate (RPS)", traces, 0, 3, "notEmpty(SpanAttributes['http.route'])", { aggFn: "count" }),
				lineTile("Error Logs Over Time", logs, 6, 3, "SeverityText = 'ERROR'", { aggFn: "count" }),
				lineTile("Span Volume", traces, 0, 7, undefined, { aggFn: "count" }),
				lineTile("Span Volume by Service", traces, 6, 7, undefined, {
					aggFn: "count",
				}, ["ServiceName"]),
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
					valueExpression: "Duration / 1000000",
					numberFormat: { output: "time" },
				}),
				lineTile("p95 Span Duration", traces, 6, 0, undefined, {
					aggFn: "quantile",
					level: 0.95,
					valueExpression: "Duration / 1000000",
					numberFormat: { output: "time" },
				}),
				lineTile("p95 Span Duration by Service", traces, 0, 4, undefined, {
					aggFn: "quantile",
					level: 0.95,
					valueExpression: "Duration / 1000000",
					numberFormat: { output: "time" },
				}, ["ServiceName"]),
				lineTile("Error Span Volume", traces, 6, 4, "StatusCode = 'STATUS_CODE_ERROR'", {
					aggFn: "count",
				}),
			],
		},
		{
			name: "EnvSync Request Inspector",
			tags: ["envsync", "requests"],
			filters: [],
			tiles: [
				lineTile("HTTP Requests by Severity", logs, 0, 0, "LogAttributes['log.type'] = 'http_request'", {
					aggFn: "count",
				}, ["SeverityText"]),
				lineTile("Error Logs by Severity", logs, 6, 0, "SeverityText = 'ERROR'", {
					aggFn: "count",
				}, ["SeverityText"]),
				lineTile("Spans by Name", traces, 0, 4, undefined, {
					aggFn: "count",
				}, ["SpanName"]),
				lineTile("Spans by Service", traces, 6, 4, undefined, {
					aggFn: "count",
				}, ["ServiceName"]),
			],
		},
		{
			name: "EnvSync Infra Logs",
			tags: ["envsync", "infra"],
			filters: [],
			tiles: [
				lineTile("Logs by Severity", logs, 0, 0, undefined, {
					aggFn: "count",
				}, ["SeverityText"]),
				lineTile("Logs by Service", logs, 6, 0, undefined, {
					aggFn: "count",
				}, ["ServiceName"]),
				lineTile("Error Logs by Severity", logs, 0, 6, "SeverityText = 'ERROR'", {
					aggFn: "count",
				}, ["SeverityText"]),
				lineTile("Traces by Service", traces, 6, 6, undefined, {
					aggFn: "count",
				}, ["ServiceName"]),
			],
		},
	];
}

async function main() {
	const accessKey = ensureLocalBootstrap();
	const operator = ensureLocalOperator(accessKey);

	const sourcesResp = clickstackApi<{ data: ClickStackSource[] }>(accessKey, "GET", "/sources");
	const dashboardsResp = clickstackApi<{ data: ClickStackDashboard[] }>(accessKey, "GET", "/dashboards");

	const sourceIds = Object.fromEntries(sourcesResp.data.map(source => [source.name, source.id]));
	const dashboardsByName = new Map(dashboardsResp.data.map(dashboard => [dashboard.name, dashboard.id]));
	const definitions = getDashboardDefinitions(sourceIds);

	for (const definition of definitions) {
		const existingId = dashboardsByName.get(definition.name);

		if (existingId) {
			clickstackApi(accessKey, "PUT", `/dashboards/${existingId}`, definition);
			console.log(`Updated dashboard: ${definition.name}`);
			continue;
		}

		clickstackApi(accessKey, "POST", "/dashboards", definition);
		console.log(`Created dashboard: ${definition.name}`);
	}

	console.log(`ClickStack operator email: ${operator.email}`);
	console.log(`ClickStack operator password: ${LOCAL_OPERATOR_PASSWORD}`);
	console.log(`ClickStack access key: ${accessKey}`);
}

await main();

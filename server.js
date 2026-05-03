const crypto = require("crypto");
const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "events.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const DEFAULT_STORE = {
  raw_events: [],
  processed_events: [],
  rejected_events: [],
};

const NORMALIZATION_CONFIG = {
  sourceAliases: ["source", "client", "client_id", "clientId", "customer"],
  payloadAliases: ["payload", "data", "event", "body"],
  fields: {
    metric: ["metric", "metric_name", "metricName", "name", "type"],
    amount: ["amount", "value", "total", "quantity", "qty"],
    timestamp: ["timestamp", "time", "date", "occurred_at", "occurredAt", "created_at"],
  },
};

let writeQueue = Promise.resolve();

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function pickFirst(object, aliases) {
  if (!object || typeof object !== "object") {
    return undefined;
  }

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(object, alias)) {
      return object[alias];
    }
  }

  return undefined;
}

function parseAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[$,\s]/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function isoDateFromParts(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date.toISOString();
}

function parseTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const raw = String(value).trim();
  const yyyyMmDd = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (yyyyMmDd) {
    const [, year, month, day] = yyyyMmDd;
    return isoDateFromParts(year, month, day);
  }

  const ddMmYyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddMmYyyy) {
    const [, day, month, year] = ddMmYyyy;
    return isoDateFromParts(year, month, day);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function normalizeEvent(rawEvent) {
  const errors = [];
  const source = pickFirst(rawEvent, NORMALIZATION_CONFIG.sourceAliases);
  const payload = pickFirst(rawEvent, NORMALIZATION_CONFIG.payloadAliases) || rawEvent;

  const clientId = typeof source === "string" && source.trim() ? source.trim() : null;
  const metricValue = pickFirst(payload, NORMALIZATION_CONFIG.fields.metric);
  const metric = typeof metricValue === "string" && metricValue.trim() ? metricValue.trim() : null;
  const amount = parseAmount(pickFirst(payload, NORMALIZATION_CONFIG.fields.amount));
  const timestamp = parseTimestamp(pickFirst(payload, NORMALIZATION_CONFIG.fields.timestamp));

  if (!clientId) errors.push("Missing client/source identifier.");
  if (!metric) errors.push("Missing metric name.");
  if (amount === null) errors.push("Missing or malformed amount.");
  if (!timestamp) errors.push("Missing or malformed timestamp.");

  const canonical = {
    client_id: clientId,
    metric,
    amount,
    timestamp,
  };

  return {
    canonical,
    valid: errors.length === 0,
    errors,
    unknown_fields: Object.keys(payload || {}).filter(
      (key) => !Object.values(NORMALIZATION_CONFIG.fields).some((aliases) => aliases.includes(key)),
    ),
  };
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const data = await fs.readFile(STORE_PATH, "utf8");
  return { ...DEFAULT_STORE, ...JSON.parse(data) };
}

async function atomicWriteStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2));
  await fs.rename(tempPath, STORE_PATH);
}

function updateStore(mutator) {
  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await atomicWriteStore(store);
    return result;
  });

  return writeQueue;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw Object.assign(new Error("Request body too large."), { statusCode: 413 });
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Body must be valid JSON."), { statusCode: 400 });
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body, null, 2));
}

function filterProcessed(events, query) {
  return events.filter((event) => {
    if (query.get("client") && event.event.client_id !== query.get("client")) return false;
    if (query.get("from") && event.event.timestamp < parseTimestamp(query.get("from"))) return false;
    if (query.get("to") && event.event.timestamp > parseTimestamp(query.get("to"))) return false;
    return true;
  });
}

function aggregate(events) {
  const totals = new Map();

  for (const record of events) {
    const key = `${record.event.client_id}::${record.event.metric}`;
    const current = totals.get(key) || {
      client_id: record.event.client_id,
      metric: record.event.metric,
      count: 0,
      amount_total: 0,
    };
    current.count += 1;
    current.amount_total += record.event.amount;
    totals.set(key, current);
  }

  return [...totals.values()].sort((a, b) =>
    `${a.client_id}:${a.metric}`.localeCompare(`${b.client_id}:${b.metric}`),
  );
}

async function ingestEvent(request, response) {
  const body = await readJsonBody(request);
  const rawEvent = body.event || body;
  const normalized = normalizeEvent(rawEvent);
  const now = new Date().toISOString();
  const rawFingerprint = fingerprint(rawEvent);
  const canonicalFingerprint = fingerprint(normalized.canonical);

  if (body.simulateFailure) {
    sendJson(response, 503, {
      status: "failed",
      retryable: true,
      message: "Simulated database failure before commit. No counters were updated.",
      normalized: normalized.canonical,
      validation_errors: normalized.errors,
    });
    return;
  }

  const result = await updateStore((store) => {
    const duplicate = store.processed_events.find((event) => event.fingerprint === canonicalFingerprint);
    if (duplicate) {
      store.raw_events.push({
        id: crypto.randomUUID(),
        received_at: now,
        raw_fingerprint: rawFingerprint,
        canonical_fingerprint: canonicalFingerprint,
        status: "duplicate",
        raw: rawEvent,
      });
      return {
        statusCode: 200,
        body: {
          status: "duplicate",
          message: "Event already processed; existing result returned without double counting.",
          processed_event: duplicate,
        },
      };
    }

    if (!normalized.valid) {
      const rejected = {
        id: crypto.randomUUID(),
        received_at: now,
        raw_fingerprint: rawFingerprint,
        status: "rejected",
        errors: normalized.errors,
        raw: rawEvent,
      };
      store.rejected_events.push(rejected);
      return {
        statusCode: 422,
        body: {
          status: "rejected",
          errors: normalized.errors,
          rejected_event: rejected,
        },
      };
    }

    const rawRecord = {
      id: crypto.randomUUID(),
      received_at: now,
      raw_fingerprint: rawFingerprint,
      canonical_fingerprint: canonicalFingerprint,
      status: "accepted",
      raw: rawEvent,
    };
    const processedRecord = {
      id: crypto.randomUUID(),
      processed_at: now,
      fingerprint: canonicalFingerprint,
      source_raw_id: rawRecord.id,
      schema_version: 1,
      event: normalized.canonical,
      normalization_notes: {
        ignored_extra_fields: normalized.unknown_fields,
      },
    };

    store.raw_events.push(rawRecord);
    store.processed_events.push(processedRecord);

    return {
      statusCode: 201,
      body: {
        status: "accepted",
        processed_event: processedRecord,
      },
    };
  });

  sendJson(response, result.statusCode, result.body);
}

async function getState(response) {
  const store = await readStore();
  sendJson(response, 200, {
    raw_events: store.raw_events.slice(-25).reverse(),
    processed_events: store.processed_events.slice(-25).reverse(),
    rejected_events: store.rejected_events.slice(-25).reverse(),
  });
}

async function getAggregates(url, response) {
  const store = await readStore();
  const filtered = filterProcessed(store.processed_events, url.searchParams);
  sendJson(response, 200, {
    filters: Object.fromEntries(url.searchParams),
    results: aggregate(filtered),
  });
}

function getFilePath(requestPath) {
  if (requestPath === "/") {
    return path.join(PUBLIC_DIR, "index.html");
  }

  const requestWithExtension = path.extname(requestPath) ? requestPath : `${requestPath}.html`;
  const resolvedPath = path.resolve(PUBLIC_DIR, `.${requestWithExtension}`);
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return resolvedPath;
}

async function sendFile(response, filePath, method) {
  const content = method === "HEAD" ? null : await fs.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "public, max-age=300",
  });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/api/events") {
      await ingestEvent(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      await getState(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/aggregates") {
      await getAggregates(url, response);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    const filePath = getFilePath(url.pathname);
    if (!filePath) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    await sendFile(response, filePath, request.method);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(error);
    sendJson(response, statusCode, {
      error: statusCode === 500 ? "Internal server error." : error.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Nebula Play preview running at http://localhost:${PORT}`);
});

const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(TASKS_FILE);
  } catch {
    await fs.writeFile(TASKS_FILE, "[]", "utf8");
  }
}

async function readTasks() {
  const raw = await fs.readFile(TASKS_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeTasks(tasks) {
  await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf8");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(payload);
}

async function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function normalizeTask(task) {
  return {
    id: task.id,
    title: task.title,
    completed: Boolean(task.completed),
    createdAt: task.createdAt,
  };
}

function validateNewTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Request body must be a JSON object.";
  }

  if (typeof input.title !== "string" || !input.title.trim()) {
    return "title is required and must be a non-empty string.";
  }

  return null;
}

function validateTaskUpdate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Request body must be a JSON object.";
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(input, "title");
  const hasCompleted = Object.prototype.hasOwnProperty.call(input, "completed");

  if (!hasTitle && !hasCompleted) {
    return "Provide at least one field to update: title or completed.";
  }

  if (hasTitle && (typeof input.title !== "string" || !input.title.trim())) {
    return "title must be a non-empty string when provided.";
  }

  if (hasCompleted && typeof input.completed !== "boolean") {
    return "completed must be a boolean when provided.";
  }

  return null;
}

async function handleApi(request, response, url) {
  const taskIdMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);

  if (request.method === "GET" && url.pathname === "/api/tasks") {
    const tasks = await readTasks();
    return sendJson(response, 200, { tasks });
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    const rawBody = await readRequestBody(request);
    let payload;

    try {
      payload = JSON.parse(rawBody || "{}");
    } catch {
      return sendJson(response, 400, { error: "Request body must be valid JSON." });
    }

    const validationError = validateNewTask(payload);

    if (validationError) {
      return sendJson(response, 400, { error: validationError });
    }

    const tasks = await readTasks();
    const task = normalizeTask({
      id: randomUUID(),
      title: payload.title.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    });

    tasks.unshift(task);
    await writeTasks(tasks);

    return sendJson(response, 201, { task });
  }

  if (request.method === "PATCH" && taskIdMatch) {
    const rawBody = await readRequestBody(request);
    let payload;

    try {
      payload = JSON.parse(rawBody || "{}");
    } catch {
      return sendJson(response, 400, { error: "Request body must be valid JSON." });
    }

    const validationError = validateTaskUpdate(payload);

    if (validationError) {
      return sendJson(response, 400, { error: validationError });
    }

    const tasks = await readTasks();
    const taskIndex = tasks.findIndex((task) => task.id === taskIdMatch[1]);

    if (taskIndex === -1) {
      return sendJson(response, 404, { error: "Task not found." });
    }

    tasks[taskIndex] = normalizeTask({
      ...tasks[taskIndex],
      ...(Object.prototype.hasOwnProperty.call(payload, "title")
        ? { title: payload.title.trim() }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "completed")
        ? { completed: payload.completed }
        : {}),
    });

    await writeTasks(tasks);
    return sendJson(response, 200, { task: tasks[taskIndex] });
  }

  if (request.method === "DELETE" && taskIdMatch) {
    const tasks = await readTasks();
    const taskIndex = tasks.findIndex((task) => task.id === taskIdMatch[1]);

    if (taskIndex === -1) {
      return sendJson(response, 404, { error: "Task not found." });
    }

    const [deletedTask] = tasks.splice(taskIndex, 1);
    await writeTasks(tasks);

    return sendJson(response, 200, { task: deletedTask });
  }

  return sendJson(response, 404, { error: "Route not found." });
}

async function serveStaticFile(response, targetPath) {
  const resolvedPath = path.resolve(PUBLIC_DIR, targetPath === "/" ? "index.html" : `.${targetPath}`);

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(resolvedPath);
    const extension = path.extname(resolvedPath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }

    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    await serveStaticFile(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error." });
  }
});

ensureStorage()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Task Manager running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exitCode = 1;
  });

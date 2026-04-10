# Task Manager Assignment

This project is a small full-stack Task Manager built to match the assignment brief.

## What is included

- A simple frontend to list, add, complete, edit, filter, and delete tasks
- A REST API with the required `GET`, `POST`, `PATCH`, and `DELETE` task endpoints
- Basic validation and clear JSON error responses
- File-based persistence so tasks remain after refresh or server restart

## Run locally

1. Make sure Node.js is installed.
2. Start the app:

```bash
npm start
```

3. Open [http://localhost:3000](http://localhost:3000)

## API

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`

### Example task shape

```json
{
  "id": "a-unique-id",
  "title": "Finish the assignment",
  "completed": false,
  "createdAt": "2026-04-10T10:00:00.000Z"
}
```

## Assumptions and trade-offs

- I used a zero-dependency Node.js server to keep the solution intentionally small.
- Instead of a database, tasks are stored in `data/tasks.json`, which is enough for this assignment.
- I included a few optional bonus items that still fit the requested scope: title editing, filtering, and persistence after refresh.

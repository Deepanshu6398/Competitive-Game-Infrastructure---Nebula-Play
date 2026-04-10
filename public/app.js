const state = {
  tasks: [],
  filter: "all",
  loading: true,
};

const elements = {
  completedCount: document.querySelector("#completedCount"),
  emptyState: document.querySelector("#emptyState"),
  form: document.querySelector("#taskForm"),
  formMessage: document.querySelector("#formMessage"),
  loadingState: document.querySelector("#loadingState"),
  statusMessage: document.querySelector("#statusMessage"),
  submitButton: document.querySelector("#submitButton"),
  taskList: document.querySelector("#taskList"),
  template: document.querySelector("#taskItemTemplate"),
  titleInput: document.querySelector("#title"),
  totalCount: document.querySelector("#totalCount"),
};

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;

    document.querySelectorAll(".filter-button").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });

    render();
  });
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = elements.titleInput.value.trim();
  if (!title) {
    setFormMessage("Please enter a task title.", true);
    return;
  }

  elements.submitButton.disabled = true;
  setFormMessage("Creating task...", false);

  try {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to create task.");
    }

    elements.form.reset();
    setFormMessage("Task created successfully.", false);
    setStatusMessage("");
    await fetchTasks();
  } catch (error) {
    setFormMessage(error.message, true);
  } finally {
    elements.submitButton.disabled = false;
  }
});

function setFormMessage(message, isError) {
  elements.formMessage.textContent = message;
  elements.formMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setStatusMessage(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getVisibleTasks() {
  if (state.filter === "completed") {
    return state.tasks.filter((task) => task.completed);
  }

  if (state.filter === "open") {
    return state.tasks.filter((task) => !task.completed);
  }

  return state.tasks;
}

function render() {
  const visibleTasks = getVisibleTasks();
  const completedCount = state.tasks.filter((task) => task.completed).length;

  elements.totalCount.textContent = String(state.tasks.length);
  elements.completedCount.textContent = String(completedCount);
  elements.loadingState.classList.toggle("is-hidden", !state.loading);
  elements.emptyState.classList.toggle(
    "is-hidden",
    state.loading || visibleTasks.length > 0
  );
  elements.taskList.innerHTML = "";

  if (state.loading || visibleTasks.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  visibleTasks.forEach((task) => {
    fragment.append(createTaskElement(task));
  });

  elements.taskList.append(fragment);
}

function createTaskElement(task) {
  const item = elements.template.content.firstElementChild.cloneNode(true);
  const title = item.querySelector(".task-title");
  const date = item.querySelector(".task-date");
  const toggle = item.querySelector(".task-toggle");
  const badge = item.querySelector(".task-badge");
  const deleteButton = item.querySelector(".delete-button");
  const editButton = item.querySelector(".edit-button");
  const editForm = item.querySelector(".edit-form");
  const editInput = item.querySelector(".edit-input");
  const cancelButton = item.querySelector(".cancel-button");

  item.classList.toggle("is-completed", task.completed);
  title.textContent = task.title;
  date.textContent = formatDate(task.createdAt);
  toggle.checked = task.completed;
  badge.textContent = task.completed ? "Completed" : "Open";
  editInput.value = task.title;

  toggle.addEventListener("change", async () => {
    await updateTask(task.id, { completed: toggle.checked }, "Task updated.");
  });

  deleteButton.addEventListener("click", async () => {
    deleteButton.disabled = true;
    setStatusMessage("Deleting task...");

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete task.");
      }

      setStatusMessage("Task deleted.");
      await fetchTasks();
    } catch (error) {
      deleteButton.disabled = false;
      setStatusMessage(error.message, true);
    }
  });

  editButton.addEventListener("click", () => {
    editForm.classList.remove("is-hidden");
    editButton.disabled = true;
    editInput.focus();
    editInput.select();
  });

  cancelButton.addEventListener("click", () => {
    editForm.classList.add("is-hidden");
    editButton.disabled = false;
    editInput.value = task.title;
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextTitle = editInput.value.trim();

    if (!nextTitle) {
      setStatusMessage("Task title cannot be empty.", true);
      return;
    }

    const updated = await updateTask(task.id, { title: nextTitle }, "Task title updated.");
    if (updated) {
      editForm.classList.add("is-hidden");
      editButton.disabled = false;
    }
  });

  return item;
}

async function updateTask(taskId, updates, successMessage) {
  setStatusMessage("Saving changes...");

  try {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to update task.");
    }

    setStatusMessage(successMessage);
    await fetchTasks();
    return true;
  } catch (error) {
    setStatusMessage(error.message, true);
    return false;
  }
}

async function fetchTasks() {
  state.loading = true;
  render();

  try {
    const response = await fetch("/api/tasks");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Failed to load tasks.");
    }

    state.tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    setStatusMessage("");
  } catch (error) {
    state.tasks = [];
    setStatusMessage(error.message, true);
  } finally {
    state.loading = false;
    render();
  }
}

fetchTasks();

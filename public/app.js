const sampleEvent = {
  source: "client_A",
  payload: {
    metric: "value",
    amount: "1200",
    timestamp: "2024/01/01",
    region: "north",
  },
};

const eventInput = document.querySelector("#event-json");
const form = document.querySelector("#event-form");
const simulateFailure = document.querySelector("#simulate-failure");
const responseOutput = document.querySelector("#response-output");
const processedList = document.querySelector("#processed-list");
const rejectedList = document.querySelector("#rejected-list");
const aggregateList = document.querySelector("#aggregate-list");
const refreshButton = document.querySelector("#refresh-button");
const filterClient = document.querySelector("#filter-client");
const filterFrom = document.querySelector("#filter-from");
const filterTo = document.querySelector("#filter-to");

eventInput.value = JSON.stringify(sampleEvent, null, 2);

function renderEmpty(target) {
  target.replaceChildren(document.querySelector("#empty-template").content.cloneNode(true));
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function eventCard(record, mode) {
  const card = document.createElement("article");
  card.className = "event-card";

  const title = document.createElement("strong");
  title.textContent =
    mode === "processed"
      ? `${record.event.client_id} / ${record.event.metric}`
      : record.errors.join(" ");

  const meta = document.createElement("span");
  meta.textContent =
    mode === "processed"
      ? `${record.event.amount} at ${formatDate(record.event.timestamp)}`
      : `Received ${formatDate(record.received_at)}`;

  const fingerprint = document.createElement("code");
  fingerprint.textContent =
    mode === "processed" ? record.fingerprint.slice(0, 16) : record.raw_fingerprint.slice(0, 16);

  card.append(title, meta, fingerprint);
  return card;
}

function renderEvents(records, target, mode) {
  target.replaceChildren();
  if (!records.length) {
    renderEmpty(target);
    return;
  }

  for (const record of records) {
    target.append(eventCard(record, mode));
  }
}

function renderAggregates(rows) {
  aggregateList.replaceChildren();
  if (!rows.length) {
    renderEmpty(aggregateList);
    return;
  }

  for (const row of rows) {
    const item = document.createElement("article");
    item.className = "aggregate-card";
    item.innerHTML = `
      <div>
        <strong>${row.client_id}</strong>
        <span>${row.metric}</span>
      </div>
      <div>
        <strong>${row.amount_total.toLocaleString()}</strong>
        <span>${row.count} event${row.count === 1 ? "" : "s"}</span>
      </div>
    `;
    aggregateList.append(item);
  }
}

function aggregateQuery() {
  const query = new URLSearchParams();
  if (filterClient.value.trim()) query.set("client", filterClient.value.trim());
  if (filterFrom.value) query.set("from", filterFrom.value);
  if (filterTo.value) query.set("to", filterTo.value);
  return query.toString();
}

async function refresh() {
  const [eventsResponse, aggregateResponse] = await Promise.all([
    fetch("/api/events"),
    fetch(`/api/aggregates?${aggregateQuery()}`),
  ]);
  const events = await eventsResponse.json();
  const aggregates = await aggregateResponse.json();

  renderEvents(events.processed_events, processedList, "processed");
  renderEvents(events.rejected_events, rejectedList, "rejected");
  renderAggregates(aggregates.results);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const raw = JSON.parse(eventInput.value);
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: raw,
        simulateFailure: simulateFailure.checked,
      }),
    });
    const body = await response.json();
    responseOutput.textContent = JSON.stringify(body, null, 2);
    await refresh();
  } catch (error) {
    responseOutput.textContent = error.message;
  }
});

refreshButton.addEventListener("click", refresh);
filterClient.addEventListener("input", refresh);
filterFrom.addEventListener("change", refresh);
filterTo.addEventListener("change", refresh);

refresh();

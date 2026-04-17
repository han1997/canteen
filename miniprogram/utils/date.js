function pad(value) {
  return value < 10 ? `0${value}` : String(value);
}

function parseDate(input) {
  if (!input) {
    return null;
  }
  if (input instanceof Date) {
    return input;
  }
  const text = String(input).trim();
  if (!text) {
    return null;
  }
  const normalized = text
    .replace("T", " ")
    .replace(/Z$/, "")
    .replace(/\.\d+/, "")
    .replace(/-/g, "/");
  const result = new Date(normalized);
  if (Number.isNaN(result.getTime())) {
    return null;
  }
  return result;
}

function formatDate(input) {
  const date = parseDate(input) || new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayString() {
  return formatDate(new Date());
}

function addDays(dateText, days) {
  const baseDate = parseDate(dateText) || new Date();
  const nextDate = new Date(baseDate.getTime());
  nextDate.setDate(nextDate.getDate() + Number(days || 0));
  return formatDate(nextDate);
}

function formatDateTime(input) {
  const date = parseDate(input);
  if (!date) {
    return "--";
  }
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function listDateStrings(fromDate, toDate, maxDays) {
  const start = parseDate(fromDate);
  const end = parseDate(toDate);
  const limit = maxDays || 31;
  if (!start || !end || start.getTime() > end.getTime()) {
    return [];
  }
  const result = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime() && result.length < limit) {
    result.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

module.exports = {
  formatDate,
  todayString,
  addDays,
  formatDateTime,
  listDateStrings
};

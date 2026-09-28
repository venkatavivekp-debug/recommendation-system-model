function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

// Daily totals use the same UTC boundaries as calendar entries and edit locks.
function startOfToday(value = new Date()) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfToday(value = new Date()) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function isToday(value) {
  const key = toDateKey(value);
  if (!key) {
    return false;
  }

  return key === todayDateKey();
}

function isPast(value) {
  const key = toDateKey(value);
  if (!key) {
    return false;
  }

  return key < todayDateKey();
}

module.exports = {
  toDateKey,
  todayDateKey,
  startOfToday,
  endOfToday,
  isToday,
  isPast,
};

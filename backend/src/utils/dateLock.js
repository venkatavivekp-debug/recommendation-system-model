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
  isToday,
  isPast,
};

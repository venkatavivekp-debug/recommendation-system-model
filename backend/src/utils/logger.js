function format(level, message, meta) {
  const timestamp = new Date().toISOString();
  if (!meta) {
    return `[${timestamp}] [${level}] ${message}`;
  }

  return `[${timestamp}] [${level}] ${message} ${JSON.stringify(meta)}`;
}

const logger = {
  info(message, meta) {
    console.log(format('INFO', message, meta));
  },
  warn(message, meta) {
    console.warn(format('WARN', message, meta));
  },
  error(message, meta) {
    console.error(format('ERROR', message, meta));
  },
};

module.exports = logger;

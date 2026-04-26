const fs = require('fs/promises');
const path = require('path');

const DEFAULT_DATA = {
  users: [],
  passwordResetTokens: [],
  searchHistory: [],
  activities: [],
  meals: [],
  communityRecipes: [],
  recipeReviews: [],
  calendarPlans: [],
  exerciseSessions: [],
  wearableConnections: [],
  recommendationInteractions: [],
  userContentInteractions: [],
  evaluationMetrics: [],
  restaurants: [],
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fileSignature(stats) {
  return `${stats.mtimeMs}:${stats.size}`;
}

class DataStore {
  constructor(filePath) {
    const configuredPath = process.env.DATASTORE_PATH
      ? path.isAbsolute(process.env.DATASTORE_PATH)
        ? process.env.DATASTORE_PATH
        : path.resolve(process.cwd(), process.env.DATASTORE_PATH)
      : path.resolve(process.cwd(), 'runtime-data', 'store.json');

    this.filePath = filePath || configuredPath;
    this.initialized = false;
    this.writeQueue = Promise.resolve();
    this.cache = {
      signature: null,
      raw: null,
      data: null,
    };
  }

  async init() {
    if (this.initialized) {
      return;
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch (error) {
      await fs.writeFile(this.filePath, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
    }

    this.initialized = true;
  }

  async readData() {
    await this.init();
    let stats;
    try {
      stats = await fs.stat(this.filePath);
    } catch (_error) {
      const fallbackData = deepClone(DEFAULT_DATA);
      await this.writeData(fallbackData);
      return fallbackData;
    }

    const signature = fileSignature(stats);

    if (this.cache.signature === signature && this.cache.data) {
      return deepClone(this.cache.data);
    }

    const raw = await fs.readFile(this.filePath, 'utf8');

    try {
      const parsed = JSON.parse(raw);
      const data = {
        ...deepClone(DEFAULT_DATA),
        ...parsed,
      };
      this.cache = {
        signature,
        raw,
        data,
      };
      return deepClone(data);
    } catch (error) {
      const fallbackData = deepClone(DEFAULT_DATA);
      await this.writeData(fallbackData);
      return fallbackData;
    }
  }

  async writeData(nextData) {
    await this.init();
    const serialized = JSON.stringify(nextData, null, 2);
    let current = '';
    let currentSignature = null;

    try {
      const stats = await fs.stat(this.filePath);
      currentSignature = fileSignature(stats);
      if (this.cache.signature === currentSignature && this.cache.raw === serialized) {
        return nextData;
      }
      current = await fs.readFile(this.filePath, 'utf8');
    } catch (_error) {
      current = '';
    }

    if (current === serialized) {
      this.cache = {
        signature: currentSignature,
        raw: serialized,
        data: deepClone(nextData),
      };
      return nextData;
    }

    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(temporaryPath, serialized, 'utf8');
    await fs.rename(temporaryPath, this.filePath);
    const stats = await fs.stat(this.filePath);
    this.cache = {
      signature: fileSignature(stats),
      raw: serialized,
      data: deepClone(nextData),
    };
    return nextData;
  }

  async updateData(mutator) {
    this.writeQueue = this.writeQueue.catch(() => null).then(async () => {
      const currentData = await this.readData();
      const draft = deepClone(currentData);
      const mutated = await mutator(draft);
      const finalData = mutated || draft;
      return this.writeData(finalData);
    });

    return this.writeQueue;
  }
}

module.exports = new DataStore();

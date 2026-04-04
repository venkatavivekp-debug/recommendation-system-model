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
    const raw = await fs.readFile(this.filePath, 'utf8');

    try {
      const parsed = JSON.parse(raw);
      return {
        ...deepClone(DEFAULT_DATA),
        ...parsed,
      };
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

    try {
      current = await fs.readFile(this.filePath, 'utf8');
    } catch (_error) {
      current = '';
    }

    if (current === serialized) {
      return nextData;
    }

    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(temporaryPath, serialized, 'utf8');
    await fs.rename(temporaryPath, this.filePath);
    return nextData;
  }

  async updateData(mutator) {
    this.writeQueue = this.writeQueue.then(async () => {
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

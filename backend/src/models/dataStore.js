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
  friendRequests: [],
  friends: [],
  dietShares: [],
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

class DataStore {
  constructor(filePath) {
    this.filePath = filePath || path.join(__dirname, '..', 'data', 'store.json');
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
      await fs.writeFile(this.filePath, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
      return deepClone(DEFAULT_DATA);
    }
  }

  async writeData(nextData) {
    await this.init();
    await fs.writeFile(this.filePath, JSON.stringify(nextData, null, 2), 'utf8');
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

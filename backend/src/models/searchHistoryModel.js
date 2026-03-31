const dataStore = require('./dataStore');

async function addSearchRecord(record) {
  await dataStore.updateData((data) => {
    data.searchHistory.push(record);
    if (data.searchHistory.length > 500) {
      data.searchHistory = data.searchHistory.slice(-500);
    }
    return data;
  });
}

module.exports = {
  addSearchRecord,
};

const fs = require('node:fs');
const { temporalSplit } = require('../backend/src/research/recommendationData');
const { rankingMetricsAtK } = require('../backend/src/research/rankingMetrics');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let output;
if (process.argv[2] === 'prepare') {
  const split = temporalSplit(input.rows, {
    perUser: false,
    trainRatio: input.trainRatio,
    validationRatio: input.validationRatio,
  });
  // Keep equal timestamps together at chronological boundaries.
  const trainEnd = split.train.at(-1).timestamp;
  const validationEnd = split.validation.at(-1).timestamp;
  output = { train: [], validation: [], test: [] };
  for (const row of [...split.train, ...split.validation, ...split.test]) {
    const name = row.timestamp <= trainEnd ? 'train'
      : row.timestamp <= validationEnd ? 'validation' : 'test';
    output[name].push(row);
  }
} else if (process.argv[2] === 'metrics') {
  output = input.map((row) => rankingMetricsAtK(row));
} else {
  throw new Error('Expected prepare or metrics');
}
process.stdout.write(JSON.stringify(output));

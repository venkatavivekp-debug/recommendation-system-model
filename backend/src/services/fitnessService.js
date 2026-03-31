function calculateCaloriesBurned(distanceMiles, mode) {
  const roundedDistance = Number(distanceMiles.toFixed(2));

  if (mode === 'walking') {
    return Number((roundedDistance * 100).toFixed(0));
  }

  if (mode === 'running') {
    return Number((roundedDistance * 160).toFixed(0));
  }

  return 0;
}

module.exports = {
  calculateCaloriesBurned,
};

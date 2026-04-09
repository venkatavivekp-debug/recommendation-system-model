function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(toNumber(value, 0), 0, 1);
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

const FOOD_MODES = [
  { id: 'high_protein_fit', label: 'High-protein fit' },
  { id: 'low_calorie_fit', label: 'Low-calorie fit' },
  { id: 'preference_fit', label: 'Preference fit' },
  { id: 'history_fit', label: 'History fit' },
  { id: 'convenience_fit', label: 'Convenience fit' },
];

const CONTENT_MODES = [
  { id: 'genre_preference_fit', label: 'Genre preference fit' },
  { id: 'mood_fit', label: 'Mood fit' },
  { id: 'duration_fit', label: 'Duration fit' },
  { id: 'time_of_day_fit', label: 'Time-of-day fit' },
  { id: 'history_similarity_fit', label: 'History similarity fit' },
  { id: 'activity_fit', label: 'Activity fit' },
];

function getModes(domain = 'food') {
  return String(domain || '').toLowerCase() === 'content' ? CONTENT_MODES : FOOD_MODES;
}

function candidateId(candidate = {}, index = 0) {
  return (
    String(candidate?.id || candidate?.placeId || '').trim() ||
    `${normalizeText(candidate?.name || candidate?.title || candidate?.foodName || 'candidate')}-${index}`
  );
}

function scoreFoodMode(candidate = {}, modeId) {
  const features = candidate?.recommendation?.features || {};
  const factors = candidate?.recommendation?.factors || {};
  const protein = clamp01(factors.proteinMatch ?? features.macroMatch ?? features.proteinMatch);
  const calories = clamp01(factors.calorieFit ?? features.calorieFit);
  const preference = clamp01(factors.preferenceMatch ?? features.userPreference ?? features.preferenceMatch);
  const history = clamp01(features.historyScore ?? features.historySimilarity ?? features.interactionAffinity);
  const convenience = clamp01(features.proximityScore ?? factors.distanceScore ?? features.distanceScore);
  const allergy = clamp01(1 - toNumber(features.allergyPenalty, 0));

  if (modeId === 'high_protein_fit') {
    return clamp01(protein * 0.68 + allergy * 0.18 + preference * 0.14);
  }
  if (modeId === 'low_calorie_fit') {
    return clamp01(calories * 0.66 + allergy * 0.2 + convenience * 0.14);
  }
  if (modeId === 'preference_fit') {
    return clamp01(preference * 0.62 + protein * 0.18 + calories * 0.2);
  }
  if (modeId === 'history_fit') {
    return clamp01(history * 0.7 + preference * 0.15 + convenience * 0.15);
  }
  if (modeId === 'convenience_fit') {
    return clamp01(convenience * 0.74 + calories * 0.14 + protein * 0.12);
  }

  return clamp01((protein + calories + preference + history + convenience) / 5);
}

function scoreContentMode(candidate = {}, modeId) {
  const features = candidate?.features || candidate?.recommendation?.features || {};
  const genreMatch = clamp01(features.genreMatch);
  const moodMatch = clamp01(features.moodMatch);
  const durationFit = clamp01(features.durationFit);
  const contextFit = clamp01(features.contextFit);
  const timeFit = clamp01(features.timeOfDayFit);
  const history = clamp01(features.historySimilarity);
  const activity = clamp01(features.activityFit);

  if (modeId === 'genre_preference_fit') {
    return clamp01(genreMatch * 0.58 + history * 0.22 + contextFit * 0.2);
  }
  if (modeId === 'mood_fit') {
    return clamp01(moodMatch * 0.6 + timeFit * 0.18 + activity * 0.22);
  }
  if (modeId === 'duration_fit') {
    return clamp01(durationFit * 0.64 + contextFit * 0.2 + timeFit * 0.16);
  }
  if (modeId === 'time_of_day_fit') {
    return clamp01(timeFit * 0.7 + moodMatch * 0.2 + durationFit * 0.1);
  }
  if (modeId === 'history_similarity_fit') {
    return clamp01(history * 0.7 + genreMatch * 0.18 + contextFit * 0.12);
  }
  if (modeId === 'activity_fit') {
    return clamp01(activity * 0.66 + contextFit * 0.2 + durationFit * 0.14);
  }

  return clamp01((genreMatch + moodMatch + durationFit + contextFit + timeFit + history + activity) / 7);
}

function buildModeScores(candidate = {}, options = {}) {
  const domain = String(options.domain || 'food').toLowerCase();
  const modes = getModes(domain);

  const scored = modes
    .map((mode) => ({
      ...mode,
      score:
        domain === 'content'
          ? scoreContentMode(candidate, mode.id)
          : scoreFoodMode(candidate, mode.id),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    winner: scored[0] || null,
    backups: scored.slice(1, 3),
    all: scored,
  };
}

function annotateModeWinners(candidates = [], options = {}) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const modeScores = buildModeScores(candidate, options);
    return {
      ...candidate,
      winnerMode: modeScores.winner,
      backupModes: modeScores.backups,
      recommendation: {
        ...(candidate.recommendation || {}),
        winnerMode: modeScores.winner,
        backupModes: modeScores.backups,
        modeScores: modeScores.all,
      },
    };
  });
}

function generateCandidates(candidates = [], options = {}) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  if (!safeCandidates.length) {
    return [];
  }

  const domain = String(options.domain || 'food').toLowerCase();
  const modes = getModes(domain);
  const perMode = Math.max(1, toNumber(options.perMode, 3));
  const maxPool = Math.max(perMode * modes.length, toNumber(options.maxPool, 24));
  const baseAnnotated = annotateModeWinners(safeCandidates, options);

  const picks = [];
  const seen = new Set();

  modes.forEach((mode) => {
    const rankedForMode = [...baseAnnotated]
      .map((candidate, index) => ({
        candidate,
        index,
        modeScore:
          domain === 'content'
            ? scoreContentMode(candidate, mode.id)
            : scoreFoodMode(candidate, mode.id),
      }))
      .sort((a, b) => {
        const diff = b.modeScore - a.modeScore;
        if (diff !== 0) {
          return diff;
        }
        return candidateId(a.candidate, a.index).localeCompare(candidateId(b.candidate, b.index));
      })
      .slice(0, perMode);

    rankedForMode.forEach((entry) => {
      const id = candidateId(entry.candidate, entry.index);
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      picks.push({
        ...entry.candidate,
        candidateMode: {
          id: mode.id,
          label: mode.label,
          score: Number(entry.modeScore.toFixed(4)),
        },
        recommendation: {
          ...(entry.candidate.recommendation || {}),
          candidateMode: {
            id: mode.id,
            label: mode.label,
            score: Number(entry.modeScore.toFixed(4)),
          },
        },
      });
    });
  });

  if (!picks.length) {
    return baseAnnotated.slice(0, maxPool);
  }

  const baseFill = baseAnnotated.filter((candidate, index) => !seen.has(candidateId(candidate, index)));
  return [...picks, ...baseFill].slice(0, maxPool);
}

module.exports = {
  getModes,
  buildModeScores,
  annotateModeWinners,
  generateCandidates,
};

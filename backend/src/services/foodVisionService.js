const axios = require('axios');
const AppError = require('../utils/appError');
const env = require('../config/env');
const logger = require('../utils/logger');

const FOOD_KEYWORD_MAP = [
  { foodName: 'grilled chicken bowl', keywords: ['chicken', 'grill', 'breast', 'tandoori'] },
  { foodName: 'pizza', keywords: ['pizza', 'pepperoni', 'margherita'] },
  { foodName: 'burger', keywords: ['burger', 'big mac', 'whopper', 'sandwich'] },
  { foodName: 'salad bowl', keywords: ['salad', 'greens', 'caesar'] },
  { foodName: 'rice bowl', keywords: ['rice', 'bowl', 'biryani', 'fried rice'] },
  { foodName: 'pasta', keywords: ['pasta', 'spaghetti', 'noodle'] },
  { foodName: 'sushi', keywords: ['sushi', 'roll', 'nigiri'] },
  { foodName: 'oatmeal', keywords: ['oats', 'oatmeal', 'porridge'] },
  { foodName: 'eggs', keywords: ['egg', 'omelette', 'omelet'] },
  { foodName: 'protein shake', keywords: ['shake', 'protein', 'smoothie'] },
];

const FALLBACK_CANDIDATES = [
  { foodName: 'grilled chicken bowl', confidence: 0.42 },
  { foodName: 'rice and vegetables', confidence: 0.36 },
  { foodName: 'protein salad', confidence: 0.32 },
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function clampConfidence(value, fallback = 0.45) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0.05, Math.min(0.99, parsed));
}

function extractBase64Data(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    return null;
  }

  const commaIndex = raw.indexOf(',');
  if (raw.startsWith('data:') && commaIndex >= 0) {
    return raw.slice(commaIndex + 1);
  }

  return raw;
}

function normalizeCandidateList(candidates = [], preferredFoodName, preferredConfidence, sourceType) {
  const seen = new Set();
  const merged = [];

  const preferredName = String(preferredFoodName || '').trim();
  if (preferredName) {
    merged.push({
      foodName: preferredName,
      confidence: clampConfidence(preferredConfidence, 0.45),
      sourceType: sourceType || 'fallback',
    });
  }

  (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
    const foodName = String(candidate?.foodName || candidate?.name || '').trim();
    if (!foodName) {
      return;
    }

    merged.push({
      foodName,
      confidence: clampConfidence(candidate?.confidence, 0.35),
      sourceType: candidate?.sourceType || sourceType || 'fallback',
    });
  });

  const unique = [];
  merged.forEach((item) => {
    const key = normalizeText(item.foodName);
    if (!key) {
      return;
    }

    if (seen.has(key)) {
      const existing = unique.find((entry) => normalizeText(entry.foodName) === key);
      if (existing) {
        existing.confidence = Math.max(existing.confidence, item.confidence);
      }
      return;
    }

    seen.add(key);
    unique.push(item);
  });

  return unique
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map((item) => ({
      ...item,
      confidence: Number(clampConfidence(item.confidence, 0.35).toFixed(2)),
    }));
}

function buildHeuristicCandidates(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return FALLBACK_CANDIDATES.map((item) => ({
      ...item,
      sourceType: 'fallback',
    }));
  }

  const scored = FOOD_KEYWORD_MAP
    .map((entry) => {
      const keywordHits = entry.keywords.reduce(
        (count, keyword) => (normalized.includes(keyword) ? count + 1 : count),
        0
      );
      const titleTokenHits = entry.foodName
        .split(' ')
        .reduce((count, token) => (normalized.includes(token) ? count + 1 : count), 0);
      const totalHits = keywordHits + titleTokenHits * 0.35;

      if (totalHits <= 0) {
        return null;
      }

      const confidence = Math.min(0.9, 0.47 + totalHits * 0.12);
      return {
        foodName: entry.foodName,
        confidence,
        sourceType: 'filename_heuristic',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence);

  if (!scored.length) {
    return FALLBACK_CANDIDATES.map((item) => ({
      ...item,
      sourceType: 'fallback',
    }));
  }

  return scored.slice(0, 3).map((item) => ({
    ...item,
    confidence: Number(clampConfidence(item.confidence, 0.4).toFixed(2)),
  }));
}

function detectFromText(text) {
  const candidates = buildHeuristicCandidates(text);
  const top = candidates[0] || {
    foodName: FALLBACK_CANDIDATES[0].foodName,
    confidence: FALLBACK_CANDIDATES[0].confidence,
    sourceType: 'fallback',
  };

  return {
    foodName: top.foodName,
    confidence: top.confidence,
    sourceType: top.sourceType,
    candidates,
  };
}

function extractOutputText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  const outputItems = Array.isArray(payload.output) ? payload.output : [];

  outputItems.forEach((item) => {
    const contentItems = Array.isArray(item.content) ? item.content : [];
    contentItems.forEach((content) => {
      if (content.type === 'output_text' && content.text) {
        chunks.push(content.text);
      }
    });
  });

  return chunks.join(' ').trim();
}

function parseModelOutput(text) {
  const fallback = detectFromText(text);
  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const parsedCandidates = normalizeCandidateList(
        parsed.candidates,
        parsed.foodName || parsed.name,
        parsed.confidence,
        'vision_api'
      );

      const primary = parsedCandidates[0] || {
        foodName: String(parsed.foodName || parsed.name || fallback.foodName).trim() || fallback.foodName,
        confidence: clampConfidence(parsed.confidence, fallback.confidence),
        sourceType: 'vision_api',
      };

      return {
        foodName: primary.foodName,
        confidence: clampConfidence(primary.confidence, fallback.confidence),
        sourceType: 'vision_api',
        candidates: parsedCandidates.length
          ? parsedCandidates
          : normalizeCandidateList(fallback.candidates, fallback.foodName, fallback.confidence, 'vision_api'),
      };
    }
  } catch (error) {
    // Continue with heuristic parsing of plain text response.
  }

  const guess = detectFromText(text);
  return {
    foodName: guess.foodName,
    confidence: clampConfidence(guess.confidence, 0.5),
    sourceType: 'vision_api',
    candidates: normalizeCandidateList(guess.candidates, guess.foodName, guess.confidence, 'vision_api'),
  };
}

async function detectWithOpenAiVision({ base64Data, mimeType, hintText }) {
  if (!env.openaiApiKey || !base64Data || !String(mimeType || '').startsWith('image/')) {
    return null;
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/responses',
      {
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  'Identify the top 3 likely foods visible in this image. '
                  + 'Respond only as JSON: {"foodName":"...","confidence":0.00,"candidates":[{"foodName":"...","confidence":0.00}]}. '
                  + `Hint: ${hintText || 'none'}`,
              },
              {
                type: 'input_image',
                image_url: `data:${mimeType};base64,${base64Data}`,
              },
            ],
          },
        ],
        max_output_tokens: 200,
      },
      {
        headers: {
          Authorization: `Bearer ${env.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const outputText = extractOutputText(response.data);
    if (!outputText) {
      return null;
    }

    const parsed = parseModelOutput(outputText);
    return {
      ...parsed,
      sourceType: 'vision_api',
    };
  } catch (error) {
    logger.warn('OpenAI vision detection unavailable, using fallback heuristics', {
      message: error.message,
    });
    return null;
  }
}

async function detectFood({ file, imageBase64, fileName, mimeType }) {
  const finalMimeType = String(file?.mimetype || mimeType || '').toLowerCase();
  const base64Data =
    file?.buffer && Buffer.isBuffer(file.buffer) && file.buffer.length
      ? file.buffer.toString('base64')
      : extractBase64Data(imageBase64);
  const hintName = String(file?.originalname || fileName || '').trim();

  if (!finalMimeType && !hintName && !base64Data) {
    throw new AppError('Image or video input is required', 400, 'VALIDATION_ERROR');
  }

  const heuristic = detectFromText(hintName);
  const modelResult = await detectWithOpenAiVision({
    base64Data,
    mimeType: finalMimeType,
    hintText: hintName,
  });

  const chosen = modelResult || heuristic;
  const mediaType = finalMimeType.startsWith('video/') ? 'video' : 'image';

  const baseCandidates = normalizeCandidateList(
    chosen.candidates,
    chosen.foodName || heuristic.foodName,
    chosen.confidence || heuristic.confidence,
    chosen.sourceType || heuristic.sourceType || 'fallback'
  );

  const adjustedCandidates = baseCandidates.map((candidate) => {
    const adjustedConfidence =
      mediaType === 'video'
        ? clampConfidence(candidate.confidence * 0.9, 0.35)
        : clampConfidence(candidate.confidence, 0.4);

    return {
      ...candidate,
      confidence: Number(adjustedConfidence.toFixed(2)),
    };
  });

  const primary = adjustedCandidates[0] || {
    foodName: chosen.foodName || heuristic.foodName || FALLBACK_CANDIDATES[0].foodName,
    confidence: mediaType === 'video'
      ? clampConfidence((chosen.confidence || heuristic.confidence) * 0.9, 0.35)
      : clampConfidence(chosen.confidence || heuristic.confidence, 0.4),
    sourceType: chosen.sourceType || heuristic.sourceType || 'fallback',
  };

  return {
    foodName: primary.foodName,
    confidence: Number(clampConfidence(primary.confidence, 0.4).toFixed(2)),
    sourceType: primary.sourceType,
    mediaType,
    candidates: adjustedCandidates,
  };
}

module.exports = {
  detectFood,
};

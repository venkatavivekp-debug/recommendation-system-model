const axios = require('axios');
const AppError = require('../utils/appError');
const env = require('../config/env');
const logger = require('../utils/logger');

const FOOD_KEYWORD_MAP = [
  { foodName: 'grilled chicken', keywords: ['chicken', 'grill', 'breast', 'tandoori'] },
  { foodName: 'pizza', keywords: ['pizza', 'pepperoni', 'margherita'] },
  { foodName: 'burger', keywords: ['burger', 'big mac', 'whopper', 'sandwich'] },
  { foodName: 'salad', keywords: ['salad', 'greens', 'caesar'] },
  { foodName: 'rice bowl', keywords: ['rice', 'bowl', 'biryani', 'fried rice'] },
  { foodName: 'pasta', keywords: ['pasta', 'spaghetti', 'noodle'] },
  { foodName: 'sushi', keywords: ['sushi', 'roll', 'nigiri'] },
  { foodName: 'oatmeal', keywords: ['oats', 'oatmeal', 'porridge'] },
  { foodName: 'eggs', keywords: ['egg', 'omelette', 'omelet'] },
  { foodName: 'protein shake', keywords: ['shake', 'protein', 'smoothie'] },
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

function detectFromText(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      foodName: 'mixed meal',
      confidence: 0.35,
      sourceType: 'fallback',
    };
  }

  let best = null;
  FOOD_KEYWORD_MAP.forEach((entry) => {
    const score = entry.keywords.reduce(
      (count, keyword) => (normalized.includes(keyword) ? count + 1 : count),
      0
    );

    if (!best || score > best.score) {
      best = { ...entry, score };
    }
  });

  if (!best || best.score <= 0) {
    return {
      foodName: 'mixed meal',
      confidence: 0.4,
      sourceType: 'fallback',
    };
  }

  const confidence = Math.min(0.88, 0.58 + best.score * 0.1);
  return {
    foodName: best.foodName,
    confidence,
    sourceType: 'filename_heuristic',
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
      return {
        foodName: String(parsed.foodName || parsed.name || fallback.foodName).trim() || fallback.foodName,
        confidence: clampConfidence(parsed.confidence, fallback.confidence),
        sourceType: 'vision_api',
      };
    }
  } catch (error) {
    // Continue with regex fallback parsing.
  }

  const guess = detectFromText(text);
  return {
    foodName: guess.foodName,
    confidence: clampConfidence(guess.confidence, 0.5),
    sourceType: 'vision_api',
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
                text: `Identify the primary food visible in this image. Respond only as JSON: {"foodName":"...", "confidence":0.00}. Hint: ${hintText || 'none'}`,
              },
              {
                type: 'input_image',
                image_url: `data:${mimeType};base64,${base64Data}`,
              },
            ],
          },
        ],
        max_output_tokens: 120,
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
  const confidence =
    mediaType === 'video'
      ? clampConfidence((chosen.confidence || heuristic.confidence) * 0.9, 0.4)
      : clampConfidence(chosen.confidence, 0.45);

  return {
    foodName: chosen.foodName || heuristic.foodName || 'mixed meal',
    confidence: Number(confidence.toFixed(2)),
    sourceType: chosen.sourceType || heuristic.sourceType || 'fallback',
    mediaType,
  };
}

module.exports = {
  detectFood,
};

const axios = require('axios');
const { detectAllergyWarnings } = require('../utils/allergy');

const TRUSTED_COMMON_FOODS = [
  {
    key: 'chicken-breast-raw',
    foodName: 'Chicken Breast (Raw)',
    brand: null,
    servingSize: '100 g',
    calories: 120,
    protein: 22.5,
    carbs: 0,
    fats: 2.6,
    fiber: 0,
    ingredients: ['chicken breast'],
    ingredientNotes: 'Skinless raw chicken breast.',
    aliases: ['raw chicken breast', 'chicken breast raw', 'chicken raw'],
  },
  {
    key: 'chicken-breast-cooked',
    foodName: 'Chicken Breast (Cooked)',
    brand: null,
    servingSize: '100 g',
    calories: 165,
    protein: 31,
    carbs: 0,
    fats: 3.6,
    fiber: 0,
    ingredients: ['chicken breast'],
    ingredientNotes: 'Roasted or grilled without breading.',
    aliases: ['cooked chicken breast', 'chicken breast cooked', 'grilled chicken'],
  },
  {
    key: 'rice-cooked',
    foodName: 'Rice (Cooked)',
    brand: null,
    servingSize: '100 g',
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fats: 0.3,
    fiber: 0.4,
    ingredients: ['rice'],
    ingredientNotes: 'White rice cooked in water.',
    aliases: ['cooked rice', 'rice cooked', 'white rice cooked'],
  },
  {
    key: 'rice-raw',
    foodName: 'Rice (Raw)',
    brand: null,
    servingSize: '100 g',
    calories: 360,
    protein: 6.6,
    carbs: 80,
    fats: 0.6,
    fiber: 1,
    ingredients: ['rice'],
    ingredientNotes: 'Uncooked white rice.',
    aliases: ['raw rice', 'rice raw', 'dry rice'],
  },
  {
    key: 'oats',
    foodName: 'Oats (Dry)',
    brand: null,
    servingSize: '40 g',
    calories: 154,
    protein: 6.5,
    carbs: 27,
    fats: 3.2,
    fiber: 4,
    ingredients: ['oats'],
    ingredientNotes: 'Rolled oats, dry.',
    aliases: ['oats', 'rolled oats', 'oatmeal dry'],
  },
  {
    key: 'egg-whole',
    foodName: 'Whole Egg',
    brand: null,
    servingSize: '1 large egg',
    calories: 72,
    protein: 6.3,
    carbs: 0.4,
    fats: 4.8,
    fiber: 0,
    ingredients: ['egg'],
    ingredientNotes: 'Whole chicken egg.',
    aliases: ['egg', 'eggs', 'whole egg'],
  },
  {
    key: 'milk-2pct',
    foodName: 'Milk (2%)',
    brand: null,
    servingSize: '1 cup (244 ml)',
    calories: 122,
    protein: 8,
    carbs: 12,
    fats: 5,
    fiber: 0,
    ingredients: ['milk'],
    ingredientNotes: 'Dairy milk, 2% fat.',
    aliases: ['milk', '2% milk', 'dairy milk'],
  },
  {
    key: 'yogurt-greek',
    foodName: 'Greek Yogurt (Plain)',
    brand: null,
    servingSize: '170 g',
    calories: 100,
    protein: 17,
    carbs: 6,
    fats: 0.7,
    fiber: 0,
    ingredients: ['yogurt', 'milk cultures'],
    ingredientNotes: 'Plain nonfat greek yogurt.',
    aliases: ['greek yogurt', 'plain yogurt', 'yogurt'],
  },
  {
    key: 'salmon-cooked',
    foodName: 'Salmon (Cooked)',
    brand: null,
    servingSize: '100 g',
    calories: 206,
    protein: 22,
    carbs: 0,
    fats: 12,
    fiber: 0,
    ingredients: ['salmon'],
    ingredientNotes: 'Cooked Atlantic salmon.',
    aliases: ['salmon', 'cooked salmon', 'salmon cooked'],
  },
  {
    key: 'potato-boiled',
    foodName: 'Potato (Boiled)',
    brand: null,
    servingSize: '100 g',
    calories: 87,
    protein: 1.9,
    carbs: 20,
    fats: 0.1,
    fiber: 1.8,
    ingredients: ['potato'],
    ingredientNotes: 'Boiled potato with skin removed.',
    aliases: ['potato', 'boiled potato', 'cooked potato'],
  },
  {
    key: 'broccoli-cooked',
    foodName: 'Broccoli (Cooked)',
    brand: null,
    servingSize: '100 g',
    calories: 35,
    protein: 2.4,
    carbs: 7.2,
    fats: 0.4,
    fiber: 3.3,
    ingredients: ['broccoli'],
    ingredientNotes: 'Steamed broccoli.',
    aliases: ['broccoli', 'cooked broccoli', 'steamed broccoli'],
  },
  {
    key: 'banana',
    foodName: 'Banana',
    brand: null,
    servingSize: '1 medium',
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fats: 0.4,
    fiber: 3.1,
    ingredients: ['banana'],
    ingredientNotes: 'Raw banana.',
    aliases: ['banana'],
  },
  {
    key: 'peanut-butter',
    foodName: 'Peanut Butter',
    brand: null,
    servingSize: '2 tbsp (32 g)',
    calories: 188,
    protein: 8,
    carbs: 7,
    fats: 16,
    fiber: 3,
    ingredients: ['peanuts', 'salt'],
    ingredientNotes: 'Contains peanuts.',
    aliases: ['peanut butter', 'peanut spread'],
  },
];

const BRANDED_AND_RESTAURANT_FALLBACKS = [
  {
    foodName: "McDonald's Big Mac",
    brand: "McDonald's",
    servingSize: '1 burger',
    calories: 550,
    protein: 25,
    carbs: 45,
    fats: 30,
    fiber: 3,
    ingredients: ['beef patty', 'bun', 'cheese', 'special sauce', 'lettuce'],
    sourceType: 'fallback',
  },
  {
    foodName: "Ben & Jerry's Chocolate Brownie Ice Cream",
    brand: "Ben & Jerry's",
    servingSize: '2/3 cup',
    calories: 390,
    protein: 6,
    carbs: 43,
    fats: 23,
    fiber: 2,
    ingredients: ['milk', 'cream', 'sugar', 'brownie pieces', 'cocoa'],
    sourceType: 'fallback',
  },
  {
    foodName: 'Chocolate Peanut Protein Bar',
    brand: 'Generic Fitness Brand',
    servingSize: '1 bar',
    calories: 220,
    protein: 20,
    carbs: 23,
    fats: 7,
    fiber: 8,
    ingredients: ['whey protein', 'peanuts', 'soy crisps', 'cocoa'],
    sourceType: 'fallback',
  },
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function roundNutrition(item) {
  return {
    calories: Number(Number(item.calories || 0).toFixed(0)),
    protein: Number(Number(item.protein || 0).toFixed(1)),
    carbs: Number(Number(item.carbs || 0).toFixed(1)),
    fats: Number(Number(item.fats || 0).toFixed(1)),
    fiber: Number(Number(item.fiber || 0).toFixed(1)),
  };
}

function withAllergyWarnings(item, allergies = []) {
  const warnings = detectAllergyWarnings(allergies, item.ingredients || []);
  return {
    ...item,
    allergyWarnings: warnings,
  };
}

function exactTrustedMatch(query) {
  const text = normalizeText(query);
  if (!text) {
    return null;
  }

  return (
    TRUSTED_COMMON_FOODS.find(
      (item) => item.key === text || normalizeText(item.foodName) === text || item.aliases.includes(text)
    ) || null
  );
}

function scoreTrustedCandidate(query, candidate) {
  const text = normalizeText(query);
  const hay = [candidate.foodName, ...(candidate.aliases || []), candidate.ingredientNotes]
    .filter(Boolean)
    .map(normalizeText)
    .join(' ');

  let score = 0;
  if (hay.includes(text)) {
    score += 5;
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  tokens.forEach((token) => {
    if (hay.includes(token)) {
      score += 1;
    }
  });

  return score;
}

function pickTrustedBySearch(query) {
  const direct = exactTrustedMatch(query);
  if (direct) {
    return direct;
  }

  const ranked = TRUSTED_COMMON_FOODS.map((candidate) => ({
    candidate,
    score: scoreTrustedCandidate(query, candidate),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.candidate || null;
}

function projectTrusted(item) {
  const macros = roundNutrition(item);
  return {
    foodName: item.foodName,
    brand: item.brand,
    servingSize: item.servingSize,
    ...macros,
    ingredients: item.ingredients,
    ingredientNotes: item.ingredientNotes || '',
    sourceType: 'trusted_db',
  };
}

function fallbackFromQuery(query, brand) {
  const text = normalizeText(query);

  const known = BRANDED_AND_RESTAURANT_FALLBACKS.find((item) =>
    normalizeText(`${item.foodName} ${item.brand}`).includes(text)
  );

  if (known) {
    return {
      ...known,
      sourceType: 'fallback',
      ingredientNotes: 'Estimated fallback profile for uncommon/branded food.',
    };
  }

  const seeded = Math.max(1, text.length);
  const calories = 140 + (seeded * 17) % 620;
  const protein = 8 + (seeded * 7) % 45;
  const carbs = 10 + (seeded * 11) % 85;
  const fats = 4 + (seeded * 5) % 28;
  const fiber = 1 + (seeded * 3) % 12;

  return {
    foodName: query,
    brand: brand || null,
    servingSize: '1 serving',
    calories,
    protein,
    carbs,
    fats,
    fiber,
    ingredients: ['estimated ingredients profile'],
    ingredientNotes: 'Fallback estimate. Replace with external API for production nutrition fidelity.',
    sourceType: 'fallback',
  };
}

function mapOpenFoodFactsProduct(product) {
  const nutriments = product?.nutriments || {};
  const ingredients = Array.isArray(product.ingredients_tags)
    ? product.ingredients_tags.map((item) => item.replace(/^en:/, '').replace(/-/g, ' ')).slice(0, 20)
    : [];

  const caloriesPer100 = Number(nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0);
  const protein = Number(nutriments.proteins_100g || nutriments.proteins || 0);
  const carbs = Number(nutriments.carbohydrates_100g || nutriments.carbohydrates || 0);
  const fats = Number(nutriments.fat_100g || nutriments.fat || 0);
  const fiber = Number(nutriments.fiber_100g || nutriments.fiber || 0);

  return {
    foodName: product.product_name || product.generic_name || 'Food item',
    brand: product.brands || null,
    servingSize: product.serving_size || '100 g',
    calories: caloriesPer100,
    protein,
    carbs,
    fats,
    fiber,
    ingredients,
    ingredientNotes: product.ingredients_text || '',
    sourceType: 'api',
  };
}

async function lookupFromExternalApi(query) {
  const response = await axios.get('https://world.openfoodfacts.org/cgi/search.pl', {
    params: {
      search_terms: query,
      search_simple: 1,
      action: 'process',
      json: 1,
      page_size: 3,
    },
    timeout: 3000,
  });

  const products = Array.isArray(response.data?.products) ? response.data.products : [];

  const candidate = products.find(
    (item) => item.product_name && item.nutriments && (item.nutriments['energy-kcal_100g'] || item.nutriments['energy-kcal'])
  );

  if (!candidate) {
    return null;
  }

  return mapOpenFoodFactsProduct(candidate);
}

function formatLookupResponse(item, allergies = []) {
  const withWarnings = withAllergyWarnings(
    {
      ...item,
      ...roundNutrition(item),
      ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
    },
    allergies
  );

  return {
    foodName: withWarnings.foodName,
    brand: withWarnings.brand || null,
    servingSize: withWarnings.servingSize || '1 serving',
    calories: withWarnings.calories,
    protein: withWarnings.protein,
    carbs: withWarnings.carbs,
    fats: withWarnings.fats,
    fiber: withWarnings.fiber,
    ingredients: withWarnings.ingredients,
    ingredientNotes: withWarnings.ingredientNotes || '',
    allergyWarnings: withWarnings.allergyWarnings,
    sourceType: withWarnings.sourceType,
  };
}

async function lookupFood({ query, brand, allergies = [] }) {
  const trusted = pickTrustedBySearch(query);
  if (trusted) {
    return formatLookupResponse(projectTrusted(trusted), allergies);
  }

  try {
    const apiItem = await lookupFromExternalApi(query);
    if (apiItem) {
      return formatLookupResponse(apiItem, allergies);
    }
  } catch (error) {
    // Fail open to deterministic fallback profile.
  }

  return formatLookupResponse(fallbackFromQuery(query, brand), allergies);
}

async function globalSearchFoods({ query, allergies = [], limit = 8 }) {
  const normalizedLimit = Math.max(1, Math.min(limit, 20));
  const trustedMatches = TRUSTED_COMMON_FOODS.map((item) => ({
    score: scoreTrustedCandidate(query, item),
    item: projectTrusted(item),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, normalizedLimit)
    .map((entry) => formatLookupResponse(entry.item, allergies));

  if (trustedMatches.length >= normalizedLimit) {
    return trustedMatches;
  }

  const fallback = formatLookupResponse(fallbackFromQuery(query), allergies);
  const merged = [...trustedMatches];

  if (!merged.some((item) => normalizeText(item.foodName) === normalizeText(fallback.foodName))) {
    merged.push(fallback);
  }

  return merged.slice(0, normalizedLimit);
}

module.exports = {
  lookupFood,
  globalSearchFoods,
};

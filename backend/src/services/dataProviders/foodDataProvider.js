const { readCached, writeCached } = require('./providerCache');

const CACHE_SCOPE = 'food-data-provider';
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_POOL_SIZE = 220;

const BASE_FOODS = [
  {
    foodName: 'Chicken Breast (Grilled)',
    servingSize: '100 g',
    calories: 165,
    protein: 31,
    carbs: 0,
    fats: 3.6,
    fiber: 0,
    cuisine: 'american',
    ingredients: ['chicken breast'],
    tags: ['high-protein', 'low-carb', 'lean', 'dinner'],
    dietTags: ['non-veg'],
  },
  {
    foodName: 'Salmon Fillet (Baked)',
    servingSize: '100 g',
    calories: 206,
    protein: 22,
    carbs: 0,
    fats: 12,
    fiber: 0,
    cuisine: 'mediterranean',
    ingredients: ['salmon'],
    tags: ['high-protein', 'omega-3', 'dinner'],
    dietTags: ['non-veg'],
  },
  {
    foodName: 'Turkey Breast',
    servingSize: '100 g',
    calories: 135,
    protein: 30,
    carbs: 0,
    fats: 1,
    fiber: 0,
    cuisine: 'american',
    ingredients: ['turkey breast'],
    tags: ['high-protein', 'low-fat', 'lunch'],
    dietTags: ['non-veg'],
  },
  {
    foodName: 'Egg Whites',
    servingSize: '100 g',
    calories: 52,
    protein: 11,
    carbs: 0.7,
    fats: 0.2,
    fiber: 0,
    cuisine: 'global',
    ingredients: ['egg whites'],
    tags: ['high-protein', 'breakfast', 'low-fat'],
    dietTags: ['veg', 'non-veg'],
  },
  {
    foodName: 'Whole Egg',
    servingSize: '1 large',
    calories: 72,
    protein: 6.3,
    carbs: 0.4,
    fats: 4.8,
    fiber: 0,
    cuisine: 'global',
    ingredients: ['egg'],
    tags: ['protein', 'breakfast'],
    dietTags: ['veg', 'non-veg'],
  },
  {
    foodName: 'Paneer',
    servingSize: '100 g',
    calories: 265,
    protein: 18,
    carbs: 3.4,
    fats: 20,
    fiber: 0,
    cuisine: 'indian',
    ingredients: ['milk solids'],
    tags: ['high-protein', 'vegetarian', 'dinner'],
    dietTags: ['veg'],
  },
  {
    foodName: 'Firm Tofu',
    servingSize: '100 g',
    calories: 144,
    protein: 17,
    carbs: 3,
    fats: 9,
    fiber: 2,
    cuisine: 'asian',
    ingredients: ['soybeans'],
    tags: ['high-protein', 'vegan', 'dinner'],
    dietTags: ['vegan', 'veg'],
  },
  {
    foodName: 'Tempeh',
    servingSize: '100 g',
    calories: 193,
    protein: 20,
    carbs: 9,
    fats: 11,
    fiber: 5,
    cuisine: 'asian',
    ingredients: ['soybeans'],
    tags: ['high-protein', 'vegan', 'fiber'],
    dietTags: ['vegan', 'veg'],
  },
  {
    foodName: 'Greek Yogurt (Plain)',
    servingSize: '170 g',
    calories: 100,
    protein: 17,
    carbs: 6,
    fats: 0.7,
    fiber: 0,
    cuisine: 'mediterranean',
    ingredients: ['milk cultures'],
    tags: ['high-protein', 'breakfast', 'snack'],
    dietTags: ['veg', 'non-veg'],
  },
  {
    foodName: 'Cottage Cheese',
    servingSize: '100 g',
    calories: 98,
    protein: 11,
    carbs: 3.4,
    fats: 4.3,
    fiber: 0,
    cuisine: 'american',
    ingredients: ['milk curds'],
    tags: ['high-protein', 'snack', 'low-carb'],
    dietTags: ['veg', 'non-veg'],
  },
  {
    foodName: 'Lentils (Cooked)',
    servingSize: '100 g',
    calories: 116,
    protein: 9,
    carbs: 20,
    fats: 0.4,
    fiber: 8,
    cuisine: 'indian',
    ingredients: ['lentils'],
    tags: ['vegan', 'high-fiber', 'carb-balanced'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Black Beans (Cooked)',
    servingSize: '100 g',
    calories: 132,
    protein: 8.9,
    carbs: 24,
    fats: 0.5,
    fiber: 8.7,
    cuisine: 'mexican',
    ingredients: ['black beans'],
    tags: ['high-fiber', 'vegan', 'carbs'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Chickpeas (Cooked)',
    servingSize: '100 g',
    calories: 164,
    protein: 8.9,
    carbs: 27.4,
    fats: 2.6,
    fiber: 7.6,
    cuisine: 'mediterranean',
    ingredients: ['chickpeas'],
    tags: ['high-fiber', 'vegan', 'carbs'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Oats (Dry)',
    servingSize: '40 g',
    calories: 154,
    protein: 6.5,
    carbs: 27,
    fats: 3.2,
    fiber: 4,
    cuisine: 'global',
    ingredients: ['oats'],
    tags: ['breakfast', 'high-fiber', 'carbs'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Quinoa (Cooked)',
    servingSize: '100 g',
    calories: 120,
    protein: 4.4,
    carbs: 21.3,
    fats: 1.9,
    fiber: 2.8,
    cuisine: 'global',
    ingredients: ['quinoa'],
    tags: ['vegan', 'carbs', 'lunch'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Brown Rice (Cooked)',
    servingSize: '100 g',
    calories: 123,
    protein: 2.7,
    carbs: 25.6,
    fats: 1,
    fiber: 1.6,
    cuisine: 'asian',
    ingredients: ['brown rice'],
    tags: ['carbs', 'lunch', 'dinner'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'White Rice (Cooked)',
    servingSize: '100 g',
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fats: 0.3,
    fiber: 0.4,
    cuisine: 'asian',
    ingredients: ['white rice'],
    tags: ['carbs', 'lunch', 'dinner'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Sweet Potato (Baked)',
    servingSize: '100 g',
    calories: 90,
    protein: 2,
    carbs: 21,
    fats: 0.1,
    fiber: 3.3,
    cuisine: 'american',
    ingredients: ['sweet potato'],
    tags: ['carbs', 'high-fiber', 'dinner'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Whole Wheat Bread',
    servingSize: '1 slice',
    calories: 80,
    protein: 4,
    carbs: 14,
    fats: 1.1,
    fiber: 2,
    cuisine: 'global',
    ingredients: ['whole wheat flour'],
    tags: ['carbs', 'breakfast', 'snack'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Avocado',
    servingSize: '100 g',
    calories: 160,
    protein: 2,
    carbs: 9,
    fats: 15,
    fiber: 7,
    cuisine: 'mexican',
    ingredients: ['avocado'],
    tags: ['healthy-fats', 'high-fiber', 'lunch'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Almonds',
    servingSize: '30 g',
    calories: 174,
    protein: 6.4,
    carbs: 6.1,
    fats: 15,
    fiber: 3.5,
    cuisine: 'global',
    ingredients: ['almonds'],
    tags: ['healthy-fats', 'snack', 'high-fiber'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Walnuts',
    servingSize: '30 g',
    calories: 185,
    protein: 4.3,
    carbs: 3.9,
    fats: 18.5,
    fiber: 1.9,
    cuisine: 'global',
    ingredients: ['walnuts'],
    tags: ['healthy-fats', 'snack'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Peanut Butter',
    servingSize: '32 g',
    calories: 188,
    protein: 8,
    carbs: 7,
    fats: 16,
    fiber: 3,
    cuisine: 'american',
    ingredients: ['peanuts', 'salt'],
    tags: ['healthy-fats', 'high-protein', 'snack'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Broccoli (Steamed)',
    servingSize: '100 g',
    calories: 35,
    protein: 2.4,
    carbs: 7.2,
    fats: 0.4,
    fiber: 3.3,
    cuisine: 'global',
    ingredients: ['broccoli'],
    tags: ['high-fiber', 'low-calorie', 'dinner'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Spinach (Cooked)',
    servingSize: '100 g',
    calories: 23,
    protein: 2.9,
    carbs: 3.8,
    fats: 0.4,
    fiber: 2.4,
    cuisine: 'global',
    ingredients: ['spinach'],
    tags: ['low-calorie', 'high-fiber', 'lunch'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Mixed Salad Bowl',
    servingSize: '200 g',
    calories: 75,
    protein: 3.5,
    carbs: 10,
    fats: 2,
    fiber: 4.5,
    cuisine: 'mediterranean',
    ingredients: ['lettuce', 'tomato', 'cucumber', 'olive oil'],
    tags: ['low-calorie', 'high-fiber', 'lunch', 'dinner'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Banana',
    servingSize: '1 medium',
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fats: 0.4,
    fiber: 3.1,
    cuisine: 'global',
    ingredients: ['banana'],
    tags: ['carbs', 'snack', 'pre-workout'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Apple',
    servingSize: '1 medium',
    calories: 95,
    protein: 0.5,
    carbs: 25,
    fats: 0.3,
    fiber: 4.4,
    cuisine: 'global',
    ingredients: ['apple'],
    tags: ['snack', 'high-fiber', 'low-fat'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Blueberries',
    servingSize: '100 g',
    calories: 57,
    protein: 0.7,
    carbs: 14.5,
    fats: 0.3,
    fiber: 2.4,
    cuisine: 'global',
    ingredients: ['blueberries'],
    tags: ['snack', 'antioxidants', 'low-calorie'],
    dietTags: ['vegan', 'veg', 'non-veg'],
  },
  {
    foodName: 'Protein Shake',
    servingSize: '1 scoop + water',
    calories: 120,
    protein: 24,
    carbs: 3,
    fats: 2,
    fiber: 1,
    cuisine: 'fitness',
    ingredients: ['whey protein isolate'],
    tags: ['high-protein', 'post-workout', 'snack'],
    dietTags: ['veg', 'non-veg'],
  },
  {
    foodName: 'Chicken Burrito Bowl',
    servingSize: '1 bowl',
    calories: 620,
    protein: 41,
    carbs: 62,
    fats: 21,
    fiber: 10,
    cuisine: 'mexican',
    ingredients: ['chicken', 'rice', 'beans', 'corn', 'salsa'],
    tags: ['restaurant', 'high-protein', 'lunch', 'dinner'],
    dietTags: ['non-veg'],
  },
  {
    foodName: 'Tofu Burrito Bowl',
    servingSize: '1 bowl',
    calories: 560,
    protein: 24,
    carbs: 70,
    fats: 20,
    fiber: 12,
    cuisine: 'mexican',
    ingredients: ['tofu', 'rice', 'beans', 'corn', 'salsa'],
    tags: ['restaurant', 'vegan', 'high-fiber', 'lunch', 'dinner'],
    dietTags: ['vegan', 'veg'],
  },
  {
    foodName: 'Grilled Chicken Caesar Salad',
    servingSize: '1 bowl',
    calories: 420,
    protein: 35,
    carbs: 15,
    fats: 24,
    fiber: 5,
    cuisine: 'american',
    ingredients: ['chicken', 'romaine', 'parmesan', 'dressing'],
    tags: ['restaurant', 'high-protein', 'low-carb', 'lunch'],
    dietTags: ['non-veg'],
  },
  {
    foodName: 'Veggie Omelette',
    servingSize: '1 serving',
    calories: 280,
    protein: 20,
    carbs: 9,
    fats: 18,
    fiber: 2,
    cuisine: 'american',
    ingredients: ['egg', 'spinach', 'mushroom', 'pepper'],
    tags: ['breakfast', 'high-protein', 'low-carb'],
    dietTags: ['veg', 'non-veg'],
  },
  {
    foodName: 'Overnight Oats',
    servingSize: '1 jar',
    calories: 320,
    protein: 14,
    carbs: 46,
    fats: 9,
    fiber: 8,
    cuisine: 'global',
    ingredients: ['oats', 'milk', 'chia seeds', 'berries'],
    tags: ['breakfast', 'high-fiber', 'carbs'],
    dietTags: ['veg', 'non-veg'],
  },
  {
    foodName: 'Turkey Sandwich',
    servingSize: '1 sandwich',
    calories: 390,
    protein: 30,
    carbs: 38,
    fats: 11,
    fiber: 6,
    cuisine: 'american',
    ingredients: ['whole grain bread', 'turkey', 'lettuce', 'tomato'],
    tags: ['lunch', 'high-protein', 'balanced'],
    dietTags: ['non-veg'],
  },
];

const PORTION_VARIANTS = [
  { id: 'sm', label: 'small', multiplier: 0.75 },
  { id: 'md', label: 'regular', multiplier: 1 },
  { id: 'lg', label: 'large', multiplier: 1.25 },
  { id: 'xl', label: 'x-large', multiplier: 1.5 },
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function round(value, decimals = 1) {
  return Number(Number(value || 0).toFixed(decimals));
}

function scoreByMacroFocus(item, macroFocus) {
  const focus = normalizeText(macroFocus);
  if (focus === 'protein') {
    return item.protein / Math.max(item.calories, 1);
  }
  if (focus === 'carbs') {
    return item.carbs / Math.max(item.calories, 1);
  }
  if (focus === 'fats' || focus === 'fat') {
    return item.fats / Math.max(item.calories, 1);
  }
  if (focus === 'fiber') {
    return item.fiber / Math.max(item.calories, 1);
  }
  return (item.protein + item.fiber) / Math.max(item.calories, 1);
}

function buildLocalFoodCatalog() {
  const rows = [];
  BASE_FOODS.forEach((food, index) => {
    PORTION_VARIANTS.forEach((portion) => {
      const calories = round(food.calories * portion.multiplier, 0);
      const protein = round(food.protein * portion.multiplier);
      const carbs = round(food.carbs * portion.multiplier);
      const fats = round(food.fats * portion.multiplier);
      const fiber = round(food.fiber * portion.multiplier);

      rows.push({
        id: `food-${index + 1}-${portion.id}`,
        foodName: `${food.foodName} (${portion.label})`,
        baseFoodName: food.foodName,
        servingSize: food.servingSize,
        portionLabel: portion.label,
        calories,
        protein,
        carbs,
        fats,
        fiber,
        cuisine: food.cuisine,
        ingredients: [...food.ingredients],
        tags: Array.from(new Set([...food.tags, portion.label])),
        dietTags: Array.isArray(food.dietTags) ? [...food.dietTags] : [],
        sourceType: 'local_dataset',
      });
    });
  });

  return rows;
}

function applyContextOrdering(items = [], context = {}) {
  const macroFocus = normalizeText(context.macroFocus || '');
  const mealType = normalizeText(context.mealType || '');
  const preferredDiet = normalizeText(context.preferredDiet || '');
  const queryText = normalizeText(context.query || '');

  const filtered = items.filter((item) => {
    if (preferredDiet) {
      const diets = (item.dietTags || []).map(normalizeText);
      if (diets.length && !diets.includes(preferredDiet)) {
        return false;
      }
    }

    if (queryText) {
      const hay = normalizeText(
        `${item.foodName} ${item.baseFoodName || ''} ${(item.ingredients || []).join(' ')} ${(item.tags || []).join(' ')}`
      );
      if (!hay.includes(queryText)) {
        return false;
      }
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    const aMacro = scoreByMacroFocus(a, macroFocus);
    const bMacro = scoreByMacroFocus(b, macroFocus);
    if (bMacro !== aMacro) {
      return bMacro - aMacro;
    }

    const aMealBonus = a.tags.includes(mealType) ? 0.08 : 0;
    const bMealBonus = b.tags.includes(mealType) ? 0.08 : 0;
    const aQuality = (a.protein + a.fiber) / Math.max(a.calories, 1) + aMealBonus;
    const bQuality = (b.protein + b.fiber) / Math.max(b.calories, 1) + bMealBonus;
    return bQuality - aQuality;
  });
}

async function getFoods(context = {}) {
  const requested = clamp(toNumber(context.limit, DEFAULT_POOL_SIZE), 100, 500);
  const cacheKeyParts = ['local', requested];
  const cached = readCached(CACHE_SCOPE, cacheKeyParts, CACHE_TTL_MS);
  if (cached) {
    return applyContextOrdering(cached, context).slice(0, requested);
  }

  const local = buildLocalFoodCatalog();
  const extraRows = [];

  for (let i = 0; i < local.length; i += 1) {
    const base = local[i];
    extraRows.push({
      ...base,
      id: `${base.id}-pre`,
      foodName: `${base.baseFoodName || base.foodName} (pre-workout)`,
      tags: Array.from(new Set([...base.tags, 'pre-workout', 'energy'])),
      carbs: round(base.carbs * 1.1),
      calories: round(base.calories * 1.08, 0),
    });
    extraRows.push({
      ...base,
      id: `${base.id}-post`,
      foodName: `${base.baseFoodName || base.foodName} (post-workout)`,
      tags: Array.from(new Set([...base.tags, 'post-workout', 'recovery'])),
      protein: round(base.protein * 1.12),
      calories: round(base.calories * 1.05, 0),
    });
  }

  const combined = [...local, ...extraRows];
  writeCached(CACHE_SCOPE, cacheKeyParts, combined);
  return applyContextOrdering(combined, context).slice(0, requested);
}

module.exports = {
  getFoods,
};

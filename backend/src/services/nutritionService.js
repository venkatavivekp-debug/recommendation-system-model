const crypto = require('crypto');

const INGREDIENTS_POOL = [
  'whole grain flour',
  'olive oil',
  'garlic',
  'sea salt',
  'spinach',
  'black beans',
  'chickpeas',
  'avocado',
  'greek yogurt',
  'almond milk',
  'cocoa',
  'banana',
  'tomato',
  'onion',
  'bell pepper',
  'lemon zest',
  'oregano',
  'chili flakes',
  'tofu',
  'paneer',
  'chicken breast',
  'salmon',
  'egg whites',
  'brown rice',
  'quinoa',
  'oats',
];

function pickNumber(seed, min, max) {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const value = parseInt(hash.slice(0, 8), 16);
  const range = max - min + 1;
  return min + (value % range);
}

function pickIngredients(seedKeyword) {
  const indexes = new Set();
  let cursor = 0;

  while (indexes.size < 5) {
    const fragment = crypto
      .createHash('sha256')
      .update(`${seedKeyword}:${cursor}`)
      .digest('hex')
      .slice(0, 4);

    indexes.add(parseInt(fragment, 16) % INGREDIENTS_POOL.length);
    cursor += 1;
  }

  return Array.from(indexes).map((index) => INGREDIENTS_POOL[index]);
}

function deriveDietTags(nutrition, ingredients) {
  const normalized = ingredients.join(' ').toLowerCase();

  const tags = ['balanced'];

  if (nutrition.protein >= nutrition.carbs) {
    tags.push('high-protein');
  }

  if (nutrition.carbs >= nutrition.protein + 12) {
    tags.push('high-carb');
  }

  if (nutrition.calories < 420) {
    tags.push('low-calorie');
  }

  if (!/(chicken|salmon|egg)/i.test(normalized)) {
    tags.push('vegetarian');
  }

  return Array.from(new Set(tags));
}

function buildNutrition(keyword, seed) {
  const seedText = `${keyword}:${seed}`;

  const calories = pickNumber(`${seedText}:calories`, 220, 980);
  const protein = pickNumber(`${seedText}:protein`, 8, 65);
  const carbs = pickNumber(`${seedText}:carbs`, 12, 125);
  const fats = pickNumber(`${seedText}:fats`, 5, 48);
  const ingredients = pickIngredients(`${keyword}:${seed}`).concat(keyword.toLowerCase());

  return {
    calories,
    protein,
    carbs,
    fats,
    ingredients,
    dietTags: deriveDietTags({ calories, protein, carbs, fats }, ingredients),
  };
}

function matchesFilters(nutrition, filters) {
  const { minCalories, maxCalories, macroFocus, preferredDiet } = filters;

  if (minCalories !== null && nutrition.calories < minCalories) {
    return false;
  }

  if (maxCalories !== null && nutrition.calories > maxCalories) {
    return false;
  }

  if (macroFocus === 'protein' && nutrition.protein < nutrition.carbs) {
    return false;
  }

  if (macroFocus === 'carb' && nutrition.carbs < nutrition.protein) {
    return false;
  }

  if (preferredDiet && !nutrition.dietTags.includes(String(preferredDiet).toLowerCase())) {
    return false;
  }

  return true;
}

module.exports = {
  buildNutrition,
  matchesFilters,
};

const { detectAllergyWarnings, isAllergySafe } = require('../utils/allergy');

const PROTEIN_BASES = [
  {
    name: 'Chicken Breast',
    per100g: { calories: 165, protein: 31, carbs: 0, fats: 3.6, fiber: 0 },
    diets: ['non-veg'],
    cuisineTags: ['american', 'mediterranean'],
  },
  {
    name: 'Salmon Fillet',
    per100g: { calories: 206, protein: 22, carbs: 0, fats: 12, fiber: 0 },
    diets: ['non-veg'],
    cuisineTags: ['japanese', 'mediterranean'],
  },
  {
    name: 'Paneer',
    per100g: { calories: 260, protein: 18, carbs: 4, fats: 20, fiber: 0 },
    diets: ['veg'],
    cuisineTags: ['indian'],
  },
  {
    name: 'Tofu',
    per100g: { calories: 144, protein: 17, carbs: 3, fats: 8, fiber: 2 },
    diets: ['veg', 'vegan'],
    cuisineTags: ['asian'],
  },
  {
    name: 'Greek Yogurt',
    per100g: { calories: 59, protein: 10, carbs: 3.6, fats: 0.4, fiber: 0 },
    diets: ['veg'],
    cuisineTags: ['mediterranean'],
  },
  {
    name: 'Lentils (Cooked)',
    per100g: { calories: 116, protein: 9, carbs: 20, fats: 0.4, fiber: 8 },
    diets: ['veg', 'vegan'],
    cuisineTags: ['indian', 'middle-eastern'],
  },
];

const CARB_BASES = [
  {
    name: 'Cooked Rice',
    per100g: { calories: 130, protein: 2.7, carbs: 28, fats: 0.3, fiber: 0.4 },
  },
  {
    name: 'Sweet Potato',
    per100g: { calories: 86, protein: 1.6, carbs: 20, fats: 0.1, fiber: 3 },
  },
  {
    name: 'Whole Grain Bread',
    per100g: { calories: 247, protein: 13, carbs: 41, fats: 4.2, fiber: 7 },
  },
  {
    name: 'Oats',
    per100g: { calories: 389, protein: 17, carbs: 66, fats: 7, fiber: 10 },
  },
  {
    name: 'Quinoa (Cooked)',
    per100g: { calories: 120, protein: 4.4, carbs: 21, fats: 1.9, fiber: 2.8 },
  },
];

const VEGETABLES_AND_FIBER = [
  {
    name: 'Broccoli',
    per100g: { calories: 35, protein: 2.4, carbs: 7.2, fats: 0.4, fiber: 3.3 },
  },
  {
    name: 'Spinach',
    per100g: { calories: 23, protein: 2.9, carbs: 3.6, fats: 0.4, fiber: 2.2 },
  },
  {
    name: 'Mixed Vegetables',
    per100g: { calories: 65, protein: 2.3, carbs: 12, fats: 0.5, fiber: 4 },
  },
  {
    name: 'Avocado',
    per100g: { calories: 160, protein: 2, carbs: 9, fats: 15, fiber: 7 },
  },
];

const POPULAR_RECIPE_HINTS = {
  chicken: 'https://www.youtube.com/results?search_query=garlic+chicken+rice+bowl+recipe',
  tofu: 'https://www.youtube.com/results?search_query=high+protein+tofu+bowl+recipe',
  oats: 'https://www.youtube.com/results?search_query=overnight+oats+high+protein+recipe',
  lentils: 'https://www.youtube.com/results?search_query=healthy+lentil+bowl+recipe',
  salmon: 'https://www.youtube.com/results?search_query=salmon+rice+bowl+meal+prep',
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundMacro(value) {
  return Number(Number(value || 0).toFixed(1));
}

function scaleMacros(per100g, grams) {
  const ratio = grams / 100;
  return {
    calories: roundMacro(per100g.calories * ratio),
    protein: roundMacro(per100g.protein * ratio),
    carbs: roundMacro(per100g.carbs * ratio),
    fats: roundMacro(per100g.fats * ratio),
    fiber: roundMacro(per100g.fiber * ratio),
  };
}

function sumMacros(items) {
  return items.reduce(
    (acc, item) => {
      acc.calories += toNumber(item.macros?.calories);
      acc.protein += toNumber(item.macros?.protein);
      acc.carbs += toNumber(item.macros?.carbs);
      acc.fats += toNumber(item.macros?.fats);
      acc.fiber += toNumber(item.macros?.fiber);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );
}

function normalizeDiet(diet) {
  const value = String(diet || '').toLowerCase();
  if (['veg', 'vegan', 'non-veg'].includes(value)) {
    return value;
  }

  return 'non-veg';
}

function pickPrimaryProtein({ preferredDiet, preferredCuisine, allergies }) {
  const diet = normalizeDiet(preferredDiet);
  const cuisine = String(preferredCuisine || '').toLowerCase();

  const candidates = PROTEIN_BASES.filter(
    (item) => item.diets.includes(diet) || (diet === 'non-veg' && item.diets.includes('veg'))
  ).filter((item) => isAllergySafe(allergies, [item.name]));

  if (!candidates.length) {
    return PROTEIN_BASES.find((item) => isAllergySafe(allergies, [item.name])) || PROTEIN_BASES[0];
  }

  const cuisineHit = candidates.find((item) =>
    item.cuisineTags.some((tag) => cuisine.includes(tag))
  );

  return cuisineHit || candidates[0];
}

function pickCarbBase(remaining, ingredientFocus = []) {
  const focus = ingredientFocus.map((item) => String(item || '').toLowerCase());

  const focusHit = CARB_BASES.find((item) =>
    focus.some((token) => item.name.toLowerCase().includes(token))
  );
  if (focusHit) {
    return focusHit;
  }

  if (toNumber(remaining.carbs) <= 15) {
    return null;
  }

  if (toNumber(remaining.carbs) >= 60) {
    return CARB_BASES.find((item) => item.name === 'Cooked Rice') || CARB_BASES[0];
  }

  return CARB_BASES.find((item) => item.name === 'Quinoa (Cooked)') || CARB_BASES[0];
}

function pickFiberOption(remaining, allergies = []) {
  if (toNumber(remaining.fiber) <= 5) {
    return null;
  }

  return VEGETABLES_AND_FIBER.find((item) => isAllergySafe(allergies, [item.name])) || VEGETABLES_AND_FIBER[0];
}

function buildIngredientLine(item, grams) {
  const normalizedGrams = Math.max(30, Math.round(grams / 10) * 10);
  return {
    name: item.name,
    quantity: `${normalizedGrams} g`,
    grams: normalizedGrams,
    macros: scaleMacros(item.per100g, normalizedGrams),
  };
}

function tuneProteinGrams(base, remainingProtein) {
  const target = clamp(toNumber(remainingProtein, 30), 20, 95);
  const grams = Math.round((target / Math.max(base.per100g.protein, 1)) * 100);
  return clamp(grams, 90, 280);
}

function tuneCarbGrams(base, remainingCarbs) {
  const target = clamp(toNumber(remainingCarbs, 35), 15, 110);
  const grams = Math.round((target / Math.max(base.per100g.carbs, 1)) * 100);
  return clamp(grams, 60, 260);
}

function tuneFiberGrams(base, remainingFiber) {
  const target = clamp(toNumber(remainingFiber, 8), 4, 20);
  const grams = Math.round((target / Math.max(base.per100g.fiber, 1)) * 100);
  return clamp(grams, 80, 260);
}

function composeRationale({ dominantMacro, preferredDiet, fitnessGoal, allergyWarnings }) {
  const lines = [];

  if (dominantMacro === 'protein') {
    lines.push('Prioritizes protein to close your largest macro gap.');
  } else if (dominantMacro === 'carbs') {
    lines.push('Balances energy needs by adding moderate complex carbs.');
  } else if (dominantMacro === 'fiber') {
    lines.push('Improves fiber completion with vegetables and whole foods.');
  } else {
    lines.push('Keeps a balanced macro profile for your remaining day.');
  }

  if (fitnessGoal === 'lose-weight') {
    lines.push('Uses lower-calorie dense ingredients while keeping protein stable.');
  }

  if (fitnessGoal === 'gain-muscle') {
    lines.push('Supports muscle-focused intake with protein-forward components.');
  }

  if (normalizeDiet(preferredDiet) === 'vegan') {
    lines.push('Built to respect vegan preferences.');
  }

  if (allergyWarnings.length) {
    lines.push('Contains allergy conflicts; substitution required.');
  }

  return lines.join(' ');
}

function dominantRemainingMacro(remaining) {
  const candidates = [
    { key: 'protein', value: toNumber(remaining.protein) },
    { key: 'carbs', value: toNumber(remaining.carbs) },
    { key: 'fats', value: toNumber(remaining.fats) },
    { key: 'fiber', value: toNumber(remaining.fiber) },
  ];

  candidates.sort((a, b) => b.value - a.value);
  return candidates[0]?.key || 'balanced';
}

function buildRecipeName(proteinBase, carbBase) {
  const protein = proteinBase?.name || 'Protein';
  const carb = carbBase?.name || 'Grains';

  if (/chicken/i.test(protein) && /rice/i.test(carb)) {
    return 'Garlic Chicken Rice Bowl with Sauteed Greens';
  }

  if (/tofu/i.test(protein)) {
    return 'High-Protein Tofu Grain Bowl';
  }

  if (/salmon/i.test(protein)) {
    return 'Citrus Salmon Bowl with Veggies';
  }

  if (/oats/i.test(carb)) {
    return 'Protein Oats Power Bowl';
  }

  return `${protein} ${carb} Smart Bowl`;
}

function pickYoutubeLink(recipeName, ingredients = []) {
  const text = `${recipeName} ${ingredients.map((item) => item.name).join(' ')}`.toLowerCase();

  const direct = Object.entries(POPULAR_RECIPE_HINTS).find(([key]) => text.includes(key));
  if (direct) {
    return direct[1];
  }

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${recipeName} healthy recipe`
  )}`;
}

function buildRecipeCard({ recipeName, ingredients, totals, allergies, rationale, prepTimeMinutes }) {
  const ingredientNames = ingredients.map((item) => item.name);
  const allergyWarnings = detectAllergyWarnings(allergies, ingredientNames);

  const substitutions = [];
  if (allergyWarnings.some((warning) => warning.toLowerCase().includes('dairy'))) {
    substitutions.push('Swap dairy ingredients with unsweetened soy or almond alternatives.');
  }
  if (allergyWarnings.some((warning) => warning.toLowerCase().includes('peanut'))) {
    substitutions.push('Replace peanut products with sunflower seed butter or extra olive oil.');
  }
  if (!substitutions.length) {
    substitutions.push('Use herbs, lemon, and spices instead of high-calorie sauces.');
  }

  return {
    recipeName,
    ingredients: ingredients.map((item) => ({ name: item.name, amount: item.quantity })),
    cookingSteps: [
      `Prepare and portion ingredients (${ingredients
        .map((item) => `${item.quantity} ${item.name}`)
        .join(', ')}).`,
      'Cook protein with garlic, pepper, and a small amount of olive oil.',
      'Cook carb base separately and season lightly with salt and herbs.',
      'Saute vegetables until tender-crisp and combine into a bowl.',
      'Plate together and finish with lemon juice or preferred low-calorie sauce.',
    ],
    estimatedMacros: {
      calories: roundMacro(totals.calories),
      protein: roundMacro(totals.protein),
      carbs: roundMacro(totals.carbs),
      fats: roundMacro(totals.fats),
      fiber: roundMacro(totals.fiber),
    },
    allergyNotes: allergyWarnings,
    substitutions,
    prepTimeMinutes,
    whyThisFitsYourPlan: rationale,
    youtubeLink: pickYoutubeLink(recipeName, ingredients),
  };
}

function buildGrocerySuggestions(ingredients) {
  const stores = ['Walmart', 'Target'];

  return ingredients.map((item, index) => {
    const query = encodeURIComponent(item.name);
    const store = stores[index % stores.length];

    return {
      ingredient: item.name,
      estimatedPrice: `$${(2.5 + index * 1.2).toFixed(2)}`,
      rating: Number((4.1 + (index % 4) * 0.15).toFixed(1)),
      store,
      buyLink:
        store === 'Walmart'
          ? `https://www.walmart.com/search?q=${query}`
          : `https://www.target.com/s?searchTerm=${query}`,
      viewLink: `https://www.google.com/search?q=${query}+grocery`,
    };
  });
}

function buildSinglePlan({ remaining, allergies, preferences, ingredientFocus }) {
  const proteinBase = pickPrimaryProtein({
    preferredDiet: preferences.preferredDiet,
    preferredCuisine: preferences.preferredCuisine,
    allergies,
  });

  const carbBase = pickCarbBase(remaining, ingredientFocus);
  const fiberBase = pickFiberOption(remaining, allergies);

  const protein = buildIngredientLine(proteinBase, tuneProteinGrams(proteinBase, remaining.protein));
  const ingredients = [protein];

  if (carbBase) {
    ingredients.push(buildIngredientLine(carbBase, tuneCarbGrams(carbBase, remaining.carbs)));
  }

  if (fiberBase) {
    ingredients.push(buildIngredientLine(fiberBase, tuneFiberGrams(fiberBase, remaining.fiber)));
  }

  if (toNumber(remaining.fats) > 6 && !ingredients.some((item) => item.name === 'Avocado')) {
    const avocado = VEGETABLES_AND_FIBER.find((item) => item.name === 'Avocado');
    ingredients.push(buildIngredientLine(avocado, 80));
  }

  const totals = sumMacros(ingredients);
  const warningInputs = ingredients.map((item) => item.name);
  const allergyWarnings = detectAllergyWarnings(allergies, warningInputs);
  const rationale = composeRationale({
    dominantMacro: dominantRemainingMacro(remaining),
    preferredDiet: preferences.preferredDiet,
    fitnessGoal: preferences.fitnessGoal,
    allergyWarnings,
  });

  const recipeName = buildRecipeName(proteinBase, carbBase);

  return {
    ingredients,
    macroTotals: {
      calories: roundMacro(totals.calories),
      protein: roundMacro(totals.protein),
      carbs: roundMacro(totals.carbs),
      fats: roundMacro(totals.fats),
      fiber: roundMacro(totals.fiber),
    },
    allergyWarnings,
    rationale,
    recipe: buildRecipeCard({
      recipeName,
      ingredients,
      totals,
      allergies,
      rationale,
      prepTimeMinutes: 25,
    }),
    grocerySuggestions: buildGrocerySuggestions(ingredients),
  };
}

function varyFocus(baseFocus, round) {
  if (!baseFocus.length) {
    return [];
  }

  if (round % 2 === 0) {
    return baseFocus;
  }

  return [...baseFocus].reverse();
}

function buildMealSuggestions({
  remaining,
  allergies = [],
  preferences = {},
  ingredientFocus = [],
  maxSuggestions = 4,
}) {
  const normalizedRemaining = {
    calories: toNumber(remaining.calories || remaining.remainingCalories, 600),
    protein: toNumber(remaining.protein || remaining.remainingProtein, 40),
    carbs: toNumber(remaining.carbs || remaining.remainingCarbs, 45),
    fats: toNumber(remaining.fats || remaining.remainingFats, 18),
    fiber: toNumber(remaining.fiber || remaining.remainingFiber, 10),
  };

  const plans = [];
  const count = Math.max(1, Math.min(maxSuggestions, 6));

  for (let index = 0; index < count; index += 1) {
    const remainingVariant = {
      calories: clamp(normalizedRemaining.calories - index * 80, 150, 2200),
      protein: clamp(normalizedRemaining.protein - index * 3, 8, 200),
      carbs: clamp(normalizedRemaining.carbs - index * 6, 8, 280),
      fats: clamp(normalizedRemaining.fats - index * 2, 4, 120),
      fiber: clamp(normalizedRemaining.fiber - index, 2, 80),
    };

    plans.push(
      buildSinglePlan({
        remaining: remainingVariant,
        allergies,
        preferences,
        ingredientFocus: varyFocus(ingredientFocus, index),
      })
    );
  }

  return plans;
}

function buildMealBuilderPlan({
  remaining,
  allergies = [],
  preferences = {},
  ingredientFocus = [],
  maxSuggestions = 4,
  mode = 'meal-builder',
}) {
  const suggestions = buildMealSuggestions({
    remaining,
    allergies,
    preferences,
    ingredientFocus,
    maxSuggestions,
  });

  return {
    mode,
    suggestions: suggestions.map((plan, index) => ({
      id: `meal-plan-${index + 1}`,
      ...plan,
    })),
  };
}

function generateRecipeSuggestions({
  remaining,
  allergies = [],
  preferences = {},
  ingredientFocus = [],
  maxSuggestions = 4,
}) {
  const base = buildMealSuggestions({
    remaining,
    allergies,
    preferences,
    ingredientFocus,
    maxSuggestions,
  });

  return {
    recipes: base.map((plan, index) => ({
      id: `generated-recipe-${index + 1}`,
      ...plan.recipe,
      grocerySuggestions: plan.grocerySuggestions,
      recommendationLabel:
        index === 0
          ? 'Best fit for your current remaining macros'
          : plan.allergyWarnings.length
            ? 'Needs substitution due to allergy preferences'
            : 'Alternative balanced option',
    })),
  };
}

module.exports = {
  buildMealBuilderPlan,
  generateRecipeSuggestions,
};

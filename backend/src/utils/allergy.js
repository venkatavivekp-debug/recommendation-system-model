const ALLERGY_KEYWORDS = {
  peanuts: ['peanut', 'groundnut', 'peanut butter'],
  dairy: ['milk', 'cheese', 'butter', 'yogurt', 'cream', 'ghee', 'paneer', 'whey'],
  gluten: ['wheat', 'barley', 'rye', 'flour', 'bread', 'pasta'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'oyster', 'mussel', 'shellfish'],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'soybean', 'soy sauce'],
};

function normalizeAllergies(list = []) {
  if (!Array.isArray(list)) {
    return [];
  }

  return Array.from(
    new Set(
      list
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function toIngredientText(ingredients) {
  if (Array.isArray(ingredients)) {
    return ingredients.map((item) => String(item || '').toLowerCase()).join(' ');
  }

  return String(ingredients || '').toLowerCase();
}

function checkAllergy(userAllergies = [], ingredients = []) {
  const normalizedAllergies = normalizeAllergies(userAllergies);
  if (!normalizedAllergies.length) {
    return {
      warning: false,
      matchedAllergens: [],
      warnings: [],
    };
  }

  const ingredientText = toIngredientText(ingredients);
  const matchedAllergens = [];
  const warnings = [];

  normalizedAllergies.forEach((allergy) => {
    const keywords = ALLERGY_KEYWORDS[allergy] || [allergy];
    const matched = keywords.find((keyword) => ingredientText.includes(keyword));

    if (matched) {
      matchedAllergens.push(allergy);
      warnings.push(`This item contains ${allergy} - matches your allergy`);
    }
  });

  return {
    warning: warnings.length > 0,
    matchedAllergens: Array.from(new Set(matchedAllergens)),
    warnings,
  };
}

function detectAllergyWarnings(userAllergies = [], ingredients = []) {
  return checkAllergy(userAllergies, ingredients).warnings;
}

function isAllergySafe(userAllergies = [], ingredients = []) {
  return !checkAllergy(userAllergies, ingredients).warning;
}

module.exports = {
  checkAllergy,
  normalizeAllergies,
  detectAllergyWarnings,
  isAllergySafe,
  ALLERGY_KEYWORDS,
};

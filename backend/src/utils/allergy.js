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

function detectAllergyWarnings(ingredients, allergies = []) {
  const normalizedAllergies = normalizeAllergies(allergies);
  if (!normalizedAllergies.length) {
    return [];
  }

  const ingredientText = toIngredientText(ingredients);
  const warnings = [];

  normalizedAllergies.forEach((allergy) => {
    const keywords = ALLERGY_KEYWORDS[allergy] || [allergy];
    const matched = keywords.find((keyword) => ingredientText.includes(keyword));

    if (matched) {
      warnings.push({
        allergy,
        keyword: matched,
        message: `Contains ${allergy} - matches your allergy`,
      });
    }
  });

  return warnings;
}

function isAllergySafe(ingredients, allergies = []) {
  return detectAllergyWarnings(ingredients, allergies).length === 0;
}

module.exports = {
  normalizeAllergies,
  detectAllergyWarnings,
  isAllergySafe,
  ALLERGY_KEYWORDS,
};

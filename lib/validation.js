// Logic — Insight Validation Module
// Validates insights before saving, sharing, or displaying
//
// Design principles (audited with the system itself):
// - Level validation uses FORMAT regex, not a closed Set (G3: don't control variation)
// - No c_after >= c_before check (corrective insights lower C legitimately — Q1 + S1 already filter)
// - No minimum length on description/why (form ≠ content — P2: partial fidelity is dangerous)
// - Maximum length is technical protection only, not semantic

// Format: 1-2 uppercase letters followed by 1-2 digits (A1, G10, LD3, H12, etc.)
const LEVEL_FORMAT = /^[A-Z]{1,2}\d{1,2}$/;

function validateLevel(id) {
  if (typeof id !== 'string') return false;
  return LEVEL_FORMAT.test(id.trim().toUpperCase());
}

function validateLevelCombo(combo) {
  if (!combo || typeof combo !== 'string') {
    return { valid: false, levels: [], invalid: ['(empty)'] };
  }

  const parts = combo
    .split('+')
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);

  if (parts.length === 0) {
    return { valid: false, levels: [], invalid: ['(empty)'] };
  }

  const validParts = [];
  const invalidParts = [];

  parts.forEach(p => {
    if (LEVEL_FORMAT.test(p)) {
      validParts.push(p);
    } else {
      invalidParts.push(p);
    }
  });

  const unique = [...new Set(validParts)].sort();

  return {
    valid: invalidParts.length === 0 && unique.length > 0,
    levels: unique,
    invalid: invalidParts,
    normalized: unique.join('+')
  };
}

function validateCValue(c) {
  if (c === null || c === undefined || c === '') {
    return { valid: false, value: 0, error: 'C value missing' };
  }

  const num = parseFloat(c);

  if (isNaN(num)) {
    return { valid: false, value: 0, error: 'C value is not a number' };
  }

  if (num < 0 || num > 1) {
    return { valid: false, value: Math.min(Math.max(num, 0), 1), error: 'C value out of range [0, 1]' };
  }

  return { valid: true, value: Math.round(num * 100) / 100 };
}

function validateInsight(insight) {
  const errors = [];

  if (!insight || typeof insight !== 'object') {
    return { valid: false, errors: ['Insight is not an object'], cleaned: null };
  }

  // Level: must exist and have valid format
  if (!insight.level) {
    errors.push('Level missing');
  } else {
    const levelResult = validateLevelCombo(insight.level);
    if (!levelResult.valid) {
      if (levelResult.invalid.length > 0) {
        errors.push('Invalid level format: ' + levelResult.invalid.join(', '));
      } else {
        errors.push('No valid levels found');
      }
    }
  }

  // Description: must exist, max 500 (technical), no minimum (form ≠ content)
  if (!insight.description || typeof insight.description !== 'string' || insight.description.trim().length === 0) {
    errors.push('Description missing');
  }

  // C values: must be numbers in [0, 1]
  const cBefore = validateCValue(insight.c_before);
  if (!cBefore.valid) {
    errors.push('c_before: ' + cBefore.error);
  }

  const cAfter = validateCValue(insight.c_after);
  if (!cAfter.valid) {
    errors.push('c_after: ' + cAfter.error);
  }

  // No c_after >= c_before check — corrective insights legitimately lower C
  // Q1 filter in system prompt + S1 manual approval already handle this

  // Why: must exist, no minimum length
  if (!insight.why || typeof insight.why !== 'string' || insight.why.trim().length === 0) {
    errors.push('Why missing');
  }

  // Build cleaned object
  const levelResult = insight.level ? validateLevelCombo(insight.level) : { normalized: '', levels: [] };
  const cleaned = {
    level: levelResult.normalized || insight.level || '',
    description: (insight.description || '').trim().substring(0, 500),
    c_before: cBefore.value,
    c_after: cAfter.value,
    why: (insight.why || '').trim().substring(0, 500)
  };

  return {
    valid: errors.length === 0,
    errors,
    cleaned
  };
}

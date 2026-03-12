// Logic — Insight Validation Module
// Validates insights before saving, sharing, or displaying

const VALID_LEVELS = new Set([
  // Axiomas (closed)
  'A1','A2','A3','A4','A5','A6',
  // Postulados (declared)
  'P1','P2','P3','P4','P5',
  // Limites (structural)
  'L1','L2','L3',
  // Mapa Generativo (compressed knowledge)
  'G1','G2','G3','G4','G5','G6','G7','G8','G9','G10',
  // Reglas del Universo (first derivation)
  'U1','U2','U3','U4','U5','U6','U7','U8','U9',
  // Reglas de Accion Humana (derived)
  'H1','H2','H3','H4','H5','H6','H7','H8','H9','H10','H11','H12',
  // Leyes Derivadas
  'LD1','LD2','LD3',
  // Cadena Etica
  'E1','E2','E3','E4',
  // Transversales
  'T1','T2','T3',
  // Fronteras Abiertas
  'F1','F2','F3','F4'
]);

function validateLevel(id) {
  if (typeof id !== 'string') return false;
  return VALID_LEVELS.has(id.trim().toUpperCase());
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
    if (VALID_LEVELS.has(p)) {
      validParts.push(p);
    } else {
      invalidParts.push(p);
    }
  });

  // Dedupe and sort valid parts
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

  // Level validation
  if (!insight.level) {
    errors.push('Level missing');
  } else {
    const levelResult = validateLevelCombo(insight.level);
    if (!levelResult.valid) {
      if (levelResult.invalid.length > 0) {
        errors.push('Invalid levels: ' + levelResult.invalid.join(', '));
      } else {
        errors.push('No valid levels found');
      }
    }
  }

  // Description validation
  if (!insight.description || typeof insight.description !== 'string') {
    errors.push('Description missing');
  } else if (insight.description.trim().length < 10) {
    errors.push('Description too short (min 10 chars)');
  } else if (insight.description.trim().length > 500) {
    errors.push('Description too long (max 500 chars)');
  }

  // C values validation
  const cBefore = validateCValue(insight.c_before);
  if (!cBefore.valid) {
    errors.push('c_before: ' + cBefore.error);
  }

  const cAfter = validateCValue(insight.c_after);
  if (!cAfter.valid) {
    errors.push('c_after: ' + cAfter.error);
  }

  if (cBefore.valid && cAfter.valid && cAfter.value < cBefore.value) {
    errors.push('c_after must be >= c_before (insight must raise C)');
  }

  // Why validation
  if (!insight.why || typeof insight.why !== 'string') {
    errors.push('Why missing');
  } else if (insight.why.trim().length < 10) {
    errors.push('Why too short (min 10 chars)');
  }

  // Build cleaned object
  const levelResult = insight.level ? validateLevelCombo(insight.level) : { normalized: '', levels: [] };
  const cleaned = {
    level: levelResult.normalized || insight.level || '',
    description: (insight.description || '').trim().substring(0, 500),
    c_before: cBefore.value,
    c_after: cAfter.value,
    why: (insight.why || '').trim()
  };

  return {
    valid: errors.length === 0,
    errors,
    cleaned
  };
}

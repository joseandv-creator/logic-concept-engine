// ranking.js — Priority scoring and prompt injection control
// Caps injected updates, ranks by quality signals

const MAX_INJECTED_UPDATES = 15;
const TEMPORAL_MAX_DAYS = 90;
const USEFULNESS_NEUTRAL = 0.5;
const USEFULNESS_DEMOTION_THRESHOLD = 0.3;

function computeTemporalWeight(publishedAt) {
  if (!publishedAt) return 0;
  const survivedDays = (Date.now() - new Date(publishedAt).getTime()) / 86400000;
  return Math.min(Math.max(survivedDays, 0) / TEMPORAL_MAX_DAYS, 1.0);
}

function computeUsefulnessFactor(updateId, feedbackMap) {
  const fb = feedbackMap[updateId];
  if (!fb || fb.total === 0) return USEFULNESS_NEUTRAL;
  return fb.useful / fb.total;
}

function computePriorityScore(update, feedbackMap) {
  const temporal = computeTemporalWeight(update.published_at);
  const usefulness = computeUsefulnessFactor(update.id, feedbackMap);
  const convergence = update.convergence_count || 1;
  return convergence * (1 + temporal) * usefulness;
}

function rankAndFilterUpdates(activeUpdates, feedbackMap) {
  const scored = activeUpdates.map(u => ({
    ...u,
    _score: computePriorityScore(u, feedbackMap),
    _usefulness: computeUsefulnessFactor(u.id, feedbackMap)
  }));

  // Separate demoted (low usefulness) from normal
  const demoted = scored.filter(u => u._usefulness < USEFULNESS_DEMOTION_THRESHOLD);
  const normal = scored.filter(u => u._usefulness >= USEFULNESS_DEMOTION_THRESHOLD);

  // Sort by score descending
  normal.sort((a, b) => b._score - a._score);

  // Take top MAX, fill remainder with demoted if space
  let injected = normal.slice(0, MAX_INJECTED_UPDATES);
  const remaining = MAX_INJECTED_UPDATES - injected.length;
  if (remaining > 0 && demoted.length > 0) {
    demoted.sort((a, b) => b._score - a._score);
    injected = injected.concat(demoted.slice(0, remaining));
  }

  return {
    injected,
    prunedCount: activeUpdates.length - injected.length
  };
}

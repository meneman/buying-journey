// Converts a 1-5 rating into the ⭐ display format used across the app
function starsFromRating(rating) {
  const stars = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return '⭐'.repeat(stars);
}

// Converts a `[{ label, value }]` spec list (or an already-joined string) into the "<br>"-joined format
function specsToString(specs) {
  if (typeof specs === 'string') return specs;
  if (!Array.isArray(specs)) return '';
  return specs
    .filter((s) => s && (s.label || s.value))
    .map((s) => (s.label ? `${s.label}: ${s.value}` : s.value))
    .join(' <br> ');
}

module.exports = { starsFromRating, specsToString };

// Words and phrases that make a parent or player message text the admins even
// when nobody flagged it. Add to this list to widen what gets caught. Matching
// ignores capitals and only matches whole words, so "hurt" does not fire on
// "hurtle". Keep entries specific: a word that shows up in ordinary chatter
// (like "help" or "lost") would text the admins all day.
const URGENT_PHRASES = [
  // Emergencies and injuries
  "emergency",
  "urgent",
  "911",
  "ambulance",
  "hospital",
  "injured",
  "injury",
  "hurt",
  "bleeding",
  "broken arm",
  "broken leg",
  "broken wrist",
  "broken finger",
  "broke her arm",
  "broke her leg",
  "concussion",
  "unconscious",
  "passed out",
  "fainted",
  "seizure",
  "allergic reaction",
  "can't breathe",
  "cant breathe",
  "heat stroke",
  "heatstroke",
  "accident",
  "stitches",
  // Unsafe or stranded
  "can't find her",
  "cant find her",
  "can't find my daughter",
  "cant find my daughter",
  "nobody picked",
  "no one picked",
  "left alone",
  "stranded",
  "unsafe",
  "police",
  "weapon",
  // Conduct and safeguarding
  "bullied",
  "bullying",
  "harassed",
  "harassment",
  "inappropriate",
  "abuse",
  "abused",
  "threatened",
  "threat",
  // Spanish
  "emergencia",
  "urgente",
  "ambulancia",
  "hospital",
  "lastimada",
  "lastimó",
  "accidente",
  "policía",
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Letters, digits and apostrophes count as part of a word, so "can't" stays one
// piece and "fire" does not match inside "fireworks".
const URGENT_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}'’])(?:${URGENT_PHRASES.map(escapeRegex).join("|")})(?![\\p{L}\\p{N}'’])`,
  "iu"
);

// Returns the first matching word or phrase, or null.
function findUrgentWord(text) {
  const match = URGENT_PATTERN.exec(String(text || ""));
  return match ? match[0] : null;
}

module.exports = { URGENT_PHRASES, findUrgentWord };

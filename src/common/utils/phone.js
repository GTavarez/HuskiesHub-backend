// Stores US phone numbers in one readable shape, "(201) 555-0123". Empty clears
// the number; anything that isn't 10 digits (or 11 with a leading 1) is rejected
// so a typo doesn't silently become the number a coach calls.
function normalizePhone(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (raw === "") return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

module.exports = { normalizePhone };

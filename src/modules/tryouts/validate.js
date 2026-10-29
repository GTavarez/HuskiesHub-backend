// Checks and cleans one public tryout registration. Kept free of database and
// email code so it can be tested on its own.
const { normalizePhone } = require("../../common/utils/phone");

const AGE_GROUPS = ["12U", "14U", "16U", "18U"];
const STATUSES = ["new", "scheduled", "passed", "joined"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (value, max) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// Returns { error } with a message a parent can act on, or { data } ready to save.
function cleanTryoutSubmission(body = {}) {
  const playerName = clean(body.playerName, 80);
  const position = clean(body.position, 60);
  const parentName = clean(body.parentName, 80);
  const parentEmail = clean(body.parentEmail, 120).toLowerCase();
  const currentTeam = clean(body.currentTeam, 100);
  const ageGroup = clean(body.ageGroup, 10).toUpperCase();
  // Experience is free text, so keep the line breaks a parent typed.
  const previousClubExperience = String(body.previousClubExperience ?? "").trim().slice(0, 1000);

  if (!playerName) return { error: "Please enter the player's name." };
  if (!AGE_GROUPS.includes(ageGroup)) return { error: "Please choose an age group." };
  if (!position) return { error: "Please enter the position she plays." };
  if (!parentName) return { error: "Please enter a parent or guardian name." };
  if (!EMAIL_PATTERN.test(parentEmail)) return { error: "Please enter a valid email address." };

  const parentPhone = normalizePhone(body.parentPhone);
  if (!parentPhone) return { error: "Please enter a 10 digit phone number." };

  let birthDate = null;
  if (body.birthDate) {
    birthDate = new Date(`${String(body.birthDate).slice(0, 10)}T00:00:00Z`);
    const now = Date.now();
    const oldest = new Date("1990-01-01T00:00:00Z").getTime();
    if (Number.isNaN(birthDate.getTime()) || birthDate.getTime() > now || birthDate.getTime() < oldest) {
      return { error: "Please enter a valid birth date." };
    }
  }

  return {
    data: {
      playerName,
      ageGroup,
      birthDate,
      position,
      currentTeam,
      previousClubExperience,
      parentName,
      parentEmail,
      parentPhone,
    },
  };
}

module.exports = { cleanTryoutSubmission, AGE_GROUPS, STATUSES };

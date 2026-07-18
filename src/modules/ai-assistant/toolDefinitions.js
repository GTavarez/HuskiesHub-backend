// Role-based tool allowlist — this is the primary security boundary for the
// AI assistant. The backend decides which tool *schemas* to even offer Claude
// based on req.user.role, computed before any API call — never a prompt
// instruction telling the model what not to do. Parent/player schemas never
// expose a playerId parameter, so there is no field for a hallucinated or
// injected id to land in; the handler resolves "my child"/"me" server-side.

const PARENT_PLAYER_TOOLS = [
  {
    name: "getNextPractice",
    description:
      "Get the next upcoming practice for the caller's own child (parent) or for the caller (player). If the parent has more than one child on file, pass childName to disambiguate.",
    input_schema: {
      type: "object",
      properties: {
        childName: {
          type: "string",
          description: "First name of the child to look up — only needed if the parent has multiple children.",
        },
      },
    },
  },
  {
    name: "getMissedPracticesCount",
    description:
      "Count how many practices the caller's own child (parent) or the caller (player) has missed in the last 90 days, optionally compared against a threshold.",
    input_schema: {
      type: "object",
      properties: {
        childName: {
          type: "string",
          description: "First name of the child — only needed if the parent has multiple children.",
        },
        threshold: {
          type: "number",
          description: "Optional number of missed practices to compare the count against.",
        },
      },
    },
  },
  {
    name: "getMyFamilyBalance",
    description:
      "Get the outstanding registration balance owed for the caller's own child (parent) or the caller (player).",
    input_schema: {
      type: "object",
      properties: {
        childName: {
          type: "string",
          description: "First name of the child — only needed if the parent has multiple children.",
        },
      },
    },
  },
];

const COACH_TOOLS = [
  {
    name: "getMissedPracticesCountForPlayer",
    description: "Count how many practices a specific player on the coach's own team has missed in the last 90 days.",
    input_schema: {
      type: "object",
      properties: {
        playerId: { type: "string", description: "The player's database id." },
        threshold: { type: "number", description: "Optional number of missed practices to compare against." },
      },
      required: ["playerId"],
    },
  },
  {
    name: "getTeamAttendanceSummary",
    description: "Get the practice attendance rate for the coach's own team over the last 30 days.",
    input_schema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "Optional team id; defaults to the coach's own team." },
      },
    },
  },
  {
    name: "saveCoachNote",
    description:
      "Save a private coaching note about a player on the coach's own team. Notes saved this way are never visible to parents.",
    input_schema: {
      type: "object",
      properties: {
        playerId: { type: "string", description: "The player's database id." },
        type: { type: "string", enum: ["evaluation", "injury", "recruiting", "general"] },
        body: { type: "string", description: "The note text." },
      },
      required: ["playerId", "type", "body"],
    },
  },
];

const ADMIN_ONLY_TOOLS = [
  {
    name: "getFamilyBalance",
    description: "Get the outstanding registration balance owed for any player in the organization.",
    input_schema: {
      type: "object",
      properties: { playerId: { type: "string", description: "The player's database id." } },
      required: ["playerId"],
    },
  },
  {
    name: "getOutstandingBalancesOrgWide",
    description: "Get the total outstanding registration balance across the whole organization.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "getOrgRevenue",
    description: "Get total organization revenue for a date range, defaulting to the current calendar year.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO date, inclusive start of range." },
        to: { type: "string", description: "ISO date, inclusive end of range." },
      },
    },
  },
];

function getToolsForRole(role) {
  if (role === "parent" || role === "player") return PARENT_PLAYER_TOOLS;
  if (role === "coach") return COACH_TOOLS;
  if (role === "admin") return [...COACH_TOOLS, ...ADMIN_ONLY_TOOLS];
  return [];
}

module.exports = { getToolsForRole };

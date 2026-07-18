const mongoose = require("mongoose");
const RecruitingProfile = require("./model");
const Player = require("../players/model");
const { canAccessPlayer } = require("../../common/utils/ownership");
const { isAllowedVideoUrl, ALLOWED_HOSTS } = require("../../common/utils/videoUrlAllowlist");

// Narrower than canAccessPlayer alone: coach is deliberately excluded from
// writing a family's recruiting profile, even though canAccessPlayer grants
// coach access elsewhere (attendance, notes) — see Phase 3 plan decision #5.
const WRITE_ALLOWED_ROLES = ["admin", "parent", "player"];

const getProfileForPlayer = async (req, res) => {
  const { playerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }

  try {
    const profile = await RecruitingProfile.findOne({ playerId }).populate("playerId");
    if (!profile) {
      return res.status(404).json({ message: "Recruiting profile not found" });
    }

    if (canAccessPlayer(req.user, playerId)) {
      return res.json(profile);
    }

    if (req.user.role === "college_coach" && req.user.collegeCoachStatus === "approved") {
      // Family opted out — don't confirm/deny existence to an external viewer.
      if (!profile.visible) {
        return res.status(404).json({ message: "Recruiting profile not found" });
      }
      return res.json(profile);
    }

    return res.status(403).json({ message: "Forbidden" });
  } catch (err) {
    console.error("Get recruiting profile error:", err);
    return res.status(500).json({ message: "Failed to fetch recruiting profile" });
  }
};

const upsertProfile = async (req, res) => {
  const { playerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }
  if (!WRITE_ALLOWED_ROLES.includes(req.user.role) || !canAccessPlayer(req.user, playerId)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const {
    satScore,
    actScore,
    exitVelocity,
    popTime,
    pitchVelocity,
    sixtyYardDash,
    throwingVelocity,
    highlightVideoUrls,
    visible,
  } = req.body;

  if (highlightVideoUrls !== undefined) {
    if (!Array.isArray(highlightVideoUrls)) {
      return res.status(400).json({ message: "highlightVideoUrls must be an array" });
    }
    const invalidUrls = highlightVideoUrls.filter((url) => !isAllowedVideoUrl(url));
    if (invalidUrls.length > 0) {
      return res.status(400).json({
        message: `Video links must be from an approved host (${ALLOWED_HOSTS.join(", ")}): ${invalidUrls.join(", ")}`,
      });
    }
  }

  try {
    const profile = await RecruitingProfile.findOneAndUpdate(
      { playerId },
      {
        satScore,
        actScore,
        exitVelocity,
        popTime,
        pitchVelocity,
        sixtyYardDash,
        throwingVelocity,
        highlightVideoUrls,
        visible,
        updatedBy: req.user._id,
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.json(profile);
  } catch (err) {
    console.error("Upsert recruiting profile error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// Gated by requireApprovedCollegeCoach in routes.js. Two-step join (Player
// candidates -> RecruitingProfile filter) rather than a single aggregation,
// since Player.GPA is a pre-existing String field and can't be compared
// numerically server-side without a migration — see Phase 3 plan risk #5.
const searchProfiles = async (req, res) => {
  const {
    gradYear,
    position,
    minGpa,
    state,
    minExitVelocity,
    maxPopTime,
    minPitchVelocity,
    minThrowingVelocity,
    maxSixtyYardDash,
  } = req.query;

  try {
    const playerFilter = {};
    if (gradYear) playerFilter.gradYear = Number(gradYear);
    if (position) playerFilter.position = new RegExp(`^${position}$`, "i");
    if (state) playerFilter.state = new RegExp(`^${state}$`, "i");

    const candidatePlayers = await Player.find(playerFilter, "_id");
    const candidateIds = candidatePlayers.map((player) => player._id);

    // visible: true is enforced here, at the query stage — never post-filtered
    // after the fact, and never trust the frontend to hide opted-out data.
    const profileFilter = { playerId: { $in: candidateIds }, visible: true };
    if (minExitVelocity) profileFilter.exitVelocity = { $gte: Number(minExitVelocity) };
    if (maxPopTime) profileFilter.popTime = { $lte: Number(maxPopTime) };
    if (minPitchVelocity) profileFilter.pitchVelocity = { $gte: Number(minPitchVelocity) };
    if (minThrowingVelocity) {
      profileFilter.throwingVelocity = { $gte: Number(minThrowingVelocity) };
    }
    if (maxSixtyYardDash) profileFilter.sixtyYardDash = { $lte: Number(maxSixtyYardDash) };

    let profiles = await RecruitingProfile.find(profileFilter).populate("playerId");

    if (minGpa) {
      const minGpaNum = Number(minGpa);
      profiles = profiles.filter((profile) => {
        const gpaValue = parseFloat(profile.playerId?.GPA);
        return !Number.isNaN(gpaValue) && gpaValue >= minGpaNum;
      });
    }

    return res.json(profiles);
  } catch (err) {
    console.error("Search recruiting profiles error:", err);
    return res.status(500).json({ message: "Search failed" });
  }
};

module.exports = { getProfileForPlayer, upsertProfile, searchProfiles };

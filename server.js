import express from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import {
  MAP,
  RESOURCE_DEFS,
  RESOURCE_SPAWN_RULES,
  BUILDINGS,
  UNITS,
  UNIT_UPGRADE_PATHS,
  UNIT_UPGRADE_STATS,
  PLAYER_COLORS,
  PLAYER_COLOR_OPTIONS,
  TECHNOLOGIES,
  BUILDING_CATEGORIES,
  DEFAULT_BUILDING_RANGED_ARMOR,
  AGE_ORDER,
  AGE_UP_COSTS,
  LANDMARK_POOL,
  LANDMARK_BONUSES,
} from "./public/shared/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer);

app.use(express.static(path.join(__dirname, "public")));
app.use("/images", express.static(path.join(__dirname, "images")));

const PORT = process.env.PORT || 3000;

const waitingQueue = [];
const matches = new Map();
const lobbies = new Map();
let nextMatchId = 1;
let nextEntityId = 1;
let nextLobbyId = 1;
const COLOR_OPTIONS = PLAYER_COLOR_OPTIONS || [];
const TEAM_OPTIONS = [1, 2, 3, 4];
const MAX_MULTIPLAYER_PLAYERS = 4;

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const PROJECTILE_SPEED_TILES_PER_SEC = 12;
const MIN_PROJECTILE_TRAVEL_SEC = 0.12;
const UNIT_TURN_RATE_RAD_PER_SEC = 5;
const FIRE_FACING_THRESHOLD_RAD = 0.14;
const FORMATION_SPACING = 0.65;
const FORMATION_UNIT_AVOIDANCE_STRENGTH = 0.08;
const FORMATION_SAME_FORMATION_AVOIDANCE_FACTOR = 0.05;
const FORMATION_AVOIDANCE_SCALE = 0.75;
const FORMATION_COLLISION_FACTOR = 0.82;
const BASE_POPULATION_CAP = 20;
const HOUSE_POPULATION_BONUS = 10;
const MAX_POPULATION_CAP = 200;
const LANDMARK_COUNT_PER_PLAYER = 4;
const MAX_COMMAND_ENTITY_IDS = 256;
const GROVE_TECH_IDS = new Set([
  "GreaterRations",
  "SecondWind",
  "BedrockFoundations",
]);
const LANDMARK_TYPES = new Set(LANDMARK_POOL || []);

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function pickRandomLandmarks(count = LANDMARK_COUNT_PER_PLAYER) {
  const shuffled = shuffleArray(LANDMARK_POOL || []);
  return shuffled.slice(0, Math.max(0, Math.min(count, shuffled.length)));
}

function isLandmarkType(buildingType) {
  return LANDMARK_TYPES.has(buildingType);
}

function getLandmarkBonusIndexFromAge(ageTier) {
  return clamp((Number(ageTier) || 1) - 1, 0, 3);
}

function getLandmarkBuiltAgeTier(player, buildingType) {
  const tier = player?.landmarkBuiltAges?.[buildingType];
  if (!Number.isFinite(tier)) return null;
  return clamp(Math.floor(tier), 1, 4);
}

function getLandmarkNextAgeTier(player) {
  const nextTier = (player?.ageTier ?? 0) + 1;
  return clamp(nextTier, 1, 4);
}

function getLandmarkAgeCost(player) {
  const nextTier = getLandmarkNextAgeTier(player);
  return AGE_UP_COSTS[nextTier] || AGE_UP_COSTS[4];
}

function getBuildingCostForPlayer(match, player, buildingType) {
  const def = BUILDINGS[buildingType];
  if (!def) return null;
  if (isLandmarkType(buildingType)) {
    return normalizeCost({ ...(getLandmarkAgeCost(player) || def.cost || {}) });
  }
  return normalizeCost(def.cost ? { ...def.cost } : null);
}

function getGroveUniversityAgeTier(player) {
  return getLandmarkBuiltAgeTier(player, "GroveUniversity");
}

function getGroveScaledValue(player, values) {
  if (!Array.isArray(values) || !values.length) return 0;
  const groveTier = getGroveUniversityAgeTier(player);
  if (!groveTier) return 0;
  return values[getLandmarkBonusIndexFromAge(groveTier)] || 0;
}

function getGreaterRationsBonus(player) {
  if (!player?.techs?.GreaterRations) return 0;
  return getGroveScaledValue(player, TECHNOLOGIES.GreaterRations?.groveScalingByAge);
}

function getSecondWindBonus(player) {
  if (!player?.techs?.SecondWind) return 0;
  return getGroveScaledValue(player, TECHNOLOGIES.SecondWind?.groveScalingByAge);
}

function getBedrockFoundationsBonus(player) {
  if (!player?.techs?.BedrockFoundations) return 0;
  return getGroveScaledValue(
    player,
    TECHNOLOGIES.BedrockFoundations?.groveScalingByAge
  );
}

function getTechCostReductionForPlayer(player) {
  const groveTier = getGroveUniversityAgeTier(player);
  if (!groveTier) return 0;
  const reductions = LANDMARK_BONUSES?.GroveUniversity?.techCostReductionByAge || [];
  return reductions[getLandmarkBonusIndexFromAge(groveTier)] || 0;
}

function getTechnologyCostForPlayer(player, techId) {
  const tech = TECHNOLOGIES[techId];
  if (!tech) return null;
  let cost = tech.cost ? { ...tech.cost } : null;
  if (tech.groveDynamicCost) {
    const groveTier = getGroveUniversityAgeTier(player);
    if (groveTier) {
      const costsByAge = LANDMARK_BONUSES?.GroveUniversity?.techCostByAge || [];
      const byAge = costsByAge[getLandmarkBonusIndexFromAge(groveTier)];
      if (byAge) {
        cost = { ...byAge };
      }
    }
  }
  const reduction = getTechCostReductionForPlayer(player);
  if (cost && reduction > 0) {
    return scaleCost(cost, Math.max(0, 1 - reduction));
  }
  return normalizeCost(cost);
}

function getLandmarkAgeTierForBuilding(match, building) {
  if (!building) return null;
  if (Number.isFinite(building.landmarkAgeTier)) {
    return clamp(Math.floor(building.landmarkAgeTier), 1, 4);
  }
  if (building.ownerId === null || building.ownerId === undefined) return null;
  const player = match?.players?.[building.ownerId];
  return getLandmarkBuiltAgeTier(player, building.type);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeId(value) {
  const id = Number(value);
  if (!Number.isFinite(id)) return null;
  const normalized = Math.trunc(id);
  if (normalized < 0) return null;
  return normalized;
}

function normalizeIdArray(value, maxCount = MAX_COMMAND_ENTITY_IDS) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of value) {
    const id = normalizeId(entry);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= maxCount) break;
  }
  return out;
}

function normalizeIdsFromArrayOrSingle(
  listValue,
  singleValue,
  maxCount = MAX_COMMAND_ENTITY_IDS
) {
  if (Array.isArray(listValue)) {
    return normalizeIdArray(listValue, maxCount);
  }
  const single = normalizeId(singleValue);
  return single === null ? [] : [single];
}

function normalizeWorldPoint(point) {
  if (!isPlainObject(point)) return null;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: clamp(x, 0, MAP.width - 0.001),
    y: clamp(y, 0, MAP.height - 0.001),
  };
}

function normalizeAngle(angle) {
  let out = angle;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

function rotateTowards(current, target, maxStep) {
  const diff = normalizeAngle(target - current);
  if (Math.abs(diff) <= maxStep) {
    return target;
  }
  return current + Math.sign(diff) * maxStep;
}

function getStartingTownCenterPositions(playerCount, tcSize) {
  const corners = [
    { x: 20, y: 20 },
    { x: MAP.width - 20 - tcSize, y: 20 },
    { x: 20, y: MAP.height - 20 - tcSize },
    { x: MAP.width - 20 - tcSize, y: MAP.height - 20 - tcSize },
  ];
  const count = Math.max(1, Math.min(MAX_MULTIPLAYER_PLAYERS, playerCount || 1));
  if (count <= 1) return [corners[0]];
  if (count === 2) {
    // Opposite corners for 1v1.
    return [corners[0], corners[3]];
  }
  if (count === 3) {
    return [corners[0], corners[3], corners[1]];
  }
  return corners.slice(0, count);
}



function isAreaFree(x, y, size, occupied) {
  for (const area of occupied) {
    const overlap =
      x < area.x + area.size &&
      x + size > area.x &&
      y < area.y + area.size &&
      y + size > area.y;
    if (overlap) return false;
  }
  return true;
}

function generateResources(startPositionsInput = null) {
  const resources = [];
  const occupied = [];

  const tcSize = BUILDINGS.TownCenter.size;
  const startPositions = Array.isArray(startPositionsInput) && startPositionsInput.length
    ? startPositionsInput
    : getStartingTownCenterPositions(2, tcSize);

  const startAreas = startPositions.map((pos) => ({
    x: Math.max(0, pos.x - 4),
    y: Math.max(0, pos.y - 4),
    size: 12,
  }));
  occupied.push(...startAreas);

  function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function createSpreadCenters(count, padding = 10) {
    if (count <= 0) return [];
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const minX = padding;
    const minY = padding;
    const maxX = MAP.width - padding;
    const maxY = MAP.height - padding;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const cellW = spanX / cols;
    const cellH = spanY / rows;
    const cells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        cells.push({ row, col });
      }
    }
    shuffleInPlace(cells);
    const centers = [];
    for (let i = 0; i < count && i < cells.length; i++) {
      const cell = cells[i];
      const jitterX = Math.max(1, Math.floor(cellW * 0.28));
      const jitterY = Math.max(1, Math.floor(cellH * 0.28));
      const cx = minX + (cell.col + 0.5) * cellW + randInt(-jitterX, jitterX);
      const cy = minY + (cell.row + 0.5) * cellH + randInt(-jitterY, jitterY);
      centers.push({
        x: clamp(cx, 2, MAP.width - 2),
        y: clamp(cy, 2, MAP.height - 2),
      });
    }
    return centers;
  }

  function placeRandomNode(defKey, tries = 5) {
    const def = RESOURCE_DEFS[defKey];
    for (let attempt = 0; attempt < tries; attempt++) {
      const x = randInt(2, MAP.width - def.size - 2);
      const y = randInt(2, MAP.height - def.size - 2);
      if (!isAreaFree(x, y, def.size, occupied)) continue;
      const node = {
        id: nextEntityId++,
        type: defKey,
        kind: def.kind,
        x,
        y,
        size: def.size,
        amount: def.amount,
      };
      resources.push(node);
      occupied.push({ x, y, size: def.size });
      return true;
    }
    return false;
  }

  function placeNode(defKey, count) {
    let placed = 0;
    for (let i = 0; i < count; i++) {
      if (placeRandomNode(defKey)) placed += 1;
    }
    return placed;
  }

  function placeCluster(defKey, count, spread) {
    const def = RESOURCE_DEFS[defKey];
    const tries = 5;
    let baseX = null;
    let baseY = null;
    for (let attempt = 0; attempt < tries; attempt++) {
      const x = randInt(2, MAP.width - def.size - 2);
      const y = randInt(2, MAP.height - def.size - 2);
      if (!isAreaFree(x, y, def.size, occupied)) continue;
      baseX = x;
      baseY = y;
      break;
    }
    if (baseX === null) return;

    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < tries; attempt++) {
        const x = clamp(
          baseX + randInt(-spread, spread),
          2,
          MAP.width - def.size - 2
        );
        const y = clamp(
          baseY + randInt(-spread, spread),
          2,
          MAP.height - def.size - 2
        );
        if (!isAreaFree(x, y, def.size, occupied)) continue;
        const node = {
          id: nextEntityId++,
          type: defKey,
          kind: def.kind,
          x,
          y,
          size: def.size,
          amount: def.amount,
        };
        resources.push(node);
        occupied.push({ x, y, size: def.size });
        placed = true;
        break;
      }
      if (!placed) break;
    }
  }

  function rotatePattern(pattern) {
    const size = pattern.length;
    const rotated = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => 0)
    );
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        rotated[x][size - 1 - y] = pattern[y][x];
      }
    }
    return rotated;
  }

  function placePattern(defKey, pattern) {
    const def = RESOURCE_DEFS[defKey];
    const size = pattern.length;
    const tries = 5;
    for (let attempt = 0; attempt < tries; attempt++) {
      const baseX = randInt(2, MAP.width - size - 2);
      const baseY = randInt(2, MAP.height - size - 2);
      let fits = true;
      const placements = [];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!pattern[y][x]) continue;
          const px = baseX + x;
          const py = baseY + y;
          if (!isAreaFree(px, py, def.size, occupied)) {
            fits = false;
            break;
          }
          placements.push({ x: px, y: py });
        }
        if (!fits) break;
      }
      if (!fits) continue;
      for (const place of placements) {
        const node = {
          id: nextEntityId++,
          type: defKey,
          kind: def.kind,
          x: place.x,
          y: place.y,
          size: def.size,
          amount: def.amount,
        };
        resources.push(node);
        occupied.push({ x: place.x, y: place.y, size: def.size });
      }
      return true;
    }
    return false;
  }

  function placePatternAt(defKey, pattern, baseX, baseY) {
    const def = RESOURCE_DEFS[defKey];
    const size = pattern.length;
    const placements = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!pattern[y][x]) continue;
        const px = baseX + x;
        const py = baseY + y;
        if (!isAreaFree(px, py, def.size, occupied)) {
          return false;
        }
        placements.push({ x: px, y: py });
      }
    }
    for (const place of placements) {
      const node = {
        id: nextEntityId++,
        type: defKey,
        kind: def.kind,
        x: place.x,
        y: place.y,
        size: def.size,
        amount: def.amount,
      };
      resources.push(node);
      occupied.push({ x: place.x, y: place.y, size: def.size });
    }
    return true;
  }

  function placePatternNear(defKey, pattern, centerX, centerY, attempts, radius) {
    const size = pattern.length;
    const half = Math.floor(size / 2);
    for (let attempt = 0; attempt < attempts; attempt++) {
      const offsetX = randInt(-radius, radius);
      const offsetY = randInt(-radius, radius);
      const baseX = clamp(
        Math.floor(centerX) - half + offsetX,
        2,
        MAP.width - size - 2
      );
      const baseY = clamp(
        Math.floor(centerY) - half + offsetY,
        2,
        MAP.height - size - 2
      );
      if (placePatternAt(defKey, pattern, baseX, baseY)) {
        return true;
      }
    }
    return false;
  }

  function placeNodeNear(defKey, centerX, centerY, attempts, radius) {
    const def = RESOURCE_DEFS[defKey];
    for (let attempt = 0; attempt < attempts; attempt++) {
      const offsetX = randInt(-radius, radius);
      const offsetY = randInt(-radius, radius);
      const x = clamp(
        Math.floor(centerX + offsetX),
        2,
        MAP.width - def.size - 2
      );
      const y = clamp(
        Math.floor(centerY + offsetY),
        2,
        MAP.height - def.size - 2
      );
      if (!isAreaFree(x, y, def.size, occupied)) continue;
      const node = {
        id: nextEntityId++,
        type: defKey,
        kind: def.kind,
        x,
        y,
        size: def.size,
        amount: def.amount,
      };
      resources.push(node);
      occupied.push({ x, y, size: def.size });
      return true;
    }
    return false;
  }

  const berryPattern8 = [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
  ];
  const berryPattern6 = [
    [1, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ];
  const forestPattern = parsePattern([
    "oooxxooo",
    "ooxxxxoo",
    "oxxxxxxo",
    "oxxxxxxo",
    "ooxxxxoo",
    "oooxxooo",
  ]);

  startPositions.forEach((pos) => {
    const centerX = pos.x + tcSize / 2;
    const centerY = pos.y + tcSize / 2;
    let berryPattern = Math.random() < 0.5 ? berryPattern6 : berryPattern8;
    const berryRotations = randInt(0, 3);
    for (let r = 0; r < berryRotations; r++) {
      berryPattern = rotatePattern(berryPattern);
    }
    placePatternNear("BERRY", berryPattern, centerX, centerY, 20, 10);

    let forest = forestPattern;
    const forestRotations = randInt(0, 3);
    for (let r = 0; r < forestRotations; r++) {
      forest = rotatePattern(forest);
    }
    placePatternNear("TREE", forest, centerX, centerY, 20, 12);

    placeNodeNear("GOLD", centerX, centerY, 20, 12);
    placeNodeNear("STONE", centerX, centerY, 20, 12);
  });

  const makeBerryPattern = () => {
    let cluster = randInt(
      RESOURCE_SPAWN_RULES.berryGroupMin,
      RESOURCE_SPAWN_RULES.berryGroupMax
    );
    if (cluster === 7) {
      cluster = Math.random() < 0.5 ? 6 : 8;
    }
    let pattern = cluster === 8 ? berryPattern8 : berryPattern6;
    const rotations = randInt(0, 3);
    for (let r = 0; r < rotations; r++) {
      pattern = rotatePattern(pattern);
    }
    return pattern;
  };

  let placedBerryGroups = 0;
  const berryCenters = createSpreadCenters(RESOURCE_SPAWN_RULES.berryGroups, 12);
  for (const center of berryCenters) {
    if (placePatternNear("BERRY", makeBerryPattern(), center.x, center.y, 8, 7)) {
      placedBerryGroups += 1;
    }
  }
  while (placedBerryGroups < RESOURCE_SPAWN_RULES.berryGroups) {
    if (!placePattern("BERRY", makeBerryPattern())) break;
    placedBerryGroups += 1;
  }

  const makeForestPattern = () => {
    let pattern = forestPattern;
    const rotations = randInt(0, 3);
    for (let r = 0; r < rotations; r++) {
      pattern = rotatePattern(pattern);
    }
    return pattern;
  };

  let placedForests = 0;
  const forestCenters = createSpreadCenters(RESOURCE_SPAWN_RULES.treeForests, 12);
  for (const center of forestCenters) {
    if (placePatternNear("TREE", makeForestPattern(), center.x, center.y, 8, 8)) {
      placedForests += 1;
    }
  }
  while (placedForests < RESOURCE_SPAWN_RULES.treeForests) {
    if (!placePattern("TREE", makeForestPattern())) break;
    placedForests += 1;
  }

  let placedGold = 0;
  const goldCenters = createSpreadCenters(RESOURCE_SPAWN_RULES.goldMines, 14);
  for (const center of goldCenters) {
    if (placeNodeNear("GOLD", center.x, center.y, 8, 8)) {
      placedGold += 1;
    }
  }
  while (placedGold < RESOURCE_SPAWN_RULES.goldMines) {
    if (!placeRandomNode("GOLD")) break;
    placedGold += 1;
  }

  let placedStone = 0;
  const stoneCenters = createSpreadCenters(RESOURCE_SPAWN_RULES.stoneMines, 14);
  for (const center of stoneCenters) {
    if (placeNodeNear("STONE", center.x, center.y, 8, 8)) {
      placedStone += 1;
    }
  }
  while (placedStone < RESOURCE_SPAWN_RULES.stoneMines) {
    if (!placeRandomNode("STONE")) break;
    placedStone += 1;
  }

  return resources;
}

function generateRelics(playerCount = 2, occupiedAreas = []) {
  const relics = [];
  const total = 3 + Math.max(0, playerCount);
  const centerMinX = Math.floor(MAP.width * 0.3);
  const centerMaxX = Math.ceil(MAP.width * 0.7);
  const centerMinY = Math.floor(MAP.height * 0.3);
  const centerMaxY = Math.ceil(MAP.height * 0.7);
  const size = 0.9;
  const minRelicDistance = 10;
  const occupied = [...occupiedAreas];

  for (let i = 0; i < total; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      const x = randInt(centerMinX, centerMaxX) + 0.5;
      const y = randInt(centerMinY, centerMaxY) + 0.5;
      const box = { x: x - size / 2, y: y - size / 2, size };
      if (!isAreaFree(box.x, box.y, box.size, occupied)) continue;
      const tooClose = relics.some(
        (relic) => Math.hypot(relic.x - x, relic.y - y) < minRelicDistance
      );
      if (tooClose) continue;
      relics.push({
        id: nextEntityId++,
        x,
        y,
        size,
        tag: "Religious Artifact",
        carrierId: null,
        storedInBuildingId: null,
      });
      occupied.push(box);
      placed = true;
      break;
    }
    if (!placed) {
      // Skip relic when no valid spot is found.
    }
  }
  return relics;
}

function getUnitUpgradeTier(player, unitType) {
  const path = UNIT_UPGRADE_PATHS[unitType];
  if (!path || !player) return null;
  if (path.autoByAge) {
    return Math.max(path.unlockTier ?? 0, Math.min(4, player.ageTier ?? 0));
  }
  let tier = path.unlockTier ?? 0;
  for (let t = tier + 1; t <= 4; t++) {
    const techId = path.techs?.[t];
    if (techId && player.techs?.[techId]) {
      tier = t;
    }
  }
  return tier;
}

function getUnitMinAgeForPlayer(player, unitType) {
  const path = UNIT_UPGRADE_PATHS[unitType];
  if (!path || !player) return UNITS[unitType]?.minAgeTier ?? 0;
  if (path.autoByAge) {
    return path.unlockTier ?? (path.normalTier ?? 0);
  }
  return path.unlockTier ?? (path.normalTier ?? 0);
}

function scaleCost(cost, factor) {
  if (!cost) return null;
  const scaled = {};
  const multiplier = Number.isFinite(factor) ? factor : 1;
  for (const [key, value] of Object.entries(cost)) {
    const numericValue = Number(value) || 0;
    scaled[key] = Math.max(0, Math.round(numericValue * multiplier));
  }
  return scaled;
}

function normalizeCost(cost) {
  if (!cost) return null;
  const normalized = {};
  for (const [key, value] of Object.entries(cost)) {
    normalized[key] = Math.max(0, Math.round(Number(value) || 0));
  }
  return normalized;
}

function isSiegeUnitType(unitType) {
  return !!UNITS[unitType]?.type?.includes("Siege");
}

function isGunpowderUnitType(unitType) {
  const type = UNITS[unitType]?.type || "";
  return type.includes("Gunpowder");
}

function getUnitCostForPlayer(match, player, unitType, building = null) {
  const def = UNITS[unitType];
  if (!def) return null;
  let multiplier = player?.techs?.Resourcefulness ? 0.9 : 1;
  if (
    building?.type === "SanctumOfTheVeil" &&
    def.type?.includes("Religious")
  ) {
    const ageTier = getLandmarkAgeTierForBuilding(match, building) || 1;
    const reduction =
      LANDMARK_BONUSES?.SanctumOfTheVeil?.religiousCostReductionByAge?.[
        getLandmarkBonusIndexFromAge(ageTier)
      ] || 0;
    multiplier *= Math.max(0.05, 1 - reduction);
  }
  return scaleCost(def.cost, multiplier);
}

function getUnitPopulationCost(unitType) {
  const def = UNITS[unitType];
  if (!def) return 1;
  const pop = Number(def.population ?? 1);
  if (!Number.isFinite(pop) || pop <= 0) return 1;
  return pop;
}

function getPopulationCap(match, playerIndex) {
  let houses = 0;
  for (const building of match.buildings) {
    if (building.ownerId !== playerIndex) continue;
    if (building.type !== "House") continue;
    if (building.isUnderConstruction) continue;
    if ((building.hp ?? 0) <= 0) continue;
    houses += 1;
  }
  const cap = BASE_POPULATION_CAP + houses * HOUSE_POPULATION_BONUS;
  return Math.min(MAX_POPULATION_CAP, cap);
}

function getPopulationUsed(match, playerIndex) {
  let used = 0;
  for (const unit of match.units) {
    if (unit.ownerId !== playerIndex) continue;
    if ((unit.hp ?? 0) <= 0) continue;
    used += getUnitPopulationCost(unit.type);
  }
  for (const building of match.buildings) {
    if (building.ownerId !== playerIndex) continue;
    const garrison = Array.isArray(building.garrison) ? building.garrison : [];
    for (const entry of garrison) {
      used += getUnitPopulationCost(entry.type);
    }
  }
  return used;
}

function getPopulationQueued(
  match,
  playerIndex,
  ignoreBuildingId = null,
  ignoreQueueIndex = null
) {
  let queued = 0;
  for (const building of match.buildings) {
    if (building.ownerId !== playerIndex) continue;
    const queue = Array.isArray(building.productionQueue)
      ? building.productionQueue
      : [];
    for (let i = 0; i < queue.length; i++) {
      if (building.id === ignoreBuildingId && i === ignoreQueueIndex) continue;
      const job = queue[i];
      if (!job?.unitType) continue;
      queued += getUnitPopulationCost(job.unitType);
    }
  }
  return queued;
}

function canCompleteUnitByPopulation(match, playerIndex, unitType, buildingId) {
  const cap = getPopulationCap(match, playerIndex);
  const used = getPopulationUsed(match, playerIndex);
  const queuedOthers = getPopulationQueued(match, playerIndex, buildingId, 0);
  const cost = getUnitPopulationCost(unitType);
  return used + queuedOthers + cost <= cap;
}

function getBuildingBuildTimeForPlayer(player, buildingType) {
  const baseTime = BUILDINGS[buildingType]?.buildTime || 0;
  if (!baseTime) return 0;
  if (player?.techs?.RapidFabrications) {
    return baseTime * 0.5;
  }
  return baseTime;
}

function getUnitProductionTimeForPlayer(match, player, unitType, building = null) {
  const baseTime = UNITS[unitType]?.buildTime || 0;
  if (!baseTime) return 0;
  if (match?.fastBuild) return 0.1;
  let time = baseTime;
  if (player?.techs?.RapidFabrications && isSiegeUnitType(unitType)) {
    time *= 0.5;
  }
  if (building?.type === "ArgentThroneComplex" && UNITS[unitType]?.type?.includes("Infantry")) {
    const ageTier = getLandmarkAgeTierForBuilding(match, building) || 1;
    const speedBonus =
      LANDMARK_BONUSES?.ArgentThroneComplex?.productionSpeedBonusByAge?.[
        getLandmarkBonusIndexFromAge(ageTier)
      ] || 0;
    const speedMultiplier = 1 + speedBonus;
    if (speedMultiplier > 0) {
      time /= speedMultiplier;
    }
  }
  return Math.max(0.05, time);
}

function getSightMultiplierForPlayer(player) {
  return player?.techs?.AdvancedRadar ? 1.5 : 1;
}

function getUnitSightForPlayer(player, unitType) {
  const baseSight = UNITS[unitType]?.sight ?? 4;
  return baseSight * getSightMultiplierForPlayer(player);
}

function getBuildingSightForPlayer(player, buildingType) {
  const baseSight = BUILDINGS[buildingType]?.sight ?? 4;
  return baseSight * getSightMultiplierForPlayer(player);
}

function getUnitRangeForPlayer(match, unit) {
  const baseRange = UNITS[unit?.type]?.range ?? 0.5;
  const player = match?.players?.[unit?.ownerId];
  if (player?.techs?.ImprovedGunpowder && isGunpowderUnitType(unit?.type)) {
    return baseRange + 1;
  }
  return baseRange;
}

function getUnitMinRangeForPlayer(match, unit) {
  const baseMinRange = UNITS[unit?.type]?.minRange ?? 0;
  if (baseMinRange <= 0) return 0;
  return baseMinRange;
}

function getNearbyBasilicaDamageBonus(match, unit) {
  if (!match || !unit) return 0;
  const auraRange =
    LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraRange || 15;
  let bestBonus = 0;
  for (const building of match.buildings) {
    if (building.ownerId !== unit.ownerId) continue;
    if (building.type !== "BasilicaOfEternalLight") continue;
    if (building.isUnderConstruction) continue;
    if (isDestroyedLandmark(building)) continue;
    const center = getBuildingCenter(building);
    const d = Math.hypot(center.x - unit.x, center.y - unit.y);
    if (d > auraRange) continue;
    const ageTier = getLandmarkAgeTierForBuilding(match, building) || 1;
    const bonus =
      LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraDamageByAge?.[
        getLandmarkBonusIndexFromAge(ageTier)
      ] || 0;
    if (bonus > bestBonus) bestBonus = bonus;
  }
  return bestBonus;
}

function getUnitDamageMultiplierForPlayer(match, unit) {
  const player = match?.players?.[unit?.ownerId];
  let multiplier = 1;
  if (player?.techs?.ImprovedGunpowder && isGunpowderUnitType(unit?.type)) {
    multiplier *= 1.2;
  }
  if (player?.techs?.SecondWind && !UNITS[unit?.type]?.type?.includes("Siege")) {
    const hp = unit?.hp || 0;
    const maxHp = unit?.maxHp || UNITS[unit?.type]?.health || 1;
    if (maxHp > 0 && hp / maxHp < 0.35) {
      multiplier *= 1 + getSecondWindBonus(player);
    }
  }
  const basilicaBonus = getNearbyBasilicaDamageBonus(match, unit);
  if (basilicaBonus > 0) {
    multiplier *= 1 + basilicaBonus;
  }
  return multiplier;
}

function getUnitEffectiveStats(player, unitType) {
  const def = UNITS[unitType];
  if (!def) return null;
  const tier = getUnitUpgradeTier(player, unitType);
  const upgrade = tier ? UNIT_UPGRADE_STATS[unitType]?.[tier] : null;
  let health = upgrade?.health ?? def.health;
  if (!def.type?.includes("Siege")) {
    const healthBonus = getGreaterRationsBonus(player);
    if (healthBonus > 0) {
      health *= 1 + healthBonus;
    }
  }
  return {
    health,
    damage: upgrade?.damage ?? def.damage,
    chargeDamage: upgrade?.chargeDamage ?? def.chargeDamage ?? 0,
    meleeArmor: upgrade?.meleeArmor ?? def.meleeArmor ?? 0,
    rangedArmor: upgrade?.rangedArmor ?? def.rangedArmor ?? 0,
    bonus: upgrade?.bonus ?? def.bonus ?? [],
  };
}

function getBuildingMaxHpForOwner(match, ownerId, buildingType) {
  const def = BUILDINGS[buildingType];
  if (!def) return 1;
  let maxHp = def.health || 1;
  const player = match?.players?.[ownerId];
  if (buildingType === "DominionSpire") {
    const tier =
      getLandmarkBuiltAgeTier(player, "DominionSpire") ||
      getLandmarkNextAgeTier(player);
    const hpByAge = LANDMARK_BONUSES?.DominionSpire?.hpByAge || [];
    maxHp = hpByAge[getLandmarkBonusIndexFromAge(tier)] || maxHp;
  }
  const bedrockBonus = getBedrockFoundationsBonus(player);
  if (bedrockBonus > 0) {
    maxHp *= 1 + bedrockBonus;
  }
  return maxHp;
}

function applyUnitUpgrade(match, playerIndex, unitType, oldHealth, newHealth) {
  if (!match || oldHealth == null || newHealth == null) return;
  for (const unit of match.units) {
    if (unit.ownerId !== playerIndex || unit.type !== unitType) continue;
    const hpMultiplier = Number(unit.bonusHpMultiplier || 1);
    const scaledOld = oldHealth * hpMultiplier;
    const scaledNew = newHealth * hpMultiplier;
    const delta = scaledNew - scaledOld;
    unit.maxHp = scaledNew;
    unit.hp = Math.max(1, Math.min(scaledNew, unit.hp + delta));
  }
}

function createUnit(ownerId, type, x, y, order = null, match = null) {
  const def = UNITS[type];
  const player = match?.players?.[ownerId];
  const stats = player ? getUnitEffectiveStats(player, type) : null;
  const maxHp = stats?.health ?? def.health;
  return {
    id: nextEntityId++,
    ownerId,
    type,
    x,
    y,
    hp: maxHp,
    maxHp,
    order,
    attackTargetId: null,
    attackCooldown: 0,
    facing: 0,
    isHealing: false,
    lastCombatTime: -Infinity,
    charge: {
      active: false,
      time: 0,
      cooldown: 0,
      targetId: null,
    },
    carry: { kind: null, amount: 0 },
    relicId: null,
    orderQueue: [],
    trade:
      type === "Trader"
        ? {
            homeId: null,
            destId: null,
            pendingHomeId: null,
            pendingDestId: null,
            leg: null,
            nextGold: 0,
            paused: false,
          }
        : null,
    path: null,
    pathIndex: 0,
    pathTarget: null,
    pathTick: 0,
  };
}

function createBuilding(ownerId, type, x, y, match = null) {
  const def = BUILDINGS[type];
  const maxHp = getBuildingMaxHpForOwner(match, ownerId, type);
  return {
    id: nextEntityId++,
    ownerId,
    type,
    x,
    y,
    hp: maxHp,
    maxHp,
    bonusHpMultiplier: 1,
    garrison: [],
    attackCooldown: 0,
    attackCooldowns: {},
    productionQueue: [],
    techs: {},
    rallyPoint: null,
    attackTargetId: null,
    isUnderConstruction: false,
    buildProgress: 0,
    buildTime: def.buildTime || 0,
    farmerId: null,
    relicIds: [],
    relicGoldTimer: 0,
    isStartingTownCenter: false,
    costPaid: null,
    landmarkAgeTier: null,
    landmarkDestroyed: false,
    convertResourceKind: type === "GoldenFountainSquare" ? "food" : null,
  };
}

function getBuildingCenter(building) {
  const def = BUILDINGS[building.type];
  return {
    x: building.x + def.size / 2,
    y: building.y + def.size / 2,
  };
}

function getBuildingCollisionBounds(building) {
  const def = BUILDINGS[building.type];
  if (!def) return null;
  if (def.size <= 2) return null;
  return {
    minX: building.x + 1,
    maxX: building.x + def.size - 1,
    minY: building.y + 1,
    maxY: building.y + def.size - 1,
  };
}

function buildBuildingBlocked(match) {
  const width = MAP.width;
  const height = MAP.height;
  const blocked = new Uint8Array(width * height);
  for (const building of match.buildings) {
    const bounds = getBuildingCollisionBounds(building);
    if (!bounds) continue;
    const startX = Math.max(0, Math.floor(bounds.minX));
    const endX = Math.min(width, Math.ceil(bounds.maxX));
    const startY = Math.max(0, Math.floor(bounds.minY));
    const endY = Math.min(height, Math.ceil(bounds.maxY));
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        blocked[y * width + x] = 1;
      }
    }
  }
  return blocked;
}

function findBuildingAtPoint(match, x, y) {
  for (const building of match.buildings) {
    const def = BUILDINGS[building.type];
    if (!def) continue;
    if (
      x >= building.x &&
      x <= building.x + def.size &&
      y >= building.y &&
      y <= building.y + def.size
    ) {
      return building;
    }
  }
  return null;
}

function createMatch(playerCount = 2) {
  const matchId = `match-${nextMatchId++}`;
  const clampedPlayerCount = Math.max(
    1,
    Math.min(MAX_MULTIPLAYER_PLAYERS, playerCount || 1)
  );
  const players = Array.from({ length: clampedPlayerCount }, (_, index) => ({
    id: null,
    index,
    team: TEAM_OPTIONS[index] || index + 1,
    eliminated: false,
    color: PLAYER_COLORS[index] || PLAYER_COLORS[0],
    resources: { food: 200, wood: 200, gold: 0, stone: 0 },
    techs: {},
    ageTier: 0,
    age: AGE_ORDER[0],
    landmarkChoices: pickRandomLandmarks(),
    landmarkBuiltAges: {},
    startingTownCenterId: null,
  }));
  const tcDef = BUILDINGS.TownCenter;
  const startPositions = getStartingTownCenterPositions(
    clampedPlayerCount,
    tcDef.size
  );
  const resources = generateResources(startPositions);
  const relics = generateRelics(
    clampedPlayerCount,
    resources.map((r) => ({ x: r.x, y: r.y, size: r.size }))
  );

  const units = [];
  const buildings = [];
  for (let i = 0; i < players.length; i++) {
    const pos = startPositions[i];
    const tc = createBuilding(i, "TownCenter", pos.x, pos.y, { players });
    tc.isStartingTownCenter = true;
    buildings.push(tc);
    players[i].startingTownCenterId = tc.id;
  }

  const tradeDef = BUILDINGS.TradePost;
  if (tradeDef) {
    const margin = 2;
    const topLeftX = margin;
    const topLeftY = margin;
    const topRightX = MAP.width - tradeDef.size - margin;
    const topRightY = margin;
    const bottomLeftX = margin;
    const bottomLeftY = MAP.height - tradeDef.size - margin;
    const bottomRightX = MAP.width - tradeDef.size - margin;
    const bottomRightY = MAP.height - tradeDef.size - margin;
    const topLeft = createBuilding(null, "TradePost", topLeftX, topLeftY, { players });
    const topRight = createBuilding(null, "TradePost", topRightX, topRightY, { players });
    const bottomLeft = createBuilding(null, "TradePost", bottomLeftX, bottomLeftY, { players });
    const bottomRight = createBuilding(null, "TradePost", bottomRightX, bottomRightY, { players });
    buildings.push(topLeft, topRight, bottomLeft, bottomRight);
  }

  const tempMatch = { players };
  players.forEach((player, index) => {
    const tcPos = startPositions[index];
    const centerX = tcPos.x + tcDef.size / 2;
    const belowY = tcPos.y + tcDef.size;
    const villagerOffsets = [
      { x: -1.5, y: 0.8 },
      { x: -0.5, y: 0.8 },
      { x: 0.5, y: 0.8 },
      { x: 1.5, y: 0.8 },
      { x: -0.5, y: 1.8 },
      { x: 0.5, y: 1.8 },
    ];
    for (const offset of villagerOffsets) {
      const x = clamp(centerX + offset.x, 0.5, MAP.width - 0.5);
      const y = clamp(belowY + offset.y, 0.5, MAP.height - 0.5);
      units.push(createUnit(player.index, "Villager", x, y, null, tempMatch));
    }
    units.push(
      createUnit(
        player.index,
        "Scout",
        clamp(centerX, 0.5, MAP.width - 0.5),
        clamp(belowY + 2.9, 0.5, MAP.height - 0.5),
        null,
        tempMatch
      )
    );
  });

  return {
    id: matchId,
    map: {
      width: MAP.width,
      height: MAP.height,
      tileSize: MAP.tileSize,
    },
    resources,
    players,
    units,
    buildings,
    relics,
    sockets: new Map(),
    tickHandle: null,
    tick: 0,
    pendingAttacks: [],
    pendingSiegeImpacts: [],
    pendingBuildingImpacts: [],
    singleplayer: false,
    hostId: null,
    allowCheats: false,
    fogReveal: false,
    fastBuild: false,
    alertCooldowns: new Map(),
    initialTeamIds: [...new Set(players.map((p) => p.team))],
  };
}

function pruneEnemyForSingleplayer(match, hostIndex) {
  const enemyIndex = hostIndex === 0 ? 1 : 0;
  match.units = match.units.filter((unit) => unit.ownerId !== enemyIndex);
  match.buildings = match.buildings.filter(
    (building) => building.ownerId !== enemyIndex
  );
}

function assignPlayer(match, socket, colorHex = null, teamId = null) {
  const slot = match.players.find((player) => player.id === null);
  if (!slot) return null;
  slot.id = socket.id;
  if (colorHex) {
    slot.color = colorHex;
  }
  if (teamId && TEAM_OPTIONS.includes(teamId)) {
    slot.team = teamId;
  }
  match.sockets.set(socket.id, socket);
  return slot;
}

function pickDefaultColorId() {
  return COLOR_OPTIONS[0]?.id || "blue";
}

function getColorHexById(colorId) {
  const entry = COLOR_OPTIONS.find((c) => c.id === colorId);
  return entry?.hex || PLAYER_COLORS[0] || "#2c7be5";
}

function allocateLobbyColor(lobby, socketId) {
  if (!lobby.colorAssignments) lobby.colorAssignments = {};
  if (lobby.colorAssignments[socketId]) return lobby.colorAssignments[socketId];
  const taken = new Set(Object.values(lobby.colorAssignments));
  const available = COLOR_OPTIONS.find((c) => !taken.has(c.id));
  const colorId = available?.id || pickDefaultColorId();
  lobby.colorAssignments[socketId] = colorId;
  return colorId;
}

function allocateLobbyTeam(lobby, socketId) {
  if (!lobby.teamAssignments) lobby.teamAssignments = {};
  if (lobby.teamAssignments[socketId]) return lobby.teamAssignments[socketId];
  const counts = new Map(TEAM_OPTIONS.map((team) => [team, 0]));
  for (const assignedTeam of Object.values(lobby.teamAssignments)) {
    if (!counts.has(assignedTeam)) continue;
    counts.set(assignedTeam, (counts.get(assignedTeam) || 0) + 1);
  }
  let bestTeam = TEAM_OPTIONS[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const teamId of TEAM_OPTIONS) {
    const count = counts.get(teamId) || 0;
    if (count < bestCount) {
      bestTeam = teamId;
      bestCount = count;
    }
  }
  lobby.teamAssignments[socketId] = bestTeam;
  return bestTeam;
}

function removeFromQueue(socket) {
  const idx = waitingQueue.indexOf(socket);
  if (idx !== -1) waitingQueue.splice(idx, 1);
  socket.isQueued = false;
}

function getLobbyList() {
  return [...lobbies.values()].map((lobby) => ({
    id: lobby.id,
    name: lobby.name,
    players: lobby.players.length,
    capacity: lobby.capacity,
    allowCheats: !!lobby.allowCheats,
  }));
}

function broadcastLobbyList() {
  io.emit("lobbyList", getLobbyList());
}

function leaveLobby(socket, reason = "left") {
  const lobbyId = socket.lobbyId;
  if (!lobbyId || !lobbies.has(lobbyId)) return;
  const lobby = lobbies.get(lobbyId);
  lobby.players = lobby.players.filter((id) => id !== socket.id);
  if (lobby.colorAssignments) {
    delete lobby.colorAssignments[socket.id];
  }
  if (lobby.teamAssignments) {
    delete lobby.teamAssignments[socket.id];
  }
  socket.lobbyId = null;
  if (!lobby.players.length) {
    lobbies.delete(lobbyId);
  } else if (lobby.hostId === socket.id) {
    lobby.hostId = lobby.players[0];
  }
  socket.emit("lobbyLeft", { reason });
  if (lobbies.has(lobbyId)) {
    emitLobbyUpdate(lobby);
  }
  broadcastLobbyList();
}

function getLobbyPayload(lobby, socketId) {
  return {
    id: lobby.id,
    name: lobby.name,
    players: lobby.players.length,
    capacity: lobby.capacity,
    isHost: lobby.hostId === socketId,
    allowCheats: !!lobby.allowCheats,
    colorAssignments: lobby.colorAssignments || {},
    teamAssignments: lobby.teamAssignments || {},
  };
}

function getLobbyPlayerList(lobby) {
  return lobby.players.map((id, index) => ({
    id,
    label: id === lobby.hostId ? "Host" : `Player ${index + 1}`,
    isHost: id === lobby.hostId,
    team: lobby.teamAssignments?.[id] || TEAM_OPTIONS[0],
  }));
}

function getLobbyRoomPayload(lobby, socketId) {
  return {
    id: lobby.id,
    name: lobby.name,
    capacity: lobby.capacity,
    players: getLobbyPlayerList(lobby),
    isHost: lobby.hostId === socketId,
    allowCheats: !!lobby.allowCheats,
    colorAssignments: lobby.colorAssignments || {},
    teamAssignments: lobby.teamAssignments || {},
  };
}

function emitLobbyUpdate(lobby) {
  for (const id of lobby.players) {
    const socket = io.sockets.sockets.get(id);
    if (socket && socket.connected) {
      socket.emit("lobbyUpdate", getLobbyRoomPayload(lobby, id));
    }
  }
}

function getUnitById(match, id) {
  return match.units.find((unit) => unit.id === id);
}

function getBuildingById(match, id) {
  return match.buildings.find((building) => building.id === id);
}

function getRelicById(match, id) {
  return (match.relics || []).find((relic) => relic.id === id);
}

function canPlayerPickUpRelics(match, playerOrOwnerId) {
  if (!match) return false;
  let ownerId = playerOrOwnerId;
  if (typeof playerOrOwnerId === "object" && playerOrOwnerId !== null) {
    ownerId = playerOrOwnerId.index;
  }
  const player = match.players?.[ownerId];
  return (player?.ageTier ?? 0) >= 2;
}

function ensureOrderQueue(unit) {
  if (!Array.isArray(unit.orderQueue)) {
    unit.orderQueue = [];
  }
  return unit.orderQueue;
}

function cloneOrder(order) {
  if (!order) return null;
  return {
    ...order,
    target: order.target
      ? { x: order.target.x, y: order.target.y }
      : undefined,
    formationOffset: order.formationOffset
      ? { x: order.formationOffset.x, y: order.formationOffset.y }
      : undefined,
  };
}

function applyOrderSideEffects(unit, order) {
  if (!unit || !order) return;
  if (order.type === "move" || order.type === "attackMove") {
    unit.attackTargetId = null;
    if (order.type === "move" && unit.type === "Trader" && unit.trade) {
      unit.trade.paused = true;
    }
    return;
  }
  if (order.type === "attack") {
    unit.attackTargetId = order.targetId ?? null;
  }
}

function issueUnitOrder(unit, order, queue = false) {
  if (!unit || !order) return;
  const orderQueue = ensureOrderQueue(unit);
  const queuedOrder = cloneOrder(order);
  if (queue && unit.order) {
    orderQueue.push(queuedOrder);
    return;
  }
  if (queue && !unit.order) {
    if (orderQueue.length) {
      orderQueue.push(queuedOrder);
      unit.order = orderQueue.shift();
      applyOrderSideEffects(unit, unit.order);
      return;
    }
  } else {
    orderQueue.length = 0;
  }
  unit.order = queuedOrder;
  applyOrderSideEffects(unit, queuedOrder);
}

function activateNextQueuedOrder(match, unit) {
  if (!unit || unit.order) return;
  const orderQueue = ensureOrderQueue(unit);
  while (!unit.order && orderQueue.length) {
    const next = orderQueue.shift();
    if (!next) continue;
    unit.order = next;
    applyOrderSideEffects(unit, next);
  }
}

function activateQueuedOrders(match) {
  for (const unit of match.units) {
    activateNextQueuedOrder(match, unit);
  }
}

function serializeOrder(order) {
  if (!order) return null;
  const out = { type: order.type };
  if (order.target) out.target = { x: order.target.x, y: order.target.y };
  if (order.targetId != null) out.targetId = order.targetId;
  if (order.unitId != null) out.unitId = order.unitId;
  if (order.resourceId != null) out.resourceId = order.resourceId;
  if (order.buildingId != null) out.buildingId = order.buildingId;
  if (order.relicId != null) out.relicId = order.relicId;
  if (order.manual) out.manual = true;
  if (order.manualTarget) out.manualTarget = true;
  return out;
}

function findDropoffBuilding(match, ownerId, kind, fromX, fromY) {
  let best = null;
  let bestDist = Infinity;
  for (const building of match.buildings) {
    if (building.ownerId !== ownerId) continue;
    if (!isBuildingFunctional(building)) continue;
    const def = BUILDINGS[building.type];
    if (!def) continue;
    if (!def.accepts || !def.accepts.includes(kind)) continue;
    const centerX = building.x + def.size / 2;
    const centerY = building.y + def.size / 2;
    const d = Math.hypot(centerX - fromX, centerY - fromY);
    if (d < bestDist) {
      bestDist = d;
      best = building;
    }
  }
  return best;
}

function findResourceAt(match, x, y) {
  for (const node of match.resources) {
    const within =
      x >= node.x &&
      x <= node.x + node.size &&
      y >= node.y &&
      y <= node.y + node.size;
    if (within) return node;
  }
  return null;
}

function findRelicAt(match, x, y) {
  for (const relic of match.relics || []) {
    if (relic.carrierId || relic.storedInBuildingId) continue;
    const radius = (relic.size || 0.9) * 0.5;
    if (Math.hypot(relic.x - x, relic.y - y) <= radius) {
      return relic;
    }
  }
  return null;
}

function distanceToBuilding(unit, building) {
  const def = BUILDINGS[building.type];
  const targetX = clamp(unit.x, building.x, building.x + def.size);
  const targetY = clamp(unit.y, building.y, building.y + def.size);
  return Math.hypot(targetX - unit.x, targetY - unit.y);
}

function findNearestUnfinished(match, unit, maxDist) {
  let best = null;
  let bestDist = Infinity;
  for (const building of match.buildings) {
    if (!building.isUnderConstruction) continue;
    const d = distanceToBuilding(unit, building);
    if (d <= maxDist && d < bestDist) {
      bestDist = d;
      best = building;
    }
  }
  return best;
}

function findNearestResource(match, unit, kinds, maxDist) {
  let best = null;
  let bestDist = Infinity;
  for (const node of match.resources) {
    if (!kinds.includes(node.kind)) continue;
    const centerX = node.x + node.size / 2;
    const centerY = node.y + node.size / 2;
    const d = Math.hypot(centerX - unit.x, centerY - unit.y);
    if (d <= maxDist && d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

function isPlacementValid(match, type, x, y) {
  const def = BUILDINGS[type];
  if (!def) return false;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < 0 || y < 0) return false;
  if (x + def.size > MAP.width || y + def.size > MAP.height) return false;
  const occupied = [];
  for (const building of match.buildings) {
    const bDef = BUILDINGS[building.type];
    occupied.push({ x: building.x, y: building.y, size: bDef.size });
  }
  for (const node of match.resources) {
    occupied.push({ x: node.x, y: node.y, size: node.size });
  }
  return isAreaFree(x, y, def.size, occupied);
}

function getEntitySnapshot(match) {
  return {
    tick: match.tick,
    attacks: match.pendingAttacks,
    fogReveal: match.fogReveal,
    resources: match.resources.map((node) => ({
      id: node.id,
      type: node.type,
      kind: node.kind,
      x: node.x,
      y: node.y,
      size: node.size,
      amount: node.amount,
    })),
    units: match.units.map((unit) => ({
      id: unit.id,
      ownerId: unit.ownerId,
      type: unit.type,
      x: unit.x,
      y: unit.y,
      hp: unit.hp,
      maxHp: unit.maxHp,
      attackCooldown: unit.attackCooldown ?? 0,
      facing: unit.facing ?? 0,
      orderType: unit.order ? unit.order.type : null,
      activeOrder: serializeOrder(unit.order),
      isHealing: !!unit.isHealing,
      carry: unit.carry,
      relicId: unit.relicId || null,
      queuedOrders: (unit.orderQueue || []).map((order) => serializeOrder(order)),
      trade: unit.trade,
    })),
    buildings: match.buildings.map((building) => ({
      id: building.id,
      ownerId: building.ownerId,
      type: building.type,
      x: building.x,
      y: building.y,
      hp: building.hp,
      maxHp: building.maxHp,
      attackCooldowns: { ...(building.attackCooldowns || {}) },
      rallyPoint: building.rallyPoint,
      isUnderConstruction: building.isUnderConstruction,
      buildProgress: building.buildProgress,
      buildTime: building.buildTime,
      farmerId: building.farmerId,
      garrisonCount: building.garrison.length,
      garrison: building.garrison,
      productionQueue: building.productionQueue.map((job) => ({
        unitType: job.unitType,
        techId: job.techId,
        remaining: job.remaining,
        total: job.total,
      })),
      techs: building.techs,
      relicIds: building.relicIds || [],
      landmarkAgeTier: building.landmarkAgeTier,
      landmarkDestroyed: !!building.landmarkDestroyed,
      convertResourceKind: building.convertResourceKind || null,
    })),
    relics: (match.relics || []).map((relic) => ({
      id: relic.id,
      x: relic.x,
      y: relic.y,
      size: relic.size || 0.9,
      tag: relic.tag || "Religious Artifact",
      carrierId: relic.carrierId ?? null,
      storedInBuildingId: relic.storedInBuildingId ?? null,
    })),
    players: match.players.map((player) => ({
      index: player.index,
      team: player.team,
      eliminated: !!player.eliminated,
      resources: player.resources,
      techs: player.techs,
      ageTier: player.ageTier,
      age: player.age,
      landmarkChoices: player.landmarkChoices || [],
      landmarkBuiltAges: player.landmarkBuiltAges || {},
      color: player.color,
      populationUsed: getPopulationUsed(match, player.index),
      populationCap: getPopulationCap(match, player.index),
    })),
  };
}

function canAfford(player, cost) {
  const normalizedCost = normalizeCost(cost);
  if (!normalizedCost) return true;
  return Object.entries(normalizedCost).every(
    ([key, value]) => (player.resources[key] || 0) >= value
  );
}

function applyCost(player, cost) {
  const normalizedCost = normalizeCost(cost);
  if (!normalizedCost) return;
  for (const [key, value] of Object.entries(normalizedCost)) {
    player.resources[key] = (player.resources[key] || 0) - value;
  }
}

function isBuildingEntity(target) {
  return !!BUILDINGS[target?.type] && !UNITS[target?.type];
}

function isDefensiveBuildingType(buildingType) {
  return !!BUILDING_CATEGORIES?.defensive?.includes(buildingType);
}

function isLandmarkBuildingType(buildingType) {
  const def = BUILDINGS[buildingType];
  if (!def) return false;
  return String(def.tag || "").toLowerCase().includes("landmark");
}

function isDestroyedLandmark(building) {
  if (!building) return false;
  if (!isLandmarkBuildingType(building.type)) return false;
  return !!building.landmarkDestroyed;
}

function isUntargetableDestroyedLandmark(building) {
  if (!isDestroyedLandmark(building)) return false;
  return (building.hp ?? 0) <= 0;
}

function isBuildingFunctional(building) {
  if (!building) return false;
  if (building.isUnderConstruction) return false;
  if (isDestroyedLandmark(building)) return false;
  return true;
}

function getRepairResourceKind(buildingType) {
  const def = BUILDINGS[buildingType];
  if (!def) return "wood";
  if (isDefensiveBuildingType(buildingType) && Number(def.cost?.stone || 0) > 0) {
    return "stone";
  }
  return "wood";
}

function getPlayerTeam(match, playerIndex) {
  if (playerIndex === null || playerIndex === undefined) return null;
  const player = match?.players?.[playerIndex];
  if (!player) return Number(playerIndex) + 1;
  return player.team ?? player.index + 1;
}

function arePlayersAllied(match, aIndex, bIndex) {
  if (
    aIndex === null ||
    aIndex === undefined ||
    bIndex === null ||
    bIndex === undefined
  ) {
    return false;
  }
  // Same owner index is always allied, even if that player slot is not populated
  // (e.g. singleplayer cheat-spawned enemy owner slot).
  if (aIndex === bIndex) {
    return true;
  }
  const a = match?.players?.[aIndex];
  const b = match?.players?.[bIndex];
  if (!a || !b) return false;
  return getPlayerTeam(match, aIndex) === getPlayerTeam(match, bIndex);
}

function isEnemyPlayer(match, aIndex, bIndex) {
  if (
    aIndex === null ||
    aIndex === undefined ||
    bIndex === null ||
    bIndex === undefined
  ) {
    return false;
  }
  return !arePlayersAllied(match, aIndex, bIndex);
}

function getAttackAlertType(target) {
  if (!isBuildingEntity(target)) return "unit";
  if (isLandmarkBuildingType(target.type)) return "landmark";
  return "building";
}

function emitAttackAlert(match, playerIndex, target, attacker = null) {
  if (!target) return;
  const attackedPlayer = match.players[playerIndex];
  if (!attackedPlayer || attackedPlayer.eliminated) return;
  const attackedTeam = getPlayerTeam(match, playerIndex);
  if (!attackedTeam) return;
  const now = Date.now();
  const bucketSize = 5;
  const keyX = Math.floor(target.x / bucketSize);
  const keyY = Math.floor(target.y / bucketSize);
  const kind = getAttackAlertType(target);
  const x = isBuildingEntity(target)
    ? target.x + BUILDINGS[target.type].size / 2
    : target.x;
  const y = isBuildingEntity(target)
    ? target.y + BUILDINGS[target.type].size / 2
    : target.y;

  let attackerX = null;
  let attackerY = null;
  if (attacker) {
    if (isBuildingEntity(attacker)) {
      const def = BUILDINGS[attacker.type];
      if (def) {
        attackerX = attacker.x + def.size / 2;
        attackerY = attacker.y + def.size / 2;
      }
    } else if (Number.isFinite(attacker.x) && Number.isFinite(attacker.y)) {
      attackerX = attacker.x;
      attackerY = attacker.y;
    }
  }
  for (const recipient of match.players) {
    if (!recipient || !recipient.id || recipient.eliminated) continue;
    if (getPlayerTeam(match, recipient.index) !== attackedTeam) continue;
    const isAlly = recipient.index !== playerIndex;
    const key = `${keyX},${keyY},${kind},${isAlly ? "ally" : "self"}`;
    let playerMap = match.alertCooldowns.get(recipient.index);
    if (!playerMap) {
      playerMap = new Map();
      match.alertCooldowns.set(recipient.index, playerMap);
    }
    const last = playerMap.get(key) || 0;
    if (now - last < 3000) continue;
    playerMap.set(key, now);
    let recipientAttackerX = attackerX;
    let recipientAttackerY = attackerY;
    if (
      Number.isFinite(recipientAttackerX) &&
      Number.isFinite(recipientAttackerY) &&
      canPlayerSeeTarget(match, recipient.index, {
        x: recipientAttackerX,
        y: recipientAttackerY,
      })
    ) {
      recipientAttackerX = null;
      recipientAttackerY = null;
    }
    io.to(recipient.id).emit("attackAlert", {
      kind,
      isAlly,
      x,
      y,
      attackerX: recipientAttackerX,
      attackerY: recipientAttackerY,
    });
  }
}

function applyAgeAdvancement(match, player, newTier) {
  if (!match || !player) return false;
  const prevTier = Math.max(0, Number(player.ageTier ?? 0));
  const targetTier = clamp(Math.floor(newTier), 0, 4);
  if (targetTier <= prevTier) return false;
  player.ageTier = targetTier;
  player.age = AGE_ORDER[targetTier] || player.age;
  return true;
}

function getDominionSpireMaxHpForAge(player, ageTier) {
  const hpByAge = LANDMARK_BONUSES?.DominionSpire?.hpByAge || [];
  const baseHp = hpByAge[getLandmarkBonusIndexFromAge(ageTier)] || BUILDINGS.DominionSpire?.health || 5000;
  const bedrockBonus = getBedrockFoundationsBonus(player);
  return baseHp * (1 + bedrockBonus);
}

function applyBedrockFoundationsToExistingBuildings(match, playerIndex) {
  const player = match?.players?.[playerIndex];
  if (!player) return;
  for (const building of match.buildings) {
    if (building.ownerId !== playerIndex) continue;
    const previousMax = building.maxHp || BUILDINGS[building.type]?.health || 1;
    let nextMax = getBuildingMaxHpForOwner(match, playerIndex, building.type);
    if (building.type === "DominionSpire") {
      const ageTier = getLandmarkAgeTierForBuilding(match, building) || 1;
      nextMax = getDominionSpireMaxHpForAge(player, ageTier);
    }
    if (nextMax <= 0 || nextMax === previousMax) continue;
    const ratio = Math.max(0, Math.min(1, (building.hp || 0) / previousMax));
    building.maxHp = nextMax;
    if (building.isUnderConstruction) {
      const total = Math.max(0.001, building.buildTime || 1);
      const progress = Math.max(
        0,
        Math.min(1, (building.buildProgress || 0) / total)
      );
      building.hp = Math.max(1, Math.round(nextMax * progress));
    } else {
      building.hp = Math.max(1, Math.min(nextMax, nextMax * ratio));
    }
  }
}

function applyGlobalUnitHealthRecalculation(match, playerIndex) {
  const player = match?.players?.[playerIndex];
  if (!player) return;
  for (const unit of match.units) {
    if (unit.ownerId !== playerIndex) continue;
    const stats = getUnitEffectiveStats(player, unit.type);
    if (!stats) continue;
    const hpMultiplier = Number(unit.bonusHpMultiplier || 1);
    const newMax = Math.max(1, stats.health * hpMultiplier);
    const oldMax = Math.max(1, unit.maxHp || newMax);
    const hpRatio = Math.max(0, Math.min(1, (unit.hp || 0) / oldMax));
    unit.maxHp = newMax;
    unit.hp = Math.max(1, Math.min(newMax, newMax * hpRatio));
  }
}

function getArmor(match, target, isRanged) {
  if (!target) return 0;
  if (isBuildingEntity(target)) {
    const def = BUILDINGS[target.type];
    if (!def) return isRanged ? DEFAULT_BUILDING_RANGED_ARMOR : 0;
    if (isRanged) return def.rangedArmor ?? DEFAULT_BUILDING_RANGED_ARMOR;
    return def.meleeArmor || 0;
  }
  const def = UNITS[target.type];
  if (!def) return 0;
  const player = match?.players?.[target.ownerId];
  const stats = player ? getUnitEffectiveStats(player, target.type) : null;
  let armor = 0;
  if (isRanged) {
    armor =
      stats?.rangedArmor ??
      def.rangedArmor ??
      0;
  } else {
    armor =
      stats?.meleeArmor ??
      def.meleeArmor ??
      0;
  }
  if (player && !def.type.includes("Siege")) {
    if (!isRanged) {
      if (player.techs?.ChainmailArmor) armor += 1;
      if (player.techs?.DiamondArmor) armor += 1;
      if (player.techs?.EmeraldArmor) armor += 1;
      if (player.techs?.EnlightenedArmor) armor += 1;
    } else {
      if (player.techs?.LeatherPadding) armor += 1;
      if (player.techs?.ImprovedShields) armor += 1;
      if (player.techs?.DeflectiveScales) armor += 1;
      if (player.techs?.GildedFittings) armor += 1;
    }
  }
  return armor;
}

function getRangedResistance(target) {
  if (!target || isBuildingEntity(target)) return 0;
  const def = UNITS[target.type];
  if (!def) return 0;
  const value = def.rangedResistance ?? 0;
  return Math.max(0, Math.min(0.99, value));
}

function getCarryCapacity(match, ownerId) {
  const player = match.players[ownerId];
  if (!player) return 10;
  let capacity = 10;
  if (player.techs?.CarryingFrame) {
    capacity += TECHNOLOGIES.CarryingFrame?.carryBonus || 0;
  }
  return capacity;
}

function getUnitSpeed(match, unit) {
  const def = UNITS[unit.type];
  if (!def) return 0;
  if (unit.type === "Monk" && unit.relicId) {
    return 0.875;
  }
  if (unit.type === "Knight" && unit.charge?.active) {
    return 2;
  }
  if (unit.type !== "Villager") return def.speed;
  const player = match.players[unit.ownerId];
  if (player?.techs?.CarryingFrame) {
    return def.speed + (TECHNOLOGIES.CarryingFrame?.speedBonus || 0);
  }
  return def.speed;
}

function isTechInProgress(match, playerIndex, techId, buildingId = null) {
  for (const building of match.buildings) {
    if (building.ownerId !== playerIndex) continue;
    if (buildingId && building.id !== buildingId) continue;
    if (!building.productionQueue) continue;
    if (building.productionQueue.some((job) => job.techId === techId)) {
      return true;
    }
  }
  return false;
}

function getBuildingAttackProfiles(building, def) {
  const profiles = [];
  const baseRange = def.attack?.range || 0;
  const baseDamage = def.attack?.damage || 0;
  const baseVolley = def.attack?.volley || 0;
  if (
    building.type !== "DisruptorCannon" &&
    baseRange > 0 &&
    (baseDamage > 0 || baseVolley > 0)
  ) {
    profiles.push({
      id: "base",
      label: "Attack",
      range: baseRange,
      cooldown: def.attack?.cooldown || 1,
      baseDamage,
      volley: baseVolley,
      useGarrison: true,
      projectile: "arrow",
      damageType: "ranged",
    });
  }

  if (building.type === "Outpost" && building.techs?.Arrowslits) {
    profiles.push({
      id: "arrowslits",
      label: "Arrowslits",
      range: 7,
      cooldown: 2,
      baseDamage: 10,
      volley: 1,
      useGarrison: true,
      projectile: "arrow",
      damageType: "ranged",
    });
  }

  if (
    (building.type === "Outpost" ||
      building.type === "Castle" ||
      building.type === "DominionSpire") &&
    building.techs?.SpringaldEmplacement
  ) {
    profiles.push({
      id: "springald",
      label: "Springald",
      range: 9,
      cooldown: 4,
      baseDamage: 40,
      volley: 1,
      useGarrison: false,
      projectile: "springald",
      damageType: "ranged",
    });
  }

  if (building.type === "DominionSpire") {
    const ageTier = getLandmarkAgeTierForBuilding(null, building) || 1;
    const arrows = LANDMARK_BONUSES?.DominionSpire?.arrowslitsByAge || [];
    const damages = LANDMARK_BONUSES?.DominionSpire?.arrowslitDamageByAge || [];
    profiles.push({
      id: "spire_arrowslits",
      label: "Arrowslits",
      range: 8,
      cooldown: 0.5,
      baseDamage: damages[getLandmarkBonusIndexFromAge(ageTier)] || 10,
      volley: arrows[getLandmarkBonusIndexFromAge(ageTier)] || 2,
      useGarrison: false,
      projectile: "arrow",
      damageType: "ranged",
    });
    profiles.push({
      id: "spire_garrison",
      label: "Garrison Arrows",
      range: 8,
      cooldown: 2,
      baseDamage: 8,
      volley: 0,
      useGarrison: true,
      projectile: "arrow",
      damageType: "ranged",
    });
  }

  if (building.type === "StoneTower") {
    profiles.push({
      id: "garrison_arrows",
      label: "Garrison Arrows",
      range: 7,
      cooldown: 2,
      baseDamage: 0,
      volley: 0,
      useGarrison: true,
      projectile: "arrow",
      damageType: "ranged",
    });
    profiles.push({
      id: "springald",
      label: "Springald",
      range: 9,
      cooldown: 4,
      baseDamage: 60,
      volley: 1,
      useGarrison: false,
      projectile: "springald",
      damageType: "ranged",
    });
  }

  if (building.type === "DisruptorCannon") {
    profiles.push({
      id: "disruptor",
      label: "Disruptor",
      range: def.attack?.range || 30,
      minRange: def.attack?.minRange || 5,
      cooldown: def.attack?.cooldown || 10,
      baseDamage: def.attack?.damage || 100,
      volley: 1,
      useGarrison: false,
      projectile: "disruptor",
      splashRadius: def.attack?.splashRadius ?? 1.5,
      splashFalloff: def.attack?.splashFalloff || [
        { radius: 0.5, scale: 1 },
        { radius: 1, scale: 0.66 },
        { radius: 1.5, scale: 0.33 },
      ],
      bonus: [{ target: "Building", damage: 500 }],
      requiresVisible: true,
      damageType: "siege",
    });
  }

  return profiles;
}

function getUnitDamageBonus(match, unit, isRanged) {
  const player = match.players[unit.ownerId];
  if (!player) return 0;
  let bonus = 0;
  if (isRanged) {
    if (UNITS[unit.type]?.type?.includes("Gunpowder")) return 0;
    if (player.techs?.LightweightShafts) bonus += 1;
    if (player.techs?.PiercingPoints) bonus += 1;
    if (player.techs?.Aerodynamic) bonus += 1;
    if (player.techs?.BodkinBolts) bonus += 1;
  } else {
    if (player.techs?.IronForging) bonus += 1;
    if (player.techs?.DiamondForging) bonus += 1;
    if (player.techs?.EmeraldForging) bonus += 1;
    if (player.techs?.EnlightenedForging) bonus += 1;
  }
  return bonus;
}

function getNearbyGoldenFountainGatherBonus(match, unit) {
  if (!match || !unit) return 0;
  let best = 0;
  for (const building of match.buildings) {
    if (building.ownerId !== unit.ownerId) continue;
    if (building.type !== "GoldenFountainSquare") continue;
    if (building.isUnderConstruction) continue;
    if (isDestroyedLandmark(building)) continue;
    const center = getBuildingCenter(building);
    const d = Math.hypot(center.x - unit.x, center.y - unit.y);
    const auraRange =
      LANDMARK_BONUSES?.GoldenFountainSquare?.auraRange || 6;
    if (d > auraRange) continue;
    const ageTier = getLandmarkAgeTierForBuilding(match, building) || 1;
    const bonus =
      LANDMARK_BONUSES?.GoldenFountainSquare?.gatherRateBonusByAge?.[
        getLandmarkBonusIndexFromAge(ageTier)
      ] || 0;
    if (bonus > best) best = bonus;
  }
  return best;
}

function getGatherRate(match, unit, kind) {
  const baseRate = UNITS.Villager.gatherRate || 1;
  const player = match.players[unit.ownerId];
  if (!player) return baseRate;
  let bonus = 0;
  if (player.techs?.Basketry && kind === "food") bonus += 0.1;
  if (player.techs?.Agriculture && kind === "food") bonus += 0.1;
  if (player.techs?.OakHandle && kind === "wood") bonus += 0.1;
  if (player.techs?.DoubleHeadedAxe && kind === "wood") bonus += 0.1;
  if (player.techs?.CarbideTip && (kind === "gold" || kind === "stone")) {
    bonus += 0.1;
  }
  if (player.techs?.HeavySwings && (kind === "gold" || kind === "stone")) {
    bonus += 0.1;
  }
  bonus += getNearbyGoldenFountainGatherBonus(match, unit);
  return baseRate * (1 + bonus);
}

function getDropoffMultiplier(player, kind) {
  if (!player || !kind) return 1;
  let bonus = 0;
  if (player.techs?.ImprovedProcessing && kind === "food") bonus += 0.1;
  if (player.techs?.WoodSaws && kind === "wood") bonus += 0.1;
  if (player.techs?.TungstenTip && (kind === "gold" || kind === "stone")) {
    bonus += 0.1;
  }
  return 1 + bonus;
}

function getUnitRadius(unit) {
  const def = UNITS[unit?.type];
  if (!def) return 0.3;
  return def.type?.includes("Siege") ? 0.6 : 0.3;
}

function getUnitMaxHp(unit) {
  if (!unit) return 1;
  return unit.maxHp ?? UNITS[unit.type]?.health ?? 1;
}

function isUnitDamaged(unit) {
  if (!unit) return false;
  return unit.hp < getUnitMaxHp(unit);
}

function isSiegeUnit(unit) {
  if (!unit) return false;
  const def = UNITS[unit.type];
  return !!def?.type?.includes("Siege");
}

function findNearestDamagedFriendlyUnit(match, healer, maxRange) {
  if (!match || !healer) return null;
  let best = null;
  let bestDist = Infinity;
  for (const unit of match.units) {
    if (unit.id === healer.id) continue;
    if (unit.ownerId !== healer.ownerId) continue;
    if (isSiegeUnit(unit)) continue;
    if (!isUnitDamaged(unit)) continue;
    const d = Math.hypot(unit.x - healer.x, unit.y - healer.y);
    if (d <= maxRange && d < bestDist) {
      bestDist = d;
      best = unit;
    }
  }
  return best;
}

function getBonusDamage(bonusList, target) {
  if (!bonusList || !bonusList.length || !target) return 0;
  const targetType = isBuildingEntity(target)
    ? "Building"
    : UNITS[target.type]?.type || "";
  for (const bonus of bonusList) {
    if (targetType.includes(bonus.target)) return bonus.damage;
  }
  return 0;
}

function getTargetDistance(attacker, target) {
  if (!attacker || !target) return Infinity;
  if (isBuildingEntity(target)) {
    const def = BUILDINGS[target.type];
    const targetX = clamp(attacker.x, target.x, target.x + def.size);
    const targetY = clamp(attacker.y, target.y, target.y + def.size);
    return Math.hypot(targetX - attacker.x, targetY - attacker.y);
  }
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const centerDistance = Math.hypot(dx, dy);
  const targetRadius = getUnitRadius(target);
  return Math.max(0, centerDistance - targetRadius);
}

function canUnitSeeTarget(match, unit, target) {
  if (!unit || !target) return false;
  const player = match?.players?.[unit.ownerId];
  const sight = getUnitSightForPlayer(player, unit.type);
  if (isBuildingEntity(target)) {
    const def = BUILDINGS[target.type];
    const tx = clamp(unit.x, target.x, target.x + def.size);
    const ty = clamp(unit.y, target.y, target.y + def.size);
    return Math.hypot(tx - unit.x, ty - unit.y) <= sight;
  }
  return Math.hypot(target.x - unit.x, target.y - unit.y) <= sight;
}

function canPlayerSeeTarget(match, ownerId, target) {
  if (!match || ownerId == null || !target) return false;
  const owner = match.players?.[ownerId];
  if (owner?.eliminated) return false;
  const ownerTeam = getPlayerTeam(match, ownerId);
  const canUseSource = (sourceOwnerId) => {
    if (sourceOwnerId === null || sourceOwnerId === undefined) return false;
    const sourcePlayer = match.players?.[sourceOwnerId];
    if (sourcePlayer?.eliminated) return false;
    return getPlayerTeam(match, sourceOwnerId) === ownerTeam;
  };

  // Any friendly unit can provide vision.
  for (const unit of match.units) {
    if (!canUseSource(unit.ownerId)) continue;
    if (canUnitSeeTarget(match, unit, target)) return true;
  }

  // Any friendly building can provide vision from its center.
  for (const building of match.buildings) {
    if (!canUseSource(building.ownerId)) continue;
    if (isDestroyedLandmark(building)) continue;
    const def = BUILDINGS[building.type];
    if (!def) continue;
    const sourcePlayer = match.players?.[building.ownerId];
    const sight = getBuildingSightForPlayer(sourcePlayer, building.type);
    const observerX = building.x + def.size / 2;
    const observerY = building.y + def.size / 2;
    if (isBuildingEntity(target)) {
      const tDef = BUILDINGS[target.type];
      const tx = clamp(observerX, target.x, target.x + tDef.size);
      const ty = clamp(observerY, target.y, target.y + tDef.size);
      if (Math.hypot(tx - observerX, ty - observerY) <= sight) return true;
    } else if (Math.hypot(target.x - observerX, target.y - observerY) <= sight) {
      return true;
    }
  }

  return false;
}

function isInRange(attacker, target, range, minRange = 0) {
  if (!attacker || !target) return false;
  let effectiveRange = range;
  if (effectiveRange <= 0.6) {
    effectiveRange = 0.7;
  }
  const effectiveMinRange = Math.max(0, minRange || 0);
  const distance = getTargetDistance(attacker, target);
  return distance <= effectiveRange && distance >= effectiveMinRange;
}

function getAttackAimPoint(attacker, target) {
  if (!attacker || !target) return null;
  if (isBuildingEntity(target)) {
    const def = BUILDINGS[target.type];
    if (!def) return null;
    return {
      x: clamp(attacker.x, target.x, target.x + def.size),
      y: clamp(attacker.y, target.y, target.y + def.size),
    };
  }
  return { x: target.x, y: target.y };
}

function getEntityCenter(target) {
  if (!target) return null;
  if (isBuildingEntity(target)) {
    const def = BUILDINGS[target.type];
    if (!def) return null;
    return {
      x: target.x + def.size / 2,
      y: target.y + def.size / 2,
    };
  }
  return { x: target.x, y: target.y };
}

function getDistanceToBuildingBounds(x, y, building) {
  const def = BUILDINGS[building.type];
  if (!def) return Infinity;
  const px = clamp(x, building.x, building.x + def.size);
  const py = clamp(y, building.y, building.y + def.size);
  return Math.hypot(px - x, py - y);
}

function getSplashScale(profile, distance) {
  const falloff = profile?.splashFalloff;
  if (!Array.isArray(falloff) || !falloff.length) {
    const radius = profile?.splashRadius ?? 0;
    return distance <= radius ? 1 : 0;
  }
  for (const tier of falloff) {
    if (distance <= tier.radius) {
      return tier.scale ?? 0;
    }
  }
  return 0;
}

function faceTarget(unit, target, dt) {
  const aim = getAttackAimPoint(unit, target);
  if (!aim) return 0;
  const dx = aim.x - unit.x;
  const dy = aim.y - unit.y;
  if (Math.hypot(dx, dy) < 0.0001) return 0;
  const desired = Math.atan2(dy, dx);
  const current = Number.isFinite(unit.facing) ? unit.facing : desired;
  const maxStep = UNIT_TURN_RATE_RAD_PER_SEC * dt;
  unit.facing = normalizeAngle(rotateTowards(current, desired, maxStep));
  return Math.abs(normalizeAngle(desired - unit.facing));
}

function getGarrisonCapacity(building) {
  if (!building) return 0;
  if (isDestroyedLandmark(building)) return 0;
  if (building.type === "TownCenter" || building.type === "Castle") return 15;
  if (building.type === "Outpost") return 5;
  if (building.type === "StoneTower") return 8;
  if (building.type === "OldMarketPavilion") return 8;
  if (building.type === "DominionSpire") {
    const ageTier = clamp(Math.floor(building.landmarkAgeTier || 1), 1, 4);
    const capacities = LANDMARK_BONUSES?.DominionSpire?.garrisonByAge || [];
    return capacities[getLandmarkBonusIndexFromAge(ageTier)] || 8;
  }
  return 0;
}

function getRelicCapacity(building) {
  if (!building) return 0;
  const def = BUILDINGS[building.type];
  if (Number.isFinite(def?.relicCapacity)) {
    return Math.max(0, Math.floor(def.relicCapacity));
  }
  if (building.type === "Monastery") return 3;
  return 0;
}

function isRelicBuilding(building) {
  return getRelicCapacity(building) > 0;
}

function canGarrison(unit) {
  if (!unit) return false;
  if (unit.relicId) return false;
  return unit.type !== "CounterweightTrebuchet";
}

function findNearestEnemyUnit(match, unit, maxRange, minRange = 0) {
  let best = null;
  let bestDist = Infinity;
  for (const other of match.units) {
    if (!isEnemyPlayer(match, other.ownerId, unit.ownerId)) continue;
    const d = getTargetDistance(unit, other);
    if (d <= maxRange && d >= minRange && d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

function findNearestEnemyBuilding(match, unit, maxRange, minRange = 0) {
  let best = null;
  let bestDist = Infinity;
  for (const building of match.buildings) {
    if ((building.hp ?? 0) <= 0) continue;
    const def = BUILDINGS[building.type];
    if (!def) continue;
    if (def.isNeutral || def.isInvulnerable || building.ownerId === null) continue;
    if (!isEnemyPlayer(match, building.ownerId, unit.ownerId)) continue;
    const d = getTargetDistance(unit, building);
    if (d <= maxRange && d >= minRange && d < bestDist) {
      bestDist = d;
      best = building;
    }
  }
  return best;
}

function areUnitsNearby(units, maxDistance) {
  if (!units.length) return false;
  const center = units.reduce(
    (acc, unit) => {
      acc.x += unit.x;
      acc.y += unit.y;
      return acc;
    },
    { x: 0, y: 0 }
  );
  center.x /= units.length;
  center.y /= units.length;
  let maxDist = 0;
  for (const unit of units) {
    const d = Math.hypot(unit.x - center.x, unit.y - center.y);
    if (d > maxDist) maxDist = d;
  }
  return maxDist <= maxDistance;
}

function computeFormationOffsets(units, spacing = FORMATION_SPACING) {
  const offsets = new Map();
  const count = units.length;
  if (count === 0) return offsets;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const colOffset = (cols - 1) / 2;
  const rowOffset = (rows - 1) / 2;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const offsetX = (col - colOffset) * spacing;
    const offsetY = (row - rowOffset) * spacing;
    offsets.set(units[i].id, { x: offsetX, y: offsetY });
  }
  return offsets;
}

function breakFormation(match, formationId) {
  for (const unit of match.units) {
    if (unit.order?.formationId !== formationId) continue;
    delete unit.order.formationOffset;
    delete unit.order.formationSpeed;
    delete unit.order.formationId;
  }
}

function processMovement(match, dt) {
  const garrisonArrivals = [];
  for (const unit of match.units) {
    if (!unit.order) continue;
    if (unit.order.type === "trade") {
      const building = getBuildingById(match, unit.order.buildingId);
      if (!building) {
        unit.order = null;
        continue;
      }
      const def = BUILDINGS[building.type];
      const targetX = clamp(unit.x, building.x, building.x + def.size);
      const targetY = clamp(unit.y, building.y, building.y + def.size);
      const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
      if (distance > 0.6) {
        moveUnitWithPath(match, unit, targetX, targetY, dt, {
          ignoreBuildingId: building.id,
        });
      }
      continue;
    }
    if (unit.order.type === "garrison") {
      const building = getBuildingById(match, unit.order.buildingId);
      if (!building || building.ownerId !== unit.ownerId) {
        unit.order = null;
        continue;
      }
      if (building.isUnderConstruction || isDestroyedLandmark(building)) {
        unit.order = { type: "move", target: { x: building.x, y: building.y } };
        continue;
      }
      if (!canGarrison(unit)) {
        unit.order = null;
        continue;
      }
      const def = BUILDINGS[building.type];
      const targetX = clamp(unit.x, building.x, building.x + def.size);
      const targetY = clamp(unit.y, building.y, building.y + def.size);
      const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
      if (distance > 0.6) {
        moveUnitWithPath(match, unit, targetX, targetY, dt, {
          ignoreBuildingId: building.id,
        });
      } else {
        garrisonArrivals.push({ unit, building });
      }
      continue;
    }
    if (unit.order.type === "return") {
      const building = getBuildingById(match, unit.order.buildingId);
      if (
        !building ||
        building.isUnderConstruction ||
        isDestroyedLandmark(building)
      ) {
        const kind = unit.carry?.kind || null;
        if (kind) {
          const replacement = findDropoffBuilding(
            match,
            unit.ownerId,
            kind,
            unit.x,
            unit.y
          );
          if (replacement) {
            unit.order.buildingId = replacement.id;
            continue;
          }
        }
        unit.order = null;
        continue;
      }
    const def = BUILDINGS[building.type];
    const targetX = clamp(
      unit.x,
      building.x,
      building.x + def.size
    );
    const targetY = clamp(
      unit.y,
      building.y,
      building.y + def.size
    );
      const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
      if (distance > 0.6) {
        moveUnitWithPath(match, unit, targetX, targetY, dt, {
          ignoreBuildingId: building.id,
        });
      }
      continue;
    }

    if (unit.order.type === "build") {
      const building = getBuildingById(match, unit.order.buildingId);
      if (!building) {
        unit.order = null;
        continue;
      }
      const def = BUILDINGS[building.type];
      const targetX = clamp(
        unit.x,
        building.x,
        building.x + def.size
      );
      const targetY = clamp(
        unit.y,
        building.y,
        building.y + def.size
      );
      const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
      if (distance > 0.6) {
        moveUnitWithPath(match, unit, targetX, targetY, dt, {
          ignoreBuildingId: building.id,
          repathTicks: 20,
          unitAvoidanceStrength: 0.16,
        });
      }
      continue;
    }

    if (unit.order.type === "repair") {
      if (unit.order.buildingId != null) {
        const building = getBuildingById(match, unit.order.buildingId);
        if (
          !building ||
          building.ownerId !== unit.ownerId ||
          building.isUnderConstruction
        ) {
          unit.order = null;
          continue;
        }
        const maxHp =
          building.maxHp ||
          getBuildingMaxHpForOwner(match, building.ownerId, building.type);
        if ((building.hp ?? 0) >= maxHp) {
          unit.order = null;
          continue;
        }
        const targetX = clamp(
          unit.x,
          building.x,
          building.x + BUILDINGS[building.type].size
        );
        const targetY = clamp(
          unit.y,
          building.y,
          building.y + BUILDINGS[building.type].size
        );
        const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
        if (distance > 0.75) {
          moveUnitWithPath(match, unit, targetX, targetY, dt, {
            ignoreBuildingId: building.id,
            includeUnitAvoidance: false,
          });
        }
        continue;
      }
      if (unit.order.unitId != null) {
        const targetUnit = getUnitById(match, unit.order.unitId);
        if (
          !targetUnit ||
          targetUnit.ownerId !== unit.ownerId ||
          !isSiegeUnitType(targetUnit.type)
        ) {
          unit.order = null;
          continue;
        }
        const targetMaxHp = targetUnit.maxHp || UNITS[targetUnit.type]?.health || 1;
        if ((targetUnit.hp ?? 0) >= targetMaxHp) {
          unit.order = null;
          continue;
        }
        const distance = Math.hypot(targetUnit.x - unit.x, targetUnit.y - unit.y);
        if (distance > 1.25) {
          moveUnitWithPath(match, unit, targetUnit.x, targetUnit.y, dt, {
            includeUnitAvoidance: false,
          });
        }
        continue;
      }
      unit.order = null;
      continue;
    }

    if (unit.order.type === "farm") {
      const building = getBuildingById(match, unit.order.buildingId);
      if (!building || building.type !== "Farm") {
        unit.order = null;
        continue;
      }
      const targetX = clamp(
        unit.x,
        building.x,
        building.x + BUILDINGS.Farm.size
      );
      const targetY = clamp(
        unit.y,
        building.y,
        building.y + BUILDINGS.Farm.size
      );
      const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
      if (distance > 0.6) {
        moveUnitWithPath(match, unit, targetX, targetY, dt, {
          ignoreBuildingId: building.id,
        });
      }
      continue;
    }

    if (unit.order.type === "gather") {
      const target = match.resources.find((r) => r.id === unit.order.resourceId);
      if (!target) {
        unit.order = null;
        continue;
      }
      const centerX = target.x + target.size / 2;
      const centerY = target.y + target.size / 2;
      const distance = Math.hypot(centerX - unit.x, centerY - unit.y);
      if (distance > 0.6) {
        moveUnitWithPath(match, unit, centerX, centerY, dt, {
          ignoreResourceId: target.id,
        });
      }
      continue;
    }

    if (unit.order.type === "pickupRelic") {
      if (!canPlayerPickUpRelics(match, unit.ownerId)) {
        unit.order = null;
        continue;
      }
      const relic = getRelicById(match, unit.order.relicId);
      if (!relic || relic.carrierId || relic.storedInBuildingId || unit.relicId) {
        unit.order = null;
        continue;
      }
      const distance = Math.hypot(relic.x - unit.x, relic.y - unit.y);
      if (distance > 0.6) {
        moveUnitWithPath(match, unit, relic.x, relic.y, dt);
      } else {
        relic.carrierId = unit.id;
        relic.storedInBuildingId = null;
        unit.relicId = relic.id;
        unit.order = null;
      }
      continue;
    }

    if (unit.order.type === "depositRelic") {
      const building = getBuildingById(match, unit.order.buildingId);
      const relic = unit.relicId ? getRelicById(match, unit.relicId) : null;
      if (
        !building ||
        building.ownerId !== unit.ownerId ||
        !isRelicBuilding(building) ||
        building.isUnderConstruction ||
        !relic ||
        relic.carrierId !== unit.id
      ) {
        unit.order = null;
        continue;
      }
      const def = BUILDINGS[building.type];
      const tx = clamp(unit.x, building.x, building.x + def.size);
      const ty = clamp(unit.y, building.y, building.y + def.size);
      const distance = Math.hypot(tx - unit.x, ty - unit.y);
      if (distance > 0.6) {
        moveUnitWithPath(match, unit, tx, ty, dt, { ignoreBuildingId: building.id });
      } else if ((building.relicIds || []).length < getRelicCapacity(building)) {
        building.relicIds.push(relic.id);
        relic.carrierId = null;
        relic.storedInBuildingId = building.id;
        relic.x = building.x + def.size / 2;
        relic.y = building.y + def.size / 2;
        unit.relicId = null;
        unit.order = null;
      } else {
        unit.order = null;
      }
      continue;
    }

    if (unit.order.type === "takeRelic") {
      if (!canPlayerPickUpRelics(match, unit.ownerId)) {
        unit.order = null;
        continue;
      }
      const building = getBuildingById(match, unit.order.buildingId);
      if (
        !building ||
        building.ownerId !== unit.ownerId ||
        !isRelicBuilding(building) ||
        building.isUnderConstruction ||
        unit.relicId
      ) {
        unit.order = null;
        continue;
      }
      const def = BUILDINGS[building.type];
      const tx = clamp(unit.x, building.x, building.x + def.size);
      const ty = clamp(unit.y, building.y, building.y + def.size);
      const distance = Math.hypot(tx - unit.x, ty - unit.y);
      if (distance > 0.6) {
        moveUnitWithPath(match, unit, tx, ty, dt, { ignoreBuildingId: building.id });
      } else {
        const relicId = (building.relicIds || []).shift();
        if (!relicId) {
          unit.order = null;
          continue;
        }
        const relic = getRelicById(match, relicId);
        if (!relic) {
          unit.order = null;
          continue;
        }
        relic.storedInBuildingId = null;
        relic.carrierId = unit.id;
        unit.relicId = relic.id;
        unit.order = null;
      }
      continue;
    }

    if (unit.order.type === "dropRelic") {
      const relic = unit.relicId ? getRelicById(match, unit.relicId) : null;
      if (!relic || relic.carrierId !== unit.id) {
        unit.order = null;
        unit.relicId = null;
        continue;
      }
      const { x: targetX, y: targetY } = unit.order.target || { x: unit.x, y: unit.y };
      const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
      if (distance > 0.2) {
        moveUnitWithPath(match, unit, targetX, targetY, dt);
      } else {
        relic.carrierId = null;
        relic.storedInBuildingId = null;
        relic.x = unit.x;
        relic.y = unit.y;
        unit.relicId = null;
        unit.order = null;
      }
      continue;
    }

    if (unit.order.type === "heal") {
      const target = getUnitById(match, unit.order.targetId);
      if (!target || target.ownerId !== unit.ownerId || target.hp <= 0) {
        unit.order = null;
        unit.isHealing = false;
        continue;
      }
      const distance = Math.hypot(target.x - unit.x, target.y - unit.y);
      if (distance > 2) {
        moveUnitWithPath(match, unit, target.x, target.y, dt);
      }
      continue;
    }

    const def = UNITS[unit.type];
    if (unit.order.type === "attack") {
      const target =
        getUnitById(match, unit.order.targetId) ||
        getBuildingById(match, unit.order.targetId);
      if (!target || !isEnemyPlayer(match, target.ownerId, unit.ownerId)) {
        unit.order = null;
        unit.attackTargetId = null;
        continue;
      }
      if (
        unit.order.manualTarget &&
        !isBuildingEntity(target) &&
        !canPlayerSeeTarget(match, unit.ownerId, target)
      ) {
        unit.order = null;
        unit.attackTargetId = null;
        continue;
      }
      const tx = isBuildingEntity(target)
        ? clamp(unit.x, target.x, target.x + BUILDINGS[target.type].size)
        : target.x;
      const ty = isBuildingEntity(target)
        ? clamp(unit.y, target.y, target.y + BUILDINGS[target.type].size)
        : target.y;
      const distance = getTargetDistance(unit, target);
      const range = getUnitRangeForPlayer(match, unit);
      const minRange = getUnitMinRangeForPlayer(match, unit);
      const holdToAttack = isInRange(unit, target, range, minRange);
      if (!holdToAttack && distance > 0.05) {
        let moveTargetX = tx;
        let moveTargetY = ty;
        if (minRange > 0 && distance < minRange) {
          let awayDx = unit.x - tx;
          let awayDy = unit.y - ty;
          let awayLen = Math.hypot(awayDx, awayDy);
          if (awayLen < 0.001) {
            awayDx = 1;
            awayDy = 0;
            awayLen = 1;
          }
          const safeDistance = minRange + 0.35;
          moveTargetX = clamp(
            tx + (awayDx / awayLen) * safeDistance,
            0,
            MAP.width - 0.05
          );
          moveTargetY = clamp(
            ty + (awayDy / awayLen) * safeDistance,
            0,
            MAP.height - 0.05
          );
        }
        moveUnitWithPath(match, unit, moveTargetX, moveTargetY, dt, {
          ignoreBuildingId: isBuildingEntity(target) ? target.id : null,
          repathTicks: 20,
          unitAvoidanceStrength: 0.18,
          avoidanceScale: 0.85,
        });
      }
      continue;
    }

    const target = unit.order.target;
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      unit.order = null;
      unit.attackTargetId = null;
      continue;
    }
    if (unit.order.type === "attackMove") {
      const range = getUnitRangeForPlayer(match, unit);
      const minRange = getUnitMinRangeForPlayer(match, unit);
      const enemy =
        findNearestEnemyUnit(match, unit, range, minRange) ||
        findNearestEnemyBuilding(match, unit, range, minRange);
      if (enemy) continue;
    }
    const offset = unit.order.formationOffset || { x: 0, y: 0 };
    const targetX = target.x + offset.x;
    const targetY = target.y + offset.y;
    const distance = Math.hypot(targetX - unit.x, targetY - unit.y);

    if (distance < 0.05) {
      unit.x = targetX;
      unit.y = targetY;
      unit.order = null;
      continue;
    }

    const inFormation = !!unit.order.formationId;
    moveUnitWithPath(match, unit, targetX, targetY, dt, {
      speedOverride: unit.order.formationSpeed,
      repathTicks: unit.order.type === "attackMove" ? 20 : 60,
      unitAvoidanceStrength: inFormation
        ? FORMATION_UNIT_AVOIDANCE_STRENGTH
        : 0.2,
      sameFormationAvoidanceFactor: inFormation
        ? FORMATION_SAME_FORMATION_AVOIDANCE_FACTOR
        : 0.12,
      avoidanceScale: inFormation ? FORMATION_AVOIDANCE_SCALE : 0.9,
    });
  }

  if (garrisonArrivals.length) {
    const toRemove = new Set();
    for (const entry of garrisonArrivals) {
      const building = entry.building;
      const unit = entry.unit;
      const capacity = getGarrisonCapacity(building);
      if (capacity <= 0) {
        unit.order = null;
        continue;
      }
      const available = capacity - building.garrison.length;
      if (available <= 0) {
        unit.order = null;
        continue;
      }
      building.garrison.push({ id: unit.id, type: unit.type });
      toRemove.add(unit.id);
    }
    if (toRemove.size) {
      match.units = match.units.filter((u) => !toRemove.has(u.id));
    }
  }
}

function processTrading(match) {
  for (const unit of match.units) {
    if (unit.type !== "Trader" || !unit.trade) continue;
    const trade = unit.trade;
    if (trade.paused) continue;
    if (!trade.homeId || !trade.destId) continue;
    const home = getBuildingById(match, trade.homeId);
    const dest = getBuildingById(match, trade.destId);
    if (!home || !dest) continue;
    if (home.ownerId !== unit.ownerId || dest.ownerId !== null) continue;

    if (!unit.order) {
      startTraderLeg(match, unit, trade.leg === "toHome" ? "toHome" : "toDest");
      continue;
    }
    if (unit.order.type !== "trade") continue;

    const targetBuilding = getBuildingById(match, unit.order.buildingId);
    if (!targetBuilding) {
      unit.order = null;
      continue;
    }
    const def = BUILDINGS[targetBuilding.type];
    const targetX = clamp(unit.x, targetBuilding.x, targetBuilding.x + def.size);
    const targetY = clamp(unit.y, targetBuilding.y, targetBuilding.y + def.size);
    const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
    if (distance > 3.5) continue;

    const player = match.players[unit.ownerId];
    if (player) {
      player.resources.gold = (player.resources.gold || 0) + (trade.nextGold || 0);
    }

    if (trade.leg === "toDest") {
      if (trade.pendingHomeId) {
        trade.homeId = trade.pendingHomeId;
        trade.pendingHomeId = null;
      }
      trade.leg = "toHome";
      startTraderLeg(match, unit, "toHome");
    } else {
      if (trade.pendingDestId) {
        trade.destId = trade.pendingDestId;
        trade.pendingDestId = null;
      }
      trade.leg = "toDest";
      startTraderLeg(match, unit, "toDest");
    }
  }
}

function stopCharge(unit, cooldown = 10) {
  if (!unit?.charge) return;
  unit.charge.active = false;
  unit.charge.time = 0;
  unit.charge.targetId = null;
  if (cooldown > 0) {
    unit.charge.cooldown = Math.max(unit.charge.cooldown || 0, cooldown);
  }
}

function getProjectileTravelSeconds(from, to) {
  const distance = Math.hypot((to?.x ?? 0) - (from?.x ?? 0), (to?.y ?? 0) - (from?.y ?? 0));
  return Math.max(MIN_PROJECTILE_TRAVEL_SEC, distance / PROJECTILE_SPEED_TILES_PER_SEC);
}

function queueSiegeImpact(match, attacker, target, damage, nowSeconds) {
  if (!match || !attacker || !target) return;
  if (!Number.isFinite(damage) || damage <= 0) return;
  const from = { x: attacker.x, y: attacker.y };
  const to = isBuildingEntity(target)
    ? {
        x: target.x + BUILDINGS[target.type].size / 2,
        y: target.y + BUILDINGS[target.type].size / 2,
      }
    : { x: target.x, y: target.y };
  const hitTime = nowSeconds + getProjectileTravelSeconds(from, to);
  match.pendingSiegeImpacts.push({
    hitTime,
    attackerId: attacker.id,
    attackerOwnerId: attacker.ownerId,
    sourceX: from.x,
    sourceY: from.y,
    targetId: target.id,
    targetKind: isBuildingEntity(target) ? "building" : "unit",
    damage,
  });
}

function processPendingSiegeImpacts(match, nowSeconds) {
  const pending = match.pendingSiegeImpacts || [];
  if (!pending.length) return;
  const stillPending = [];
  for (const impact of pending) {
    if ((impact.hitTime ?? 0) > nowSeconds) {
      stillPending.push(impact);
      continue;
    }

    const target =
      impact.targetKind === "building"
        ? getBuildingById(match, impact.targetId)
        : getUnitById(match, impact.targetId);
    if (!target) {
      continue;
    }
    if (!isEnemyPlayer(match, target.ownerId, impact.attackerOwnerId)) {
      continue;
    }

    const attacker =
      getUnitById(match, impact.attackerId) || {
        x: impact.sourceX,
        y: impact.sourceY,
      };
    target.hp -= impact.damage;
    if (!isBuildingEntity(target)) {
      target.lastCombatTime = nowSeconds;
    }
    if (target.ownerId !== undefined && target.ownerId !== null) {
      emitAttackAlert(match, target.ownerId, target, attacker);
    }

    if (!isBuildingEntity(target) && attacker) {
      const targetDef = UNITS[target.type];
      if (targetDef && (targetDef.range || 0.5) <= 0.6) {
        const inRangeUnit = findNearestEnemyUnit(
          match,
          target,
          targetDef.range || 0.5
        );
        if (!inRangeUnit) {
          if (!target.order || target.order.type !== "move") {
            if (target.type !== "Villager" && target.type !== "Monk") {
              target.attackTargetId = attacker.id;
            }
          }
        }
      }
    }
  }
  match.pendingSiegeImpacts = stillPending;
}

function queueBuildingImpact(
  match,
  building,
  profile,
  impactCenter,
  damage,
  nowSeconds,
  canTargetBuildings = false
) {
  if (!match || !building || !profile || !impactCenter) return;
  if (!Number.isFinite(damage) || damage <= 0) return;
  if (!Array.isArray(match.pendingBuildingImpacts)) {
    match.pendingBuildingImpacts = [];
  }
  const from = {
    x: building.x + (BUILDINGS[building.type]?.size || 1) / 2,
    y: building.y + (BUILDINGS[building.type]?.size || 1) / 2,
  };
  const to = { x: impactCenter.x, y: impactCenter.y };
  const hitTime = nowSeconds + getProjectileTravelSeconds(from, to);
  match.pendingBuildingImpacts.push({
    hitTime,
    ownerId: building.ownerId,
    buildingId: building.id,
    sourceX: from.x,
    sourceY: from.y,
    x: to.x,
    y: to.y,
    damage,
    damageType: profile.damageType || "ranged",
    bonus: profile.bonus || [],
    splashRadius: profile.splashRadius || 0,
    splashFalloff: profile.splashFalloff || null,
    canTargetBuildings: !!canTargetBuildings,
  });
}

function processPendingBuildingImpacts(match, nowSeconds) {
  const pending = match.pendingBuildingImpacts || [];
  if (!pending.length) return;
  const stillPending = [];
  for (const impact of pending) {
    if ((impact.hitTime ?? 0) > nowSeconds) {
      stillPending.push(impact);
      continue;
    }

    for (const targetUnit of match.units) {
      if (targetUnit.hp <= 0) continue;
      if (!isEnemyPlayer(match, targetUnit.ownerId, impact.ownerId)) continue;
      const dist = Math.hypot(targetUnit.x - impact.x, targetUnit.y - impact.y);
      const splashScale = getSplashScale(impact, dist);
      if (splashScale <= 0) continue;
      const bonusDamage = getBonusDamage(impact.bonus || [], targetUnit);
      const resistance =
        impact.damageType === "siege" ? 0 : getRangedResistance(targetUnit);
      const appliedDamage =
        (impact.damage + bonusDamage) * splashScale * (1 - resistance);
      if (appliedDamage <= 0) continue;
      targetUnit.hp -= appliedDamage;
      targetUnit.lastCombatTime = nowSeconds;
      if (targetUnit.ownerId !== undefined && targetUnit.ownerId !== null) {
        emitAttackAlert(match, targetUnit.ownerId, targetUnit, {
          x: impact.sourceX,
          y: impact.sourceY,
        });
      }
      const targetDef = UNITS[targetUnit.type];
      if (targetDef && (targetDef.range || 0.5) <= 0.6) {
        const inRangeUnit = findNearestEnemyUnit(
          match,
          targetUnit,
          targetDef.range || 0.5
        );
        if (!inRangeUnit) {
          if (!targetUnit.order || targetUnit.order.type !== "move") {
            if (targetUnit.type !== "Villager" && targetUnit.type !== "Monk") {
              targetUnit.attackTargetId = impact.buildingId;
            }
          }
        }
      }
    }

    if (impact.canTargetBuildings) {
      for (const targetBuilding of match.buildings) {
        if (targetBuilding.hp <= 0) continue;
        const targetDef = BUILDINGS[targetBuilding.type];
        if (!targetDef) continue;
        if (targetDef.isNeutral || targetDef.isInvulnerable) continue;
        if (targetBuilding.ownerId === null) continue;
        if (!isEnemyPlayer(match, targetBuilding.ownerId, impact.ownerId)) continue;
        const dist = getDistanceToBuildingBounds(
          impact.x,
          impact.y,
          targetBuilding
        );
        const splashScale = getSplashScale(impact, dist);
        if (splashScale <= 0) continue;
        const bonusDamage = getBonusDamage(impact.bonus || [], targetBuilding);
        const appliedDamage = (impact.damage + bonusDamage) * splashScale;
        if (appliedDamage <= 0) continue;
        targetBuilding.hp -= appliedDamage;
        if (
          targetBuilding.ownerId !== undefined &&
          targetBuilding.ownerId !== null
        ) {
          emitAttackAlert(match, targetBuilding.ownerId, targetBuilding, {
            x: impact.sourceX,
            y: impact.sourceY,
          });
        }
      }
    }
  }
  match.pendingBuildingImpacts = stillPending;
}

function processCombat(match, dt) {
  const nowSeconds = match.tick / TICK_RATE;
  processPendingSiegeImpacts(match, nowSeconds);
  processPendingBuildingImpacts(match, nowSeconds);
  for (const unit of match.units) {
    if (unit.hp <= 0) continue;
    const def = UNITS[unit.type];
    if (!def) continue;
    if (unit.type === "Trader" || (def.damage ?? 0) <= 0) continue;
    unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
    if (!unit.charge) {
      unit.charge = { active: false, time: 0, cooldown: 0, targetId: null };
    }
    if (unit.charge?.cooldown) {
      unit.charge.cooldown = Math.max(0, unit.charge.cooldown - dt);
    }
    if (unit.charge?.active) {
      unit.charge.time = (unit.charge.time || 0) + dt;
      if (unit.charge.time >= 10) {
        stopCharge(unit, 10);
      }
    }
    const unitRange = getUnitRangeForPlayer(match, unit);
    const unitMinRange = getUnitMinRangeForPlayer(match, unit);
    const isMelee = unitRange <= 0.6;
    if (unit.order && unit.order.type === "move") {
      if (unit.charge?.active) {
        stopCharge(unit, 10);
      }
      unit.attackTargetId = null;
      continue;
    }
    if (
      unit.type === "Villager" &&
      (!unit.order ||
        (unit.order.type !== "attack" && unit.order.type !== "attackMove"))
    ) {
      unit.attackTargetId = null;
      continue;
    }

    if (unit.order && unit.order.type === "attackMove" && unit.order.formationId) {
      const nearbyEnemy =
        findNearestEnemyUnit(match, unit, 5) ||
        findNearestEnemyBuilding(match, unit, 5);
      if (nearbyEnemy) {
        breakFormation(match, unit.order.formationId);
      }
    }

    let target = null;
    if (unit.attackTargetId) {
      target = getUnitById(match, unit.attackTargetId);
      if (!target) {
        target = getBuildingById(match, unit.attackTargetId);
      }
    }
    if (!target || !isEnemyPlayer(match, target.ownerId, unit.ownerId)) {
      target = null;
      unit.attackTargetId = null;
    }
    if (target && isBuildingEntity(target)) {
      const tDef = BUILDINGS[target.type];
      if (
        tDef?.isNeutral ||
        tDef?.isInvulnerable ||
        target.ownerId === null ||
        target.hp <= 0 ||
        isUntargetableDestroyedLandmark(target)
      ) {
        target = null;
        unit.attackTargetId = null;
      }
    }

    if (unit.type === "Knight" && unit.charge?.active) {
      if (!target || unit.charge.targetId !== target.id) {
        stopCharge(unit, 10);
      }
    }

    if (target && isBuildingEntity(target)) {
      if (!unit.order?.manualTarget) {
        const preferredUnit = findNearestEnemyUnit(
          match,
          unit,
          unitRange,
          unitMinRange
        );
        if (preferredUnit) {
          target = preferredUnit;
          unit.attackTargetId = preferredUnit.id;
        }
      }
    }

    if (!target && unit.order && unit.order.type === "attackMove") {
      target =
        findNearestEnemyUnit(match, unit, unitRange, unitMinRange) ||
        findNearestEnemyBuilding(match, unit, unitRange, unitMinRange);
      if (target) unit.attackTargetId = target.id;
    }

    if (!target && !isMelee) {
      target =
        findNearestEnemyUnit(match, unit, unitRange, unitMinRange) ||
        findNearestEnemyBuilding(match, unit, unitRange, unitMinRange);
      if (target) unit.attackTargetId = target.id;
    }

    if (!target && isMelee) {
      target =
        findNearestEnemyUnit(match, unit, 5) ||
        findNearestEnemyBuilding(match, unit, 5);
      if (target) unit.attackTargetId = target.id;
    }

    if (
      unit.order?.manualTarget &&
      target &&
      !isBuildingEntity(target) &&
      !canPlayerSeeTarget(match, unit.ownerId, target)
    ) {
      unit.order = null;
      unit.attackTargetId = null;
      if (unit.charge?.active) {
        stopCharge(unit, 10);
      }
      continue;
    }

    if (!target) continue;
    if (
      unit.type === "Knight" &&
      unit.charge &&
      !unit.charge.active &&
      unit.charge.cooldown <= 0
    ) {
      const distance = getTargetDistance(unit, target);
      if (distance >= 2) {
        unit.charge.active = true;
        unit.charge.time = 0;
        unit.charge.targetId = target.id;
      }
    }
    const isRanged = unitRange > 0.5;
    const inRange = isInRange(unit, target, unitRange, unitMinRange);
    let facingDiff = 0;
    if (isRanged) {
      facingDiff = faceTarget(unit, target, dt);
      if (inRange && facingDiff > FIRE_FACING_THRESHOLD_RAD) {
        continue;
      }
    }
    if (!inRange) {
      if (isMelee) {
        unit.order = unit.order?.manualTarget
          ? { type: "attack", targetId: target.id, manualTarget: true }
          : { type: "attack", targetId: target.id };
      }
      continue;
    }
    if (unit.attackCooldown > 0) continue;

    const player = match.players[unit.ownerId];
    const stats = player ? getUnitEffectiveStats(player, unit.type) : null;
    const baseDamage = stats?.damage ?? def.damage;
    const bonusList = stats?.bonus ?? def.bonus ?? [];
    const bonus = getBonusDamage(bonusList, target);
    const chargeBonus =
      unit.type === "Knight" && unit.charge?.active
        ? stats?.chargeDamage ?? def.chargeDamage ?? 0
        : 0;
    const techBonus = getUnitDamageBonus(match, unit, isRanged);
    const isSiege = def.type.includes("Siege");
    const armor = isSiege ? 0 : getArmor(match, target, isRanged);
    const damageMultiplier = getUnitDamageMultiplierForPlayer(match, unit);
    const rawDamage = (baseDamage + bonus + chargeBonus + techBonus) * damageMultiplier;
    const baseHit = Math.max(1, rawDamage - armor);
    const resistance =
      isRanged && !isSiege && !isBuildingEntity(target)
        ? getRangedResistance(target)
        : 0;
    const damage = baseHit * (1 - resistance);
    unit.lastCombatTime = nowSeconds;
    const isSiegeWeapon = def.type.includes("Siege");
    if (isRanged && isSiegeWeapon) {
      queueSiegeImpact(match, unit, target, damage, nowSeconds);
    } else {
      target.hp -= damage;
      if (!isBuildingEntity(target)) {
        target.lastCombatTime = nowSeconds;
      }
      if (isEnemyPlayer(match, target.ownerId, unit.ownerId)) {
        emitAttackAlert(match, target.ownerId, target, unit);
      }
    }
    unit.attackCooldown = def.attackCooldown || 1;
    if (unit.type === "Knight" && unit.charge?.active) {
      stopCharge(unit, 10);
    }
    if (isRanged && !isSiegeWeapon) {
      if (target && !isBuildingEntity(target)) {
        const targetDef = UNITS[target.type];
        if (targetDef && (targetDef.range || 0.5) <= 0.6) {
          const inRangeUnit = findNearestEnemyUnit(
            match,
            target,
            targetDef.range || 0.5
          );
          if (!inRangeUnit) {
            if (!target.order || target.order.type !== "move") {
              if (target.type !== "Villager" && target.type !== "Monk") {
                target.attackTargetId = unit.id;
              }
            }
          }
        }
      }
    }
    if (isRanged) {
      match.pendingAttacks.push({
        from: { x: unit.x, y: unit.y },
        to: {
          x: isBuildingEntity(target)
            ? target.x + BUILDINGS[target.type].size / 2
            : target.x,
          y: isBuildingEntity(target)
            ? target.y + BUILDINGS[target.type].size / 2
            : target.y,
        },
        type:
          unit.type === "CounterweightTrebuchet"
            ? "boulder"
            : unit.type === "Cannon"
            ? "cannonball"
            : "arrow",
      });
    }
  }

  for (const building of match.buildings) {
    if (building.hp <= 0) continue;
    const def = BUILDINGS[building.type];
    if (!def) continue;
    if (def.isNeutral || def.isInvulnerable || building.ownerId === null) continue;
    if (isDestroyedLandmark(building)) continue;
    if (building.isUnderConstruction && isDefensiveBuildingType(building.type)) continue;
    const attackProfiles = getBuildingAttackProfiles(building, def);
    if (!attackProfiles.length) continue;
    const cooldowns = building.attackCooldowns || (building.attackCooldowns = {});
    let forcedTarget = null;
    if (building.attackTargetId !== null && building.attackTargetId !== undefined) {
      forcedTarget =
        getUnitById(match, building.attackTargetId) ||
        getBuildingById(match, building.attackTargetId);
      if (
        !forcedTarget ||
        forcedTarget.hp <= 0 ||
        !isEnemyPlayer(match, forcedTarget.ownerId, building.ownerId)
      ) {
        forcedTarget = null;
        building.attackTargetId = null;
      } else if (isBuildingEntity(forcedTarget)) {
        const forcedDef = BUILDINGS[forcedTarget.type];
        if (
          !forcedDef ||
          forcedDef.isNeutral ||
          forcedDef.isInvulnerable ||
          forcedTarget.ownerId === null
        ) {
          forcedTarget = null;
          building.attackTargetId = null;
        }
      }
      if (
        forcedTarget &&
        !canPlayerSeeTarget(match, building.ownerId, forcedTarget)
      ) {
        forcedTarget = null;
        building.attackTargetId = null;
      }
    }
    for (const attackProfile of attackProfiles) {
      if (attackProfile.range <= 0) continue;
      const minRange = Math.max(0, Number(attackProfile.minRange || 0));
      const key = attackProfile.id || "base";
      cooldowns[key] = Math.max(0, (cooldowns[key] || 0) - dt);
      if (cooldowns[key] > 0) continue;

      const observer = {
        x: building.x + def.size / 2,
        y: building.y + def.size / 2,
      };
      const autoCanTargetBuildings = Array.isArray(attackProfile.bonus)
        ? attackProfile.bonus.some((b) => b.target === "Building")
        : false;
      const canTargetBuildings =
        autoCanTargetBuildings ||
        !!(forcedTarget && isBuildingEntity(forcedTarget));
      let target = null;
      let bestDist = Infinity;
      if (forcedTarget) {
        const forceVisibleOk =
          !attackProfile.requiresVisible ||
          canPlayerSeeTarget(match, building.ownerId, forcedTarget);
        const d = getTargetDistance(observer, forcedTarget);
        if (forceVisibleOk && d <= attackProfile.range && d >= minRange) {
          bestDist = d;
          target = forcedTarget;
        }
      }
      if (!target) {
        for (const unit of match.units) {
          if (!isEnemyPlayer(match, unit.ownerId, building.ownerId)) continue;
          if (
            attackProfile.requiresVisible &&
            !canPlayerSeeTarget(match, building.ownerId, unit)
          ) {
            continue;
          }
          const d = getTargetDistance(observer, unit);
          if (d <= attackProfile.range && d >= minRange && d < bestDist) {
            bestDist = d;
            target = unit;
          }
        }
      }
      if (!target && autoCanTargetBuildings) {
        for (const otherBuilding of match.buildings) {
          if ((otherBuilding.hp ?? 0) <= 0) continue;
          const otherDef = BUILDINGS[otherBuilding.type];
          if (!otherDef) continue;
          if (otherDef.isNeutral || otherDef.isInvulnerable) continue;
          if (otherBuilding.ownerId === null) continue;
          if (!isEnemyPlayer(match, otherBuilding.ownerId, building.ownerId)) continue;
          if (
            attackProfile.requiresVisible &&
            !canPlayerSeeTarget(match, building.ownerId, otherBuilding)
          ) {
            continue;
          }
          const d = getTargetDistance(observer, otherBuilding);
          if (d <= attackProfile.range && d >= minRange && d < bestDist) {
            bestDist = d;
            target = otherBuilding;
          }
        }
      }
      if (!target) continue;

      let volley = attackProfile.volley || 0;
      const garrison = building.garrison.length;
      let extra = 0;
      if (attackProfile.useGarrison) {
        if (building.type === "TownCenter") {
          extra = garrison;
        } else if (building.type === "Outpost") {
          extra = garrison;
        } else if (building.type === "StoneTower") {
          extra = garrison;
        } else if (building.type === "Castle") {
          extra = garrison;
        }
      }
      if (volley === 0 && attackProfile.baseDamage > 0) {
        volley = 1;
      }
      const totalShots = volley + extra;
      if (totalShots <= 0) continue;
      const extraDamage =
        building.type === "TownCenter"
          ? 6
          : building.type === "Outpost"
          ? 6
          : building.type === "StoneTower"
          ? 9
          : building.type === "Castle"
          ? 10
          : 0;
      const buildingOwner = match.players[building.ownerId];
      let rangedTechBonus = 0;
      if (attackProfile.damageType !== "siege") {
        if (buildingOwner?.techs?.LightweightShafts) rangedTechBonus += 1;
        if (buildingOwner?.techs?.PiercingPoints) rangedTechBonus += 1;
        if (buildingOwner?.techs?.Aerodynamic) rangedTechBonus += 1;
        if (buildingOwner?.techs?.BodkinBolts) rangedTechBonus += 1;
      }
      const shotDamage = attackProfile.baseDamage + rangedTechBonus;
      if (attackProfile.splashRadius > 0) {
        const impactCenter = getEntityCenter(target);
        if (!impactCenter) continue;
        for (let i = 0; i < totalShots; i++) {
          let baseShotDamage = 0;
          if (i < volley) {
            baseShotDamage = shotDamage;
          } else {
            baseShotDamage = extraDamage + rangedTechBonus;
          }
          queueBuildingImpact(
            match,
            building,
            attackProfile,
            impactCenter,
            baseShotDamage,
            nowSeconds,
            canTargetBuildings
          );
          match.pendingAttacks.push({
            from: observer,
            to: { x: impactCenter.x, y: impactCenter.y },
            type: attackProfile.projectile || "arrow",
          });
        }
        cooldowns[key] = attackProfile.cooldown || 1;
        continue;
      }

      const resistance =
        !isBuildingEntity(target) && attackProfile.damageType !== "siege"
          ? getRangedResistance(target)
          : 0;
      for (let i = 0; i < totalShots; i++) {
        if (target.hp <= 0) break;
        let appliedDamage = 0;
        if (i < volley) {
          appliedDamage = shotDamage;
        } else {
          appliedDamage = extraDamage + rangedTechBonus;
        }
        appliedDamage += getBonusDamage(attackProfile.bonus || [], target);
        target.hp -= appliedDamage * (1 - resistance);
        if (!isBuildingEntity(target)) {
          target.lastCombatTime = nowSeconds;
        }
        if (isEnemyPlayer(match, target.ownerId, building.ownerId)) {
          emitAttackAlert(match, target.ownerId, target, building);
        }
        const targetCenter = getEntityCenter(target);
        match.pendingAttacks.push({
          from: observer,
          to: targetCenter || { x: target.x, y: target.y },
          type: attackProfile.projectile || "arrow",
        });
      }
      if (target && UNITS[target.type]) {
        const targetDef = UNITS[target.type];
        if ((targetDef.range || 0.5) <= 0.6) {
          const inRangeUnit = findNearestEnemyUnit(
            match,
            target,
            targetDef.range || 0.5
          );
          if (!inRangeUnit) {
            if (target.type !== "Villager" && target.type !== "Monk") {
              target.attackTargetId = building.id;
            }
          }
        }
      }
      cooldowns[key] = attackProfile.cooldown || 1;
    }
  }

  const deadUnits = match.units.filter((unit) => unit.hp <= 0);
  if (deadUnits.length && match.relics?.length) {
    for (const dead of deadUnits) {
      if (!dead.relicId) continue;
      const relic = getRelicById(match, dead.relicId);
      if (!relic) continue;
      relic.carrierId = null;
      relic.storedInBuildingId = null;
      relic.x = dead.x;
      relic.y = dead.y;
    }
  }
  match.units = match.units.filter((unit) => unit.hp > 0);
  const deadBuildings = match.buildings.filter(
    (building) =>
      building.hp <= 0 &&
      !(isLandmarkBuildingType(building.type) && building.landmarkDestroyed)
  );
  if (deadBuildings.length && match.relics?.length) {
    for (const dead of deadBuildings) {
      const relicIds = dead.relicIds || [];
      for (const relicId of relicIds) {
        const relic = getRelicById(match, relicId);
        if (!relic) continue;
        relic.storedInBuildingId = null;
        relic.carrierId = null;
        relic.x = dead.x + (BUILDINGS[dead.type]?.size || 1) / 2;
        relic.y = dead.y + (BUILDINGS[dead.type]?.size || 1) / 2;
      }
      dead.relicIds = [];
    }
  }
  for (const dead of deadBuildings) {
    if (!isLandmarkBuildingType(dead.type)) continue;
    dead.landmarkDestroyed = true;
    dead.hp = 0;
    dead.attackTargetId = null;
    dead.rallyPoint = null;
    dead.productionQueue = [];
    dead.techs = dead.techs || {};

    const owner = match.players?.[dead.ownerId];
    if (owner?.id) {
      io.to(owner.id).emit("landmarkDestroyed", {
        buildingId: dead.id,
        buildingType: dead.type,
        x: dead.x + (BUILDINGS[dead.type]?.size || 1) / 2,
        y: dead.y + (BUILDINGS[dead.type]?.size || 1) / 2,
      });
    }

    if (dead.garrison?.length) {
      ungarrisonUnits(match, dead, dead.garrison.length);
    }

    for (const unit of match.units) {
      if (!unit.order) continue;
      if (unit.order.type === "garrison" && unit.order.buildingId === dead.id) {
        unit.order = null;
        continue;
      }
      if (unit.order.type === "farm" && unit.order.buildingId === dead.id) {
        unit.order = null;
        continue;
      }
      if (
        unit.order.type === "return" &&
        (unit.order.buildingId === dead.id || unit.order.returnFarmId === dead.id)
      ) {
        unit.order = null;
      }
    }
  }
  match.buildings = match.buildings.filter((building) => {
    if (building.hp > 0) return true;
    return isLandmarkBuildingType(building.type);
  });
}

function processHealing(match, dt) {
  const nowSeconds = match.tick / TICK_RATE;
  for (const unit of match.units) {
    if (unit.type === "Monk") {
      unit.isHealing = false;
    }
  }

  for (const monk of match.units) {
    if (monk.type !== "Monk") continue;
    if (monk.hp <= 0) continue;
    if (monk.relicId) {
      monk.isHealing = false;
      continue;
    }

    if (monk.order && monk.order.type !== "heal") {
      continue;
    }

    let target = monk.order?.targetId ? getUnitById(match, monk.order.targetId) : null;
    const manualHeal = !!monk.order?.manual;
    const validTarget =
      target &&
      target.ownerId === monk.ownerId &&
      target.hp > 0 &&
      target.id !== monk.id &&
      !isSiegeUnit(target);
    if (!validTarget) {
      target = null;
      monk.order = null;
    }

    if (!target) {
      const autoTarget = findNearestDamagedFriendlyUnit(match, monk, 5);
      if (!autoTarget) continue;
      target = autoTarget;
      monk.order = { type: "heal", targetId: target.id, auto: true };
    }

    const targetMaxHp = getUnitMaxHp(target);
    if (target.hp >= targetMaxHp) {
      if (!manualHeal) {
        monk.order = null;
      }
      continue;
    }

    const distance = Math.hypot(target.x - monk.x, target.y - monk.y);
    if (distance > 2) continue;

    const inCombatRecently = nowSeconds - (target.lastCombatTime ?? -Infinity) <= 5;
    const healRate = inCombatRecently ? 5 : 10;
    target.hp = Math.min(targetMaxHp, target.hp + healRate * dt);
    monk.isHealing = true;
  }

  for (const unit of match.units) {
    if (unit.hp <= 0) continue;
    const ownerId = unit.ownerId;
    const maxHp = getUnitMaxHp(unit);
    if (unit.hp >= maxHp) continue;

    let sanctumHealRate = 0;
    let basilicaHealRate = 0;
    for (const building of match.buildings) {
      if (building.ownerId !== ownerId || building.isUnderConstruction) continue;
      if (isDestroyedLandmark(building)) continue;
      if (
        building.type !== "SanctumOfTheVeil" &&
        building.type !== "BasilicaOfEternalLight"
      ) {
        continue;
      }
      const center = getBuildingCenter(building);
      const distance = Math.hypot(center.x - unit.x, center.y - unit.y);
      const ageTier = getLandmarkAgeTierForBuilding(match, building) || 1;
      if (building.type === "SanctumOfTheVeil") {
        const auraRange =
          LANDMARK_BONUSES?.SanctumOfTheVeil?.auraRange || 6;
        if (distance > auraRange) continue;
        const outOfCombat = nowSeconds - (unit.lastCombatTime ?? -Infinity) > 5;
        if (!outOfCombat) continue;
        const rate =
          LANDMARK_BONUSES?.SanctumOfTheVeil?.auraHealByAge?.[
            getLandmarkBonusIndexFromAge(ageTier)
          ] || 0;
        if (rate > sanctumHealRate) sanctumHealRate = rate;
      } else if (building.type === "BasilicaOfEternalLight") {
        const auraRange = LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraRange || 15;
        if (distance > auraRange) continue;
        const rate =
          LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraHealByAge?.[
            getLandmarkBonusIndexFromAge(ageTier)
          ] || 0;
        if (rate > basilicaHealRate) basilicaHealRate = rate;
      }
    }
    const totalRate = sanctumHealRate + basilicaHealRate;
    if (totalRate > 0) {
      unit.hp = Math.min(maxHp, unit.hp + totalRate * dt);
    }
  }
}

function processMonasteryRelics(match, dt) {
  for (const building of match.buildings) {
    if (
      building.type !== "Monastery" &&
      building.type !== "SanctumOfTheVeil" &&
      building.type !== "EvermistGardens"
    ) {
      continue;
    }
    if (building.isUnderConstruction) continue;
    if (isDestroyedLandmark(building)) continue;
    const relicCount = (building.relicIds || []).length;
    if (relicCount <= 0) {
      building.relicGoldTimer = 0;
      continue;
    }
    building.relicGoldTimer = (building.relicGoldTimer || 0) + dt;
    if (building.relicGoldTimer < 3) continue;
    const ticks = Math.floor(building.relicGoldTimer / 3);
    building.relicGoldTimer -= ticks * 3;
    const owner = match.players[building.ownerId];
    if (!owner) continue;
    if (building.type === "EvermistGardens") {
      const ageTier = getLandmarkAgeTierForBuilding(match, building) || 1;
      const incomeByAge =
        LANDMARK_BONUSES?.EvermistGardens?.incomePerMinuteByAge || [];
      const perMinute = incomeByAge[getLandmarkBonusIndexFromAge(ageTier)] || {};
      const tickFactor = ticks * relicCount * (3 / 60);
      owner.resources.gold =
        (owner.resources.gold || 0) + (perMinute.gold || 0) * tickFactor;
      owner.resources.wood =
        (owner.resources.wood || 0) + (perMinute.wood || 0) * tickFactor;
      owner.resources.food =
        (owner.resources.food || 0) + (perMinute.food || 0) * tickFactor;
      owner.resources.stone =
        (owner.resources.stone || 0) + (perMinute.stone || 0) * tickFactor;
    } else {
      owner.resources.gold = (owner.resources.gold || 0) + ticks * relicCount * 4;
    }
  }
}

function applySpawnedUnitModifiers(match, building, unit) {
  if (!match || !building || !unit) return;
  if (
    building.type === "ArgentThroneComplex" &&
    UNITS[unit.type]?.type?.includes("Infantry")
  ) {
    const ageTier = getLandmarkAgeTierForBuilding(match, building) || 1;
    const bonus =
      LANDMARK_BONUSES?.ArgentThroneComplex?.infantryHealthBonusByAge?.[
        getLandmarkBonusIndexFromAge(ageTier)
      ] || 0;
    if (bonus > 0) {
      const mult = 1 + bonus;
      unit.bonusHpMultiplier = (unit.bonusHpMultiplier || 1) * mult;
      unit.maxHp *= mult;
      unit.hp *= mult;
    }
  }
}

function spawnUnitNearBuilding(match, building, unitType) {
  const def = BUILDINGS[building.type];
  const sideOffsets = {
    right: { x: def.size + 0.6, y: def.size / 2 },
    left: { x: -0.6, y: def.size / 2 },
    bottom: { x: def.size / 2, y: def.size + 0.6 },
    top: { x: def.size / 2, y: -0.6 },
  };
  const defaultOrder = ["right", "left", "bottom", "top"];
  let sideOrder = defaultOrder.slice();
  if (
    building.rallyPoint &&
    typeof building.rallyPoint.x === "number" &&
    typeof building.rallyPoint.y === "number"
  ) {
    const centerX = building.x + def.size / 2;
    const centerY = building.y + def.size / 2;
    const dx = building.rallyPoint.x - centerX;
    const dy = building.rallyPoint.y - centerY;
    let primarySide = "right";
    if (Math.abs(dx) >= Math.abs(dy)) {
      primarySide = dx >= 0 ? "right" : "left";
      sideOrder = [
        primarySide,
        dy >= 0 ? "bottom" : "top",
        dy >= 0 ? "top" : "bottom",
        primarySide === "right" ? "left" : "right",
      ];
    } else {
      primarySide = dy >= 0 ? "bottom" : "top";
      sideOrder = [
        primarySide,
        dx >= 0 ? "right" : "left",
        dx >= 0 ? "left" : "right",
        primarySide === "bottom" ? "top" : "bottom",
      ];
    }
  }
  const offsets = sideOrder.map((side) => sideOffsets[side]);

  for (const offset of offsets) {
    const x = building.x + offset.x;
    const y = building.y + offset.y;
    if (x < 0 || y < 0 || x > MAP.width - 0.2 || y > MAP.height - 0.2) {
      continue;
    }
    const unit = createUnit(building.ownerId, unitType, x, y, null, match);
    applySpawnedUnitModifiers(match, building, unit);
    if (unit.type === "Trader") {
      if (!unit.trade) {
        unit.trade = {
          homeId: null,
          destId: null,
          pendingHomeId: null,
          pendingDestId: null,
          leg: null,
          nextGold: 0,
          paused: false,
        };
      }
      if (building.type === "Market") {
        unit.trade.homeId = building.id;
      }
      if (building.rallyPoint) {
        const targetBuilding = findBuildingAtPoint(
          match,
          building.rallyPoint.x,
          building.rallyPoint.y
        );
        if (targetBuilding && targetBuilding.type === "TradePost") {
          unit.trade.destId = targetBuilding.id;
        }
      }
      if (unit.trade.homeId && unit.trade.destId) {
        startTraderLeg(match, unit, "toDest");
      }
    }
    match.units.push(unit);
    return unit;
  }

  const unit = createUnit(
    building.ownerId,
    unitType,
    clamp(building.x + offsets[0].x, 0, MAP.width - 0.2),
    clamp(building.y + offsets[0].y, 0, MAP.height - 0.2),
    null,
    match
  );
  applySpawnedUnitModifiers(match, building, unit);
  if (unit.type === "Trader") {
    if (!unit.trade) {
      unit.trade = {
        homeId: null,
        destId: null,
        pendingHomeId: null,
        pendingDestId: null,
        leg: null,
        nextGold: 0,
        paused: false,
      };
    }
    if (building.type === "Market") {
      unit.trade.homeId = building.id;
    }
    if (building.rallyPoint) {
      const targetBuilding = findBuildingAtPoint(
        match,
        building.rallyPoint.x,
        building.rallyPoint.y
      );
      if (targetBuilding && targetBuilding.type === "TradePost") {
        unit.trade.destId = targetBuilding.id;
      }
    }
    if (unit.trade.homeId && unit.trade.destId) {
      startTraderLeg(match, unit, "toDest");
    }
  }
  match.units.push(unit);
  return unit;
}

function ungarrisonUnits(match, building, count) {
  const toRelease = building.garrison.splice(0, count);
  for (const entry of toRelease) {
    const unit = spawnUnitNearBuilding(match, building, entry.type);
    if (unit && building.rallyPoint) {
      if (
        unit.type === "Villager" &&
        building.rallyPoint.resourceId
      ) {
        unit.order = {
          type: "gather",
          resourceId: building.rallyPoint.resourceId,
        };
      } else {
        unit.order = { type: "move", target: building.rallyPoint };
      }
    }
  }
}

function processProduction(match, dt) {
  for (const building of match.buildings) {
    if (isDestroyedLandmark(building)) continue;
    if (!building.productionQueue.length) continue;
    const current = building.productionQueue[0];
    current.remaining -= dt;
    if (current.remaining <= 0) {
      if (current.techId) {
        const tech = TECHNOLOGIES[current.techId];
        const player = match.players[building.ownerId];
        if (tech && player) {
          const upgradeUnit = tech.upgradeUnit;
          const oldStats = upgradeUnit
            ? getUnitEffectiveStats(player, upgradeUnit)
            : null;
          if (tech.scope === "building") {
            building.techs[current.techId] = true;
          } else {
            player.techs[current.techId] = true;
          }
          if (upgradeUnit && tech.scope !== "building") {
            const newStats = getUnitEffectiveStats(player, upgradeUnit);
            if (oldStats && newStats) {
              applyUnitUpgrade(
                match,
                player.index,
                upgradeUnit,
                oldStats.health,
                newStats.health
              );
            }
          }
          if (typeof tech.ageTier === "number") {
            applyAgeAdvancement(match, player, tech.ageTier);
          }
          if (current.techId === "GreaterRations") {
            applyGlobalUnitHealthRecalculation(match, player.index);
          }
          if (current.techId === "BedrockFoundations") {
            applyBedrockFoundationsToExistingBuildings(match, player.index);
          }
          if (current.techId === "RapidFabrications") {
            applyRapidFabricationsToExisting(match, player.index);
          }
          if (player.id) {
            io.to(player.id).emit("researchComplete", {
              techId: current.techId,
              name: tech.name,
              isAge: typeof tech.ageTier === "number",
              ageTier: typeof tech.ageTier === "number" ? tech.ageTier : undefined,
              age: typeof tech.ageTier === "number" ? player.age : undefined,
              buildingId: tech.scope === "building" ? building.id : null,
              scope: tech.scope || "player",
            });
          }
        }
      } else if (current.unitType) {
        const unitType = current.unitType;
        if (
          !canCompleteUnitByPopulation(
            match,
            building.ownerId,
            unitType,
            building.id
          )
        ) {
          current.remaining = 0;
          continue;
        }
        const unit = spawnUnitNearBuilding(match, building, unitType);
        const owner = match.players[building.ownerId];
        if (unit && owner?.id) {
          io.to(owner.id).emit("unitComplete", { unitType });
        }
        if (unit && building.rallyPoint) {
          if (
            unit.type === "Trader" &&
            building.rallyPoint
          ) {
            const targetBuilding = findBuildingAtPoint(
              match,
              building.rallyPoint.x,
              building.rallyPoint.y
            );
            if (targetBuilding && targetBuilding.type === "TradePost") {
              if (!unit.trade) {
                unit.trade = {
                  homeId: null,
                  destId: null,
                  pendingHomeId: null,
                  pendingDestId: null,
                  leg: null,
                  nextGold: 0,
                  paused: false,
                };
              }
              if (building.type === "Market") {
                unit.trade.homeId = building.id;
              }
              unit.trade.destId = targetBuilding.id;
              if (unit.trade.homeId && unit.trade.destId) {
                startTraderLeg(match, unit, "toDest");
                building.productionQueue.shift();
                continue;
              }
            }
          }
          if (
            unit.type === "Villager" &&
            building.rallyPoint.resourceId
          ) {
            unit.order = {
              type: "gather",
              resourceId: building.rallyPoint.resourceId,
            };
          } else {
            unit.order = { type: "move", target: building.rallyPoint };
          }
        }
      }
      building.productionQueue.shift();
    }
  }
}

function processGathering(match, dt) {
  for (const building of match.buildings) {
    if (building.type !== "Farm") continue;
    if (!building.farmerId) continue;
    const farmer = getUnitById(match, building.farmerId);
    if (
      !farmer ||
      !farmer.order ||
      (farmer.order.type !== "farm" && farmer.order.type !== "return") ||
      (farmer.order.type === "return" &&
        farmer.order.returnFarmId !== building.id)
    ) {
      building.farmerId = null;
    }
  }

  for (const unit of match.units) {
    if (unit.order && unit.order.type === "farm") {
      if (unit.type !== "Villager") {
        unit.order = null;
        continue;
      }
      const building = getBuildingById(match, unit.order.buildingId);
      if (!building || building.type !== "Farm") {
        unit.order = null;
        continue;
      }
      if (building.isUnderConstruction) continue;
      if (building.farmerId && building.farmerId !== unit.id) {
        unit.order = null;
        continue;
      }
      building.farmerId = unit.id;

      const targetX = clamp(unit.x, building.x, building.x + BUILDINGS.Farm.size);
      const targetY = clamp(unit.y, building.y, building.y + BUILDINGS.Farm.size);
      const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
      if (distance > 0.75) {
        continue;
      }

      const capacity = getCarryCapacity(match, unit.ownerId);
      if (unit.carry.kind && unit.carry.kind !== "food") {
        const dropoff = findDropoffBuilding(
          match,
          unit.ownerId,
          unit.carry.kind,
          unit.x,
          unit.y
        );
        if (dropoff) {
          unit.order = {
            type: "return",
            buildingId: dropoff.id,
            returnFarmId: building.id,
          };
        } else {
          unit.order = null;
        }
        continue;
      }

      const availableCarry = capacity - (unit.carry.amount || 0);
      if (availableCarry <= 0) {
        const dropoff = findDropoffBuilding(
          match,
          unit.ownerId,
          "food",
          unit.x,
          unit.y
        );
        if (dropoff) {
          unit.order = {
            type: "return",
            buildingId: dropoff.id,
            returnFarmId: building.id,
          };
        }
        continue;
      }

      const gatherRate = getGatherRate(match, unit, "food");
      const amount = Math.min(gatherRate * dt, availableCarry);
      unit.carry.kind = "food";
      unit.carry.amount = (unit.carry.amount || 0) + amount;
      if (unit.carry.amount >= capacity) {
        const dropoff = findDropoffBuilding(
          match,
          unit.ownerId,
          "food",
          unit.x,
          unit.y
        );
        if (dropoff) {
          unit.order = {
            type: "return",
            buildingId: dropoff.id,
            returnFarmId: building.id,
          };
        }
      }
      continue;
    }

    if (!unit.order || unit.order.type !== "gather") continue;
    if (unit.type !== "Villager") {
      unit.order = null;
      continue;
    }
    const node = match.resources.find((r) => r.id === unit.order.resourceId);
    if (!node) {
      unit.order = null;
      continue;
    }
    const targetX = clamp(
      unit.x,
      node.x,
      node.x + node.size
    );
    const targetY = clamp(
      unit.y,
      node.y,
      node.y + node.size
    );
    const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
    if (distance > 0.75) {
      if (distance <= 5) {
        if (unit.gatherTargetId !== node.id) {
          unit.gatherTargetId = node.id;
          unit.gatherStuckTime = 0;
          unit.gatherLastDistance = distance;
        } else {
          const lastDistance = unit.gatherLastDistance ?? distance;
          if (distance < lastDistance - 0.05) {
            unit.gatherStuckTime = 0;
          } else {
            unit.gatherStuckTime = (unit.gatherStuckTime || 0) + dt;
          }
          unit.gatherLastDistance = distance;
          if (unit.gatherStuckTime >= 10) {
            const replacement = findNearestResource(
              match,
              unit,
              [node.kind],
              5
            );
            if (replacement && replacement.id !== node.id) {
              unit.order = { type: "gather", resourceId: replacement.id };
            }
            unit.gatherStuckTime = 0;
            unit.gatherLastDistance = null;
            unit.gatherTargetId = replacement ? replacement.id : node.id;
          }
        }
      } else {
        unit.gatherStuckTime = 0;
        unit.gatherLastDistance = null;
        unit.gatherTargetId = node.id;
      }
      continue;
    }
    unit.gatherStuckTime = 0;
    unit.gatherLastDistance = null;
    unit.gatherTargetId = node.id;

    const capacity = getCarryCapacity(match, unit.ownerId);
    if (unit.carry.kind && unit.carry.kind !== node.kind) {
      const dropoff = findDropoffBuilding(
        match,
        unit.ownerId,
        unit.carry.kind,
        unit.x,
        unit.y
      );
      if (dropoff) {
        unit.order = {
          type: "return",
          buildingId: dropoff.id,
          returnResourceId: unit.order.resourceId,
        };
      } else {
        unit.order = null;
      }
      continue;
    }

    const gatherRate = getGatherRate(match, unit, node.kind);
    const availableCarry = capacity - (unit.carry.amount || 0);
    if (availableCarry <= 0) {
      const dropoff = findDropoffBuilding(
        match,
        unit.ownerId,
        node.kind,
        unit.x,
        unit.y
      );
      if (dropoff) {
        unit.order = {
          type: "return",
          buildingId: dropoff.id,
          returnResourceId: unit.order.resourceId,
        };
      } else {
        unit.order = null;
      }
      continue;
    }

    const amount = Math.min(node.amount, gatherRate * dt, availableCarry);
    if (amount <= 0) continue;
    node.amount -= amount;
    unit.carry.kind = node.kind;
    unit.carry.amount = (unit.carry.amount || 0) + amount;

    if (unit.carry.amount >= capacity) {
      const dropoff = findDropoffBuilding(
        match,
        unit.ownerId,
        node.kind,
        unit.x,
        unit.y
      );
      if (dropoff) {
        unit.order = {
          type: "return",
          buildingId: dropoff.id,
          returnResourceId: unit.order.resourceId,
        };
      } else {
        unit.order = null;
      }
    }

    if (node.amount <= 0) {
      match.resources = match.resources.filter((r) => r.id !== node.id);
      for (const other of match.units) {
        if (
          other.order &&
          other.order.type === "gather" &&
          other.order.resourceId === node.id
        ) {
          const replacement = findNearestResource(
            match,
            other,
            [node.kind],
            5
          );
          if (replacement) {
            other.order = { type: "gather", resourceId: replacement.id };
          } else {
            other.order = null;
          }
        }
      }
    }
  }
}

function resolveUnitCollisions(match) {
  for (let i = 0; i < match.units.length; i++) {
    const a = match.units[i];
    for (let j = i + 1; j < match.units.length; j++) {
      const b = match.units[j];
      const sameFormation =
        a.order?.formationId &&
        b.order?.formationId &&
        a.order.formationId === b.order.formationId;
      const minDist =
        (getUnitRadius(a) + getUnitRadius(b)) *
        (sameFormation ? FORMATION_COLLISION_FACTOR : 1);
      const minDistSq = minDist * minDist;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distSq = dx * dx + dy * dy;
      if (distSq === 0) {
        dx = 0.01;
        dy = 0.01;
        distSq = dx * dx + dy * dy;
      }
      if (distSq < minDistSq) {
        const dist = Math.sqrt(distSq);
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        a.x = clamp(a.x, 0, MAP.width - 0.1);
        a.y = clamp(a.y, 0, MAP.height - 0.1);
        b.x = clamp(b.x, 0, MAP.width - 0.1);
        b.y = clamp(b.y, 0, MAP.height - 0.1);
      }
    }
  }
}

function getAvoidanceVector(unit, match, options = {}) {
  const unitRadius = getUnitRadius(unit);
  const result = { x: 0, y: 0 };
  const unitAvoidanceStrength = options.unitAvoidanceStrength ?? 0.24;
  const sameFormationAvoidanceFactor =
    options.sameFormationAvoidanceFactor ?? 0.2;
  const pushFromPoint = (px, py, avoidRadius) => {
    let dx = unit.x - px;
    let dy = unit.y - py;
    let dist = Math.hypot(dx, dy);
    if (dist === 0) {
      dx = 0.01;
      dy = 0.01;
      dist = Math.hypot(dx, dy);
    }
    if (dist >= avoidRadius) return;
    const strength = (avoidRadius - dist) / avoidRadius;
    result.x += (dx / dist) * strength;
    result.y += (dy / dist) * strength;
  };

  for (const building of match.buildings) {
    if (options.ignoreBuildingId && building.id === options.ignoreBuildingId) {
      continue;
    }
    const bounds = getBuildingCollisionBounds(building);
    if (!bounds) continue;
    const minX = bounds.minX;
    const maxX = bounds.maxX;
    const minY = bounds.minY;
    const maxY = bounds.maxY;
    const closestX = clamp(unit.x, minX, maxX);
    const closestY = clamp(unit.y, minY, maxY);
    const avoidRadius = unitRadius + 0.7;
    pushFromPoint(closestX, closestY, avoidRadius);
  }

  if (options.includeUnitAvoidance) {
    for (const other of match.units) {
      if (other.id === unit.id) continue;
      const dx = unit.x - other.x;
      const dy = unit.y - other.y;
      const dist = Math.hypot(dx, dy);
      const avoidRadius = getUnitRadius(unit) + getUnitRadius(other) + 0.1;
      if (dist > 0 && dist < avoidRadius) {
        const sameFormation =
          unit.order?.formationId &&
          other.order?.formationId &&
          unit.order.formationId === other.order.formationId;
        const formationFactor = sameFormation
          ? sameFormationAvoidanceFactor
          : 1;
        const strength = (avoidRadius - dist) / avoidRadius;
        result.x +=
          (dx / dist) * strength * unitAvoidanceStrength * formationFactor;
        result.y +=
          (dy / dist) * strength * unitAvoidanceStrength * formationFactor;
      }
    }
  }

  const scale = options.avoidanceScale ?? 0.9;
  result.x *= scale;
  result.y *= scale;
  return result;
}

function moveUnitTowards(unit, targetX, targetY, dt, match, options = {}) {
  const dx = targetX - unit.x;
  const dy = targetY - unit.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.0001) return distance;
  let dirX = dx / distance;
  let dirY = dy / distance;
  const avoid = getAvoidanceVector(unit, match, {
    ...options,
    includeUnitAvoidance: options.includeUnitAvoidance ?? true,
  });
  if (avoid.x !== 0 || avoid.y !== 0) {
    const mixX = dirX + avoid.x;
    const mixY = dirY + avoid.y;
    const mixLen = Math.hypot(mixX, mixY);
    if (mixLen > 0.0001) {
      dirX = mixX / mixLen;
      dirY = mixY / mixLen;
    }
  }
  if (Math.hypot(dirX, dirY) > 0.0001) {
    unit.facing = Math.atan2(dirY, dirX);
  }
  const speed = options.speedOverride ?? getUnitSpeed(match, unit);
  const step = speed * dt;
  if (step >= distance) {
    unit.x = targetX;
    unit.y = targetY;
  } else {
    unit.x += dirX * step;
    unit.y += dirY * step;
  }
  unit.x = clamp(unit.x, 0, MAP.width - 0.1);
  unit.y = clamp(unit.y, 0, MAP.height - 0.1);
  return distance;
}

function resolveObstacleCollisions(match) {
  for (const unit of match.units) {
    const unitRadius = getUnitRadius(unit);
    const ignoreFarmId =
      unit.order && unit.order.type === "farm" ? unit.order.buildingId : null;
    for (const building of match.buildings) {
      if (ignoreFarmId && building.id === ignoreFarmId) continue;
      const bounds = getBuildingCollisionBounds(building);
      if (!bounds) continue;
      const minX = bounds.minX;
      const maxX = bounds.maxX;
      const minY = bounds.minY;
      const maxY = bounds.maxY;
      const closestX = clamp(unit.x, minX, maxX);
      const closestY = clamp(unit.y, minY, maxY);
      let dx = unit.x - closestX;
      let dy = unit.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq === 0) {
        const left = unit.x - minX;
        const right = maxX - unit.x;
        const top = unit.y - minY;
        const bottom = maxY - unit.y;
        const minEdge = Math.min(left, right, top, bottom);
        if (minEdge === left) {
          unit.x = minX - unitRadius;
        } else if (minEdge === right) {
          unit.x = maxX + unitRadius;
        } else if (minEdge === top) {
          unit.y = minY - unitRadius;
        } else {
          unit.y = maxY + unitRadius;
        }
      } else if (distSq < unitRadius * unitRadius) {
        const dist = Math.sqrt(distSq);
        const overlap = unitRadius - dist;
        dx /= dist;
        dy /= dist;
        unit.x += dx * overlap;
        unit.y += dy * overlap;
      }
    }
    unit.x = clamp(unit.x, 0, MAP.width - 0.1);
    unit.y = clamp(unit.y, 0, MAP.height - 0.1);
  }
}

function findPath(match, start, goal, unitId) {
  const width = MAP.width;
  const height = MAP.height;
  const toIndex = (x, y) => y * width + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const startX = clamp(Math.floor(start.x), 0, width - 1);
  const startY = clamp(Math.floor(start.y), 0, height - 1);
  const goalX = clamp(Math.floor(goal.x), 0, width - 1);
  const goalY = clamp(Math.floor(goal.y), 0, height - 1);
  const startIdx = toIndex(startX, startY);
  const goalIdx = toIndex(goalX, goalY);
  if (startIdx === goalIdx) return [{ x: goalX + 0.5, y: goalY + 0.5 }];

  const buildingBlocked = match.buildingBlocked;
  const unitBlocked = new Set();
  for (const u of match.units) {
    if (u.id === unitId) continue;
    if (u.order && ["move", "attackMove", "build", "repair"].includes(u.order.type)) {
      continue;
    }
    const ux = clamp(Math.floor(u.x), 0, width - 1);
    const uy = clamp(Math.floor(u.y), 0, height - 1);
    unitBlocked.add(toIndex(ux, uy));
  }
  const isBlocked = (x, y) => {
    if (!inBounds(x, y)) return true;
    const idx = toIndex(x, y);
    if (idx === goalIdx) return false;
    if (buildingBlocked && buildingBlocked[idx]) return true;
    if (unitBlocked.has(idx)) return true;
    return false;
  };

  const open = [];
  const gScore = new Float32Array(width * height);
  gScore.fill(Infinity);
  const fScore = new Float32Array(width * height);
  fScore.fill(Infinity);
  const cameFrom = new Int32Array(width * height);
  cameFrom.fill(-1);

  const h = (x, y) => Math.abs(x - goalX) + Math.abs(y - goalY);
  gScore[startIdx] = 0;
  fScore[startIdx] = h(startX, startY);
  open.push(startIdx);

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  let safety = 0;
  const maxIterations = 5000;
  while (open.length && safety++ < maxIterations) {
    let bestIdx = 0;
    let bestF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const idx = open[i];
      if (fScore[idx] < bestF) {
        bestF = fScore[idx];
        bestIdx = i;
      }
    }
    const current = open.splice(bestIdx, 1)[0];
    if (current === goalIdx) {
      const path = [];
      let cur = current;
      while (cur !== -1) {
        const x = cur % width;
        const y = Math.floor(cur / width);
        path.push({ x: x + 0.5, y: y + 0.5 });
        cur = cameFrom[cur];
      }
      path.reverse();
      return path;
    }
    const cx = current % width;
    const cy = Math.floor(current / width);
    for (const [dx, dy] of neighbors) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (isBlocked(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (isBlocked(cx + dx, cy) || isBlocked(cx, cy + dy)) continue;
      }
      const nIdx = toIndex(nx, ny);
      const tentativeG = gScore[current] + (dx !== 0 && dy !== 0 ? 1.4142 : 1);
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + h(nx, ny);
        if (!open.includes(nIdx)) open.push(nIdx);
      }
    }
  }
  return null;
}

function moveUnitWithPath(match, unit, targetX, targetY, dt, options = {}) {
  const targetKey = `${Math.floor(targetX)}:${Math.floor(targetY)}`;
  const repathTicks = options.repathTicks ?? 60;
  const needsPath =
    !unit.path ||
    unit.pathTarget !== targetKey ||
    match.tick - (unit.pathTick || 0) > repathTicks;
  if (needsPath) {
    const path = findPath(match, unit, { x: targetX, y: targetY }, unit.id);
    if (path && path.length > 1) {
      unit.path = path;
      unit.pathIndex = 1;
      unit.pathTarget = targetKey;
      unit.pathTick = match.tick;
    } else {
      unit.path = null;
      unit.pathIndex = 0;
      unit.pathTarget = targetKey;
      unit.pathTick = match.tick;
    }
  }
  let destX = targetX;
  let destY = targetY;
  if (unit.path && unit.pathIndex < unit.path.length) {
    const waypoint = unit.path[unit.pathIndex];
    destX = waypoint.x;
    destY = waypoint.y;
    const d = Math.hypot(destX - unit.x, destY - unit.y);
    if (d < 0.1) {
      unit.pathIndex += 1;
    }
  }
  moveUnitTowards(unit, destX, destY, dt, match, options);
}

function computeTradeGold(distance) {
  return 0.008 * distance * distance + 0.1 * distance;
}

function startTraderLeg(match, trader, leg) {
  if (!trader.trade) return;
  const home = getBuildingById(match, trader.trade.homeId);
  const dest = getBuildingById(match, trader.trade.destId);
  if (!home || !dest) return;
  const from = getBuildingCenter(home);
  const to = getBuildingCenter(dest);
  const distance = Math.hypot(from.x - to.x, from.y - to.y);
  trader.trade.leg = leg;
  trader.trade.nextGold = computeTradeGold(distance);
  trader.trade.paused = false;
  const target = leg === "toDest" ? dest : home;
  trader.order = { type: "trade", buildingId: target.id };
}

function applyRapidFabricationsToExisting(match, playerIndex) {
  const player = match?.players?.[playerIndex];
  if (!player?.techs?.RapidFabrications) return;
  for (const building of match.buildings) {
    if (building.ownerId !== playerIndex) continue;
    if (building.isUnderConstruction) {
      const prevTotal = building.buildTime || BUILDINGS[building.type]?.buildTime || 0;
      const nextTotal = getBuildingBuildTimeForPlayer(player, building.type);
      if (prevTotal > 0 && nextTotal > 0 && nextTotal !== prevTotal) {
        const progressRatio = Math.max(
          0,
          Math.min(1, (building.buildProgress || 0) / prevTotal)
        );
        building.buildTime = nextTotal;
        building.buildProgress = Math.min(nextTotal, progressRatio * nextTotal);
        const maxHp = building.maxHp || BUILDINGS[building.type]?.health || building.hp || 1;
        building.hp = Math.max(1, Math.round(maxHp * progressRatio));
      }
    }
    if (!building.productionQueue?.length) continue;
    for (const job of building.productionQueue) {
      if (!job?.unitType || !isSiegeUnitType(job.unitType)) continue;
      const prevTotal = job.total || UNITS[job.unitType]?.buildTime || 0;
      const nextTotal = getUnitProductionTimeForPlayer(
        match,
        player,
        job.unitType,
        building
      );
      if (!prevTotal || !nextTotal || prevTotal === nextTotal) continue;
      const progressRatio = Math.max(
        0,
        Math.min(1, 1 - (job.remaining ?? prevTotal) / prevTotal)
      );
      job.total = nextTotal;
      job.remaining = Math.max(0, nextTotal * (1 - progressRatio));
    }
  }
}

function processReturns(match) {
  for (const unit of match.units) {
    if (!unit.order || unit.order.type !== "return") continue;
    const building = getBuildingById(match, unit.order.buildingId);
    if (
      !building ||
      building.isUnderConstruction ||
      isDestroyedLandmark(building)
    ) {
      const kind = unit.carry?.kind || null;
      if (kind) {
        const replacement = findDropoffBuilding(
          match,
          unit.ownerId,
          kind,
          unit.x,
          unit.y
        );
        if (replacement) {
          unit.order.buildingId = replacement.id;
          continue;
        }
      }
      unit.order = null;
      continue;
    }
    const def = BUILDINGS[building.type];
    const targetX = clamp(
      unit.x,
      building.x,
      building.x + def.size
    );
    const targetY = clamp(
      unit.y,
      building.y,
      building.y + def.size
    );
    const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
    if (distance > 0.75) continue;

    if (unit.carry.amount > 0 && unit.carry.kind) {
      const player = match.players[unit.ownerId];
      if (player) {
        const multiplier = getDropoffMultiplier(player, unit.carry.kind);
        const depositedAmount = unit.carry.amount * multiplier;
        if (building.type === "GoldenFountainSquare") {
          const validKinds = new Set(["food", "wood", "gold"]);
          const convertKind = validKinds.has(building.convertResourceKind)
            ? building.convertResourceKind
            : "food";
          player.resources[convertKind] =
            (player.resources[convertKind] || 0) + depositedAmount;
        } else {
          player.resources[unit.carry.kind] =
            (player.resources[unit.carry.kind] || 0) + depositedAmount;
        }
        if (building.type === "OldMarketPavilion" && unit.carry.kind === "food") {
          const ageTier = getLandmarkAgeTierForBuilding(match, building) || 1;
          const bonusPct =
            LANDMARK_BONUSES?.OldMarketPavilion?.foodToGoldByAge?.[
              getLandmarkBonusIndexFromAge(ageTier)
            ] || 0;
          if (bonusPct > 0) {
            player.resources.gold =
              (player.resources.gold || 0) + depositedAmount * bonusPct;
          }
        }
      }
      unit.carry.amount = 0;
      unit.carry.kind = null;
    }

    if (unit.order.returnFarmId) {
      const farm = getBuildingById(match, unit.order.returnFarmId);
      if (farm && farm.type === "Farm") {
        if (!farm.farmerId || farm.farmerId === unit.id) {
          farm.farmerId = unit.id;
          unit.order = { type: "farm", buildingId: farm.id };
          continue;
        }
      }
    }

    const returnResourceId = unit.order.returnResourceId;
    if (returnResourceId) {
      const node = match.resources.find((r) => r.id === returnResourceId);
      if (node) {
        unit.order = { type: "gather", resourceId: returnResourceId };
        continue;
      }
    }
    unit.order = null;
  }
}

function processConstruction(match, dt) {
  for (const building of match.buildings) {
    if (!building.isUnderConstruction) continue;
    const def = BUILDINGS[building.type];
    const totalBuildTime = building.buildTime ?? def.buildTime ?? 0;
    if (!totalBuildTime || totalBuildTime <= 0) {
      building.isUnderConstruction = false;
      building.buildProgress = totalBuildTime || 0;
      building.hp = building.maxHp || def.health;
      continue;
    }
    const builders = match.units.filter(
      (unit) =>
        unit.order &&
        unit.order.type === "build" &&
        unit.order.buildingId === building.id
    );
    if (!builders.length) continue;
    const targetX = clamp(
      builders[0].x,
      building.x,
      building.x + def.size
    );
    const targetY = clamp(
      builders[0].y,
      building.y,
      building.y + def.size
    );
    const nearbyBuilders = builders.filter((unit) => {
      const bx = clamp(unit.x, building.x, building.x + def.size);
      const by = clamp(unit.y, building.y, building.y + def.size);
      return Math.hypot(bx - unit.x, by - unit.y) <= 1.05;
    });
    if (!nearbyBuilders.length) continue;
    building.buildProgress += dt * nearbyBuilders.length;
    const progress = Math.max(
      0,
      Math.min(1, building.buildProgress / totalBuildTime)
    );
    const maxHp = building.maxHp || def.health || 1;
    building.hp = Math.max(1, Math.round(maxHp * progress));
    if (building.buildProgress >= totalBuildTime) {
      building.buildProgress = totalBuildTime;
      building.isUnderConstruction = false;
      building.hp = building.maxHp || def.health;
      const owner = match.players[building.ownerId];
      if (owner && isLandmarkType(building.type)) {
        const landmarkTier = building.landmarkAgeTier || getLandmarkNextAgeTier(owner);
        building.landmarkAgeTier = landmarkTier;
        if (!owner.landmarkBuiltAges) {
          owner.landmarkBuiltAges = {};
        }
        owner.landmarkBuiltAges[building.type] = landmarkTier;
        if (building.type === "DominionSpire") {
          building.maxHp = getDominionSpireMaxHpForAge(owner, landmarkTier);
          building.hp = building.maxHp;
        }
        const ageAdvanced = applyAgeAdvancement(match, owner, landmarkTier);
        if (ageAdvanced && owner.id) {
          io.to(owner.id).emit("researchComplete", {
            techId: null,
            name: AGE_ORDER[owner.ageTier] || "New Age",
            isAge: true,
            ageTier: owner.ageTier,
            age: owner.age,
            buildingId: building.id,
            scope: "landmark",
          });
        }
      }
      if (owner?.id) {
        io.to(owner.id).emit("buildingComplete", { buildingType: building.type });
      }
      const idleBuilders = [...nearbyBuilders];

      for (const unit of nearbyBuilders) {
        if (unit.carry && unit.carry.amount > 0 && unit.carry.kind) {
          const player = match.players[unit.ownerId];
          if (player) {
            const multiplier = getDropoffMultiplier(player, unit.carry.kind);
            player.resources[unit.carry.kind] =
              (player.resources[unit.carry.kind] || 0) +
              unit.carry.amount * multiplier;
          }
          unit.carry.amount = 0;
          unit.carry.kind = null;
        }
      }

      // 1) Farm: assign one villager to start farming immediately.
      if (building.type === "Farm" && idleBuilders.length) {
        const farmer = idleBuilders.shift();
        building.farmerId = farmer.id;
        farmer.order = { type: "farm", buildingId: building.id };
      }

      // 2) Look for nearby unfinished buildings within 6 tiles.
      for (const unit of idleBuilders) {
        const target = findNearestUnfinished(match, unit, 6);
        if (target) {
          unit.order = { type: "build", buildingId: target.id };
        } else {
          unit.order = null;
        }
      }

      // 3) If this is a drop-off building, assign nearby resources within 6 tiles.
      if (def.accepts && def.accepts.length) {
        for (const unit of idleBuilders) {
          if (unit.order) continue;
          const resource = findNearestResource(
            match,
            unit,
            def.accepts,
            6
          );
          if (resource) {
            unit.order = { type: "gather", resourceId: resource.id };
          }
        }
      }
    }
  }
}

function processRepairing(match, dt) {
  for (const building of match.buildings) {
    if (building.isUnderConstruction) continue;
    if (building.ownerId === null || building.ownerId === undefined) continue;
    const maxHp =
      building.maxHp ||
      getBuildingMaxHpForOwner(match, building.ownerId, building.type);
    building.maxHp = maxHp;
    if ((building.hp ?? 0) >= maxHp) {
      building.hp = maxHp;
      if (isDestroyedLandmark(building)) {
        building.landmarkDestroyed = false;
      }
      continue;
    }

    const repairers = match.units.filter(
      (unit) =>
        unit.ownerId === building.ownerId &&
        unit.type === "Villager" &&
        unit.order &&
        unit.order.type === "repair" &&
        unit.order.buildingId === building.id
    );
    if (!repairers.length) continue;

    const nearbyRepairers = repairers.filter((unit) => {
      const tx = clamp(unit.x, building.x, building.x + BUILDINGS[building.type].size);
      const ty = clamp(unit.y, building.y, building.y + BUILDINGS[building.type].size);
      return Math.hypot(tx - unit.x, ty - unit.y) <= 0.75;
    });
    if (!nearbyRepairers.length) continue;

    const owner = match.players[building.ownerId];
    if (!owner) continue;
    const resourceKind = getRepairResourceKind(building.type);
    const available = Math.max(0, Number(owner.resources?.[resourceKind] || 0));
    if (available <= 0) continue;

    const costPerVillagerPerSec = 1;
    const healthPerVillagerPerSec = 20;
    const maxAffordableVillagers = available / (costPerVillagerPerSec * dt);
    const activeRepairers = Math.min(nearbyRepairers.length, maxAffordableVillagers);
    if (activeRepairers <= 0) continue;

    const repairCost = activeRepairers * costPerVillagerPerSec * dt;
    owner.resources[resourceKind] = Math.max(
      0,
      (owner.resources[resourceKind] || 0) - repairCost
    );

    const repaired = activeRepairers * healthPerVillagerPerSec * dt;
    building.hp = Math.min(maxHp, (building.hp || 0) + repaired);

    if (building.hp >= maxHp) {
      building.hp = maxHp;
      if (isDestroyedLandmark(building)) {
        building.landmarkDestroyed = false;
      }
      for (const unit of repairers) {
        if (
          unit.order &&
          unit.order.type === "repair" &&
          unit.order.buildingId === building.id
        ) {
          unit.order = null;
        }
      }
    }
  }

  for (const targetUnit of match.units) {
    if (!isSiegeUnitType(targetUnit.type)) continue;
    if (targetUnit.ownerId === null || targetUnit.ownerId === undefined) continue;
    const maxHp = targetUnit.maxHp || UNITS[targetUnit.type]?.health || 1;
    targetUnit.maxHp = maxHp;
    if ((targetUnit.hp ?? 0) >= maxHp) {
      targetUnit.hp = maxHp;
      continue;
    }

    const repairers = match.units.filter(
      (unit) =>
        unit.ownerId === targetUnit.ownerId &&
        unit.type === "Villager" &&
        unit.order &&
        unit.order.type === "repair" &&
        unit.order.unitId === targetUnit.id
    );
    if (!repairers.length) continue;

    const nearbyRepairers = repairers.filter(
      (unit) => Math.hypot(targetUnit.x - unit.x, targetUnit.y - unit.y) <= 1.25
    );
    if (!nearbyRepairers.length) continue;

    const owner = match.players[targetUnit.ownerId];
    if (!owner) continue;
    const available = Math.max(0, Number(owner.resources?.wood || 0));
    if (available <= 0) continue;

    const costPerVillagerPerSec = 1;
    const healthPerVillagerPerSec = 5;
    const maxAffordableVillagers = available / (costPerVillagerPerSec * dt);
    const activeRepairers = Math.min(nearbyRepairers.length, maxAffordableVillagers);
    if (activeRepairers <= 0) continue;

    const repairCost = activeRepairers * costPerVillagerPerSec * dt;
    owner.resources.wood = Math.max(0, (owner.resources.wood || 0) - repairCost);

    const repaired = activeRepairers * healthPerVillagerPerSec * dt;
    targetUnit.hp = Math.min(maxHp, (targetUnit.hp || 0) + repaired);

    if (targetUnit.hp >= maxHp) {
      targetUnit.hp = maxHp;
      for (const villager of repairers) {
        if (
          villager.order &&
          villager.order.type === "repair" &&
          villager.order.unitId === targetUnit.id
        ) {
          villager.order = null;
        }
      }
    }
  }
}

function eliminatePlayer(match, playerIndex, reason = "eliminated") {
  const player = match.players[playerIndex];
  if (!player || player.eliminated) return false;
  player.eliminated = true;
  player.eliminationReason = reason;

  for (const unit of match.units) {
    if (unit.ownerId !== playerIndex) continue;
    if (!unit.relicId) continue;
    const relic = getRelicById(match, unit.relicId);
    if (!relic) continue;
    relic.carrierId = null;
    relic.storedInBuildingId = null;
    relic.x = unit.x;
    relic.y = unit.y;
    unit.relicId = null;
  }

  for (const building of match.buildings) {
    if (building.ownerId !== playerIndex) continue;
    const relicIds = building.relicIds || [];
    if (!relicIds.length) continue;
    const def = BUILDINGS[building.type];
    const dropX = building.x + (def?.size || 1) / 2;
    const dropY = building.y + (def?.size || 1) / 2;
    for (const relicId of relicIds) {
      const relic = getRelicById(match, relicId);
      if (!relic) continue;
      relic.storedInBuildingId = null;
      relic.carrierId = null;
      relic.x = dropX;
      relic.y = dropY;
    }
    building.relicIds = [];
  }

  match.units = match.units.filter((unit) => unit.ownerId !== playerIndex);
  match.buildings = match.buildings.filter(
    (building) => building.ownerId !== playerIndex
  );
  return true;
}

function processPlayerEliminations(match) {
  let changed = false;
  const activeTeams = new Set();
  for (const player of match.players) {
    if (!player || player.eliminated) continue;
    const teamId = getPlayerTeam(match, player.index);
    if (teamId !== null && teamId !== undefined) {
      activeTeams.add(teamId);
    }
  }

  for (const teamId of activeTeams) {
    const hasLivingLandmark = match.buildings.some((building) => {
      if (!building || building.hp <= 0) return false;
      if (building.ownerId === null || building.ownerId === undefined) return false;
      if (!isLandmarkBuildingType(building.type)) return false;
      if (building.landmarkDestroyed) return false;
      return getPlayerTeam(match, building.ownerId) === teamId;
    });
    if (hasLivingLandmark) continue;

    for (const player of match.players) {
      if (!player || player.eliminated) continue;
      if (getPlayerTeam(match, player.index) !== teamId) continue;
      changed =
        eliminatePlayer(match, player.index, "landmarks_destroyed") || changed;
    }
  }
  return changed;
}

function getAliveTeamIds(match) {
  const alive = new Set();
  for (const player of match.players) {
    if (!player || player.eliminated) continue;
    alive.add(getPlayerTeam(match, player.index));
  }
  return [...alive];
}

function getMatchOutcome(match) {
  const aliveTeams = getAliveTeamIds(match);
  if (aliveTeams.length === 0) {
    return { reason: "all_eliminated", winnerTeam: null };
  }
  const initialTeams = match.initialTeamIds || [];
  if (initialTeams.length < 2) return null;
  if (aliveTeams.length === 1) {
    return { reason: "team_victory", winnerTeam: aliveTeams[0] };
  }
  return null;
}

function hasLandmarkUnderConstruction(match, ownerId) {
  return match.buildings.some(
    (building) =>
      building.ownerId === ownerId &&
      isLandmarkType(building.type) &&
      building.isUnderConstruction
  );
}

function hasLandmarkPlaced(match, ownerId, buildingType) {
  return match.buildings.some(
    (building) => building.ownerId === ownerId && building.type === buildingType
  );
}

function tickMatch(match) {
  const dt = 1 / TICK_RATE;
  match.tick += 1;

  activateQueuedOrders(match);
  match.buildingBlocked = buildBuildingBlocked(match);
  processMovement(match, dt);
  resolveUnitCollisions(match);
  resolveObstacleCollisions(match);
  processReturns(match);
  processGathering(match, dt);
  processConstruction(match, dt);
  processRepairing(match, dt);
  processProduction(match, dt);
  processCombat(match, dt);
  processPlayerEliminations(match);
  const outcome = getMatchOutcome(match);
  if (outcome) {
    io.to(match.id).emit("matchEnded", outcome);
    cleanupMatch(match.id);
    return;
  }
  processHealing(match, dt);
  processMonasteryRelics(match, dt);
  processTrading(match);
  activateQueuedOrders(match);

  io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
  match.pendingAttacks = [];
}

function startMatch(match) {
  if (match.tickHandle) return;
  match.tickHandle = setInterval(() => tickMatch(match), TICK_MS);
}

function stopMatch(match) {
  if (match.tickHandle) {
    clearInterval(match.tickHandle);
    match.tickHandle = null;
  }
}

function cleanupMatch(matchId) {
  const match = matches.get(matchId);
  if (!match) return;
  stopMatch(match);
  matches.delete(matchId);
}

function emitMatchStart(match, socket, player) {
  socket.matchId = match.id;
  socket.isQueued = false;
  socket.join(match.id);
  socket.emit("matchStart", {
    matchId: match.id,
    playerIndex: player.index,
    map: match.map,
    resources: match.resources,
    singleplayer: match.singleplayer,
    allowCheats: match.allowCheats,
    players: match.players.map((p) => ({
      index: p.index,
      team: p.team,
      eliminated: !!p.eliminated,
      resources: p.resources,
      techs: p.techs,
      ageTier: p.ageTier,
      age: p.age,
      landmarkChoices: p.landmarkChoices || [],
      landmarkBuiltAges: p.landmarkBuiltAges || {},
      color: p.color,
      populationUsed: getPopulationUsed(match, p.index),
      populationCap: getPopulationCap(match, p.index),
    })),
    units: match.units,
    buildings: match.buildings,
    relics: match.relics || [],
  });
}

function startMultiplayerMatch(
  sockets,
  allowCheats = false,
  colorAssignments = null,
  teamAssignments = null
) {
  const connectedSockets = (Array.isArray(sockets) ? sockets : [sockets]).filter(
    (s) => s && s.connected
  );
  if (connectedSockets.length < 2) return;
  const playerCount = Math.max(2, Math.min(MAX_MULTIPLAYER_PLAYERS, connectedSockets.length));
  const match = createMatch(playerCount);
  matches.set(match.id, match);
  match.allowCheats = !!allowCheats;
  for (const socket of connectedSockets) {
    const colorHex = colorAssignments?.[socket.id]
      ? getColorHexById(colorAssignments[socket.id])
      : null;
    const teamId = Number(teamAssignments?.[socket.id]);
    const player = assignPlayer(
      match,
      socket,
      colorHex,
      TEAM_OPTIONS.includes(teamId) ? teamId : null
    );
    if (!player) continue;
    emitMatchStart(match, socket, player);
  }
  match.initialTeamIds = [
    ...new Set(match.players.filter((p) => p.id).map((p) => p.team)),
  ];
  startMatch(match);
}

io.on("connection", (socket) => {
  socket.emit("lobbyList", getLobbyList());

  socket.on("requestLobbies", () => {
    socket.emit("lobbyList", getLobbyList());
  });

  socket.on("setLobbyCheats", (payload = {}) => {
    const lobbyId = payload.id || socket.lobbyId;
    if (!lobbyId || !lobbies.has(lobbyId)) return;
    const lobby = lobbies.get(lobbyId);
    if (lobby.hostId !== socket.id) return;
    lobby.allowCheats = !!payload.allowCheats;
    emitLobbyUpdate(lobby);
    broadcastLobbyList();
  });

  socket.on("setLobbyColor", (payload = {}) => {
    const lobbyId = payload.id || socket.lobbyId;
    if (!lobbyId || !lobbies.has(lobbyId)) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby.players.includes(socket.id)) return;
    const colorId = String(payload.colorId || "").trim();
    const valid = COLOR_OPTIONS.some((c) => c.id === colorId);
    if (!valid) return;
    if (!lobby.colorAssignments) lobby.colorAssignments = {};
    const takenByOther = Object.entries(lobby.colorAssignments).some(
      ([id, c]) => id !== socket.id && c === colorId
    );
    if (takenByOther) return;
    lobby.colorAssignments[socket.id] = colorId;
    emitLobbyUpdate(lobby);
    broadcastLobbyList();
  });

  socket.on("setLobbyTeam", (payload = {}) => {
    const lobbyId = payload.id || socket.lobbyId;
    if (!lobbyId || !lobbies.has(lobbyId)) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby.players.includes(socket.id)) return;
    const team = Number(payload.team);
    if (!TEAM_OPTIONS.includes(team)) return;
    if (!lobby.teamAssignments) lobby.teamAssignments = {};
    lobby.teamAssignments[socket.id] = team;
    emitLobbyUpdate(lobby);
    broadcastLobbyList();
  });


  socket.on("createLobby", (payload = {}, ack) => {
    if (socket.matchId && matches.has(socket.matchId)) {
      if (typeof ack === "function") {
        ack({ ok: false, reason: "already_in_match" });
      }
      return;
    }
    const name = String(payload.name || "").trim().slice(0, 24) || "New Lobby";
    if (socket.lobbyId) {
      leaveLobby(socket, "switch");
    }
    removeFromQueue(socket);
    const lobbyId = `lobby-${nextLobbyId++}`;
    const lobby = {
      id: lobbyId,
      name,
      hostId: socket.id,
      players: [socket.id],
      capacity: MAX_MULTIPLAYER_PLAYERS,
      allowCheats: false,
      colorAssignments: {},
      teamAssignments: {},
      createdAt: Date.now(),
    };
    allocateLobbyColor(lobby, socket.id);
    allocateLobbyTeam(lobby, socket.id);
    lobbies.set(lobbyId, lobby);
    socket.lobbyId = lobbyId;
    socket.emit("lobbyJoined", getLobbyRoomPayload(lobby, socket.id));
    emitLobbyUpdate(lobby);
    broadcastLobbyList();
    if (typeof ack === "function") {
      ack({ ok: true, id: lobby.id });
    }
  });

  socket.on("joinLobby", (payload = {}, ack) => {
    if (socket.matchId && matches.has(socket.matchId)) {
      if (typeof ack === "function") {
        ack({ ok: false, reason: "already_in_match" });
      }
      return;
    }
    const lobbyId = payload.id;
    if (!lobbyId || !lobbies.has(lobbyId)) {
      if (typeof ack === "function") {
        ack({ ok: false, reason: "not_found" });
      }
      return;
    }
    const lobby = lobbies.get(lobbyId);
    if (lobby.players.includes(socket.id)) {
      if (typeof ack === "function") {
        ack({ ok: true, id: lobby.id });
      }
      return;
    }
    if (lobby.players.length >= lobby.capacity) {
      if (typeof ack === "function") {
        ack({ ok: false, reason: "full" });
      }
      return;
    }
    if (socket.lobbyId) {
      leaveLobby(socket, "switch");
    }
      removeFromQueue(socket);
      lobby.players.push(socket.id);
      allocateLobbyColor(lobby, socket.id);
      allocateLobbyTeam(lobby, socket.id);
      socket.lobbyId = lobby.id;
      socket.emit("lobbyJoined", getLobbyRoomPayload(lobby, socket.id));
      emitLobbyUpdate(lobby);
    broadcastLobbyList();
    if (typeof ack === "function") {
      ack({ ok: true, id: lobby.id });
    }

    if (lobby.players.length >= lobby.capacity) {
      const sockets = lobby.players
        .map((id) => io.sockets.sockets.get(id))
        .filter((s) => s && s.connected);
      if (sockets.length < 2) {
        lobby.players = sockets.map((s) => s.id);
        broadcastLobbyList();
      }
    }
  });

  socket.on("leaveLobby", () => {
    leaveLobby(socket, "left");
  });

  socket.on("startLobby", (payload = {}, ack) => {
    const lobbyId = payload.id || socket.lobbyId;
    if (!lobbyId || !lobbies.has(lobbyId)) {
      if (typeof ack === "function") {
        ack({ ok: false, reason: "not_found" });
      }
      return;
    }
    const lobby = lobbies.get(lobbyId);
    if (lobby.hostId !== socket.id) {
      if (typeof ack === "function") {
        ack({ ok: false, reason: "not_host" });
      }
      return;
    }
    if (lobby.players.length < 2) {
      if (typeof ack === "function") {
        ack({ ok: false, reason: "not_ready" });
      }
      return;
    }
    const sockets = lobby.players
      .map((id) => io.sockets.sockets.get(id))
      .filter((s) => s && s.connected);
      if (sockets.length < 2) {
        lobby.players = sockets.map((s) => s.id);
        broadcastLobbyList();
        if (typeof ack === "function") {
          ack({ ok: false, reason: "not_ready" });
        }
        return;
      }
      if (!lobby.colorAssignments) lobby.colorAssignments = {};
      if (!lobby.teamAssignments) lobby.teamAssignments = {};
      sockets.forEach((s) => allocateLobbyColor(lobby, s.id));
      sockets.forEach((s) => allocateLobbyTeam(lobby, s.id));
      const teamsInLobby = new Set(
        sockets.map((s) => Number(lobby.teamAssignments[s.id])).filter((t) => TEAM_OPTIONS.includes(t))
      );
      if (teamsInLobby.size < 2) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "team_not_ready" });
        }
        return;
      }
      lobbies.delete(lobby.id);
      sockets.forEach((s) => (s.lobbyId = null));
      startMultiplayerMatch(
        sockets,
        lobby.allowCheats,
        lobby.colorAssignments,
        lobby.teamAssignments
      );
    broadcastLobbyList();
    if (typeof ack === "function") {
      ack({ ok: true });
    }
  });

  socket.on("play", () => {
    if (socket.matchId && !matches.has(socket.matchId)) {
      socket.matchId = null;
      socket.isQueued = false;
    }
    if (socket.matchId || socket.isQueued) return;

    const opponent = waitingQueue.shift();
    if (opponent && opponent.connected) {
      startMultiplayerMatch([opponent, socket], false);
    } else {
      waitingQueue.push(socket);
      socket.isQueued = true;
      socket.emit("queue", { status: "waiting" });
    }
  });

  socket.on("cancelQueue", () => {
    if (!socket.isQueued) return;
    removeFromQueue(socket);
  });

  socket.on("singleplayer", () => {
    if (socket.matchId && !matches.has(socket.matchId)) {
      socket.matchId = null;
      socket.isQueued = false;
    }
    if (socket.lobbyId) {
      leaveLobby(socket, "singleplayer");
    }
    removeFromQueue(socket);
    if (socket.matchId || socket.isQueued) return;
    const match = createMatch(1);
    matches.set(match.id, match);
    match.singleplayer = true;
    match.hostId = socket.id;

      const playerA = assignPlayer(match, socket);
      if (!playerA) return;
      playerA.color = getColorHexById("blue");

      pruneEnemyForSingleplayer(match, playerA.index);

    socket.matchId = match.id;
    socket.isQueued = false;
    socket.join(match.id);

      socket.emit("matchStart", {
        matchId: match.id,
        playerIndex: playerA.index,
        map: match.map,
        resources: match.resources,
        singleplayer: match.singleplayer,
        allowCheats: match.allowCheats,
    players: match.players.map((player) => ({
      index: player.index,
      team: player.team,
      eliminated: !!player.eliminated,
      resources: player.resources,
      techs: player.techs,
      ageTier: player.ageTier,
      age: player.age,
      landmarkChoices: player.landmarkChoices || [],
      landmarkBuiltAges: player.landmarkBuiltAges || {},
      color: player.color,
      populationUsed: getPopulationUsed(match, player.index),
      populationCap: getPopulationCap(match, player.index),
        })),
        units: match.units,
        buildings: match.buildings,
        relics: match.relics || [],
      });

    startMatch(match);
  });

  socket.on("command", (payload, ack) => {
    const match = matches.get(socket.matchId);
    if (!match) return;
    const player = match.players.find((p) => p.id === socket.id);
    if (!player) return;
    if (!isPlainObject(payload) || typeof payload.type !== "string") {
      if (typeof ack === "function") {
        ack({ ok: false, reason: "invalid_payload" });
      }
      return;
    }
    if (player.eliminated && payload.type !== "resign") return;

    if (payload.type === "move" || payload.type === "attackMove") {
      const target = normalizeWorldPoint(payload.target);
      if (!target) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_target" });
        }
        return;
      }
      const queue = !!payload.queue;
      const selectedUnits = normalizeIdArray(payload.unitIds)
        .map((id) => getUnitById(match, id))
        .filter((unit) => unit && unit.ownerId === player.index);
      const useFormation =
        selectedUnits.length > 1 && areUnitsNearby(selectedUnits, 6);
      const offsets = useFormation
        ? computeFormationOffsets(selectedUnits, FORMATION_SPACING)
        : new Map();
      const formationSpeed = useFormation
        ? Math.min(...selectedUnits.map((unit) => getUnitSpeed(match, unit)))
        : null;
      const formationId = useFormation
        ? `f-${match.tick}-${Math.floor(Math.random() * 100000)}`
        : null;

      for (const unit of selectedUnits) {
        const order = { type: payload.type, target };
        if (useFormation) {
          order.formationOffset = offsets.get(unit.id) || { x: 0, y: 0 };
          order.formationSpeed = formationSpeed;
          order.formationId = formationId;
        }
        issueUnitOrder(unit, order, queue);
      }
    }

    if (payload.type === "attackTarget") {
      const queue = !!payload.queue;
      const targetId = normalizeId(payload.targetId);
      if (targetId === null) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_target" });
        }
        return;
      }
      const target =
        getUnitById(match, targetId) ||
        getBuildingById(match, targetId);
      if (!target) return;
      if (!isEnemyPlayer(match, target.ownerId, player.index)) return;
      if (isBuildingEntity(target)) {
        const def = BUILDINGS[target.type];
        if (
          def?.isNeutral ||
          def?.isInvulnerable ||
          target.ownerId === null ||
          isUntargetableDestroyedLandmark(target)
        ) {
          return;
        }
      }
      const selectedUnits = normalizeIdArray(payload.unitIds)
        .map((id) => getUnitById(match, id))
        .filter((unit) => unit && unit.ownerId === player.index);
      for (const unit of selectedUnits) {
        if (unit.type === "Trader") continue;
        issueUnitOrder(
          unit,
          { type: "attack", targetId: target.id, manualTarget: true },
          queue
        );
      }
    }

    if (payload.type === "buildingAttackTarget") {
      const targetId = normalizeId(payload.targetId);
      if (targetId === null) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_target" });
        }
        return;
      }
      const target =
        getUnitById(match, targetId) ||
        getBuildingById(match, targetId);
      if (!target || !isEnemyPlayer(match, target.ownerId, player.index)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_target" });
        }
        return;
      }
      if (isBuildingEntity(target)) {
        const targetDef = BUILDINGS[target.type];
        if (
          !targetDef ||
          targetDef.isNeutral ||
          targetDef.isInvulnerable ||
          isUntargetableDestroyedLandmark(target)
        ) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "invalid_target" });
          }
          return;
        }
      }
      const requestedIds = normalizeIdsFromArrayOrSingle(
        payload.buildingIds,
        payload.buildingId
      );
      const selectedBuildings = requestedIds
        .map((id) => getBuildingById(match, id))
        .filter(
          (building) =>
            building &&
            building.ownerId === player.index &&
            !isDestroyedLandmark(building)
        );
      if (!selectedBuildings.length) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      let assigned = 0;
      for (const building of selectedBuildings) {
        const buildingDef = BUILDINGS[building.type];
        if (!buildingDef || buildingDef.isNeutral || buildingDef.isInvulnerable) {
          continue;
        }
        const attackProfiles = getBuildingAttackProfiles(building, buildingDef);
        if (!attackProfiles.length) continue;
        building.attackTargetId = target.id;
        assigned += 1;
      }
      if (!assigned) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "no_attack" });
        }
        return;
      }
      io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
      if (typeof ack === "function") {
        ack({ ok: true, count: assigned });
      }
    }

    if (payload.type === "healTarget") {
      const queue = !!payload.queue;
      const targetId = normalizeId(payload.targetId);
      if (targetId === null) return;
      const target = getUnitById(match, targetId);
      if (!target) return;
      if (target.ownerId !== player.index) return;
      if (isSiegeUnit(target)) return;
      for (const unitId of normalizeIdArray(payload.unitIds)) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index || unit.type !== "Monk") continue;
        if (unit.relicId) continue;
        issueUnitOrder(unit, { type: "heal", targetId: target.id, manual: true }, queue);
      }
    }

    if (payload.type === "gather") {
      const queue = !!payload.queue;
      const resourceId = normalizeId(payload.resourceId);
      if (resourceId === null) return;
      const node = match.resources.find((r) => r.id === resourceId);
      if (!node) return;
      for (const unitId of normalizeIdArray(payload.unitIds)) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index) continue;
        if (unit.type !== "Villager") continue;
        issueUnitOrder(unit, { type: "gather", resourceId: node.id }, queue);
      }
    }

    if (payload.type === "pickupRelic") {
      const queue = !!payload.queue;
      if (!canPlayerPickUpRelics(match, player)) return;
      const relicId = normalizeId(payload.relicId);
      if (relicId === null) return;
      const relic = getRelicById(match, relicId);
      if (!relic || relic.carrierId || relic.storedInBuildingId) return;
      for (const unitId of normalizeIdArray(payload.unitIds)) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index || unit.type !== "Monk") continue;
        if (unit.relicId) continue;
        issueUnitOrder(unit, { type: "pickupRelic", relicId: relic.id }, queue);
      }
    }

    if (payload.type === "dropRelicAt") {
      const queue = !!payload.queue;
      const dropTarget = payload.target ? normalizeWorldPoint(payload.target) : null;
      if (payload.target && !dropTarget) return;
      for (const unitId of normalizeIdArray(payload.unitIds)) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index || unit.type !== "Monk") continue;
        if (!unit.relicId) continue;
        const target = dropTarget || { x: unit.x, y: unit.y };
        const targetBuilding = findBuildingAtPoint(match, target.x, target.y);
        if (
          targetBuilding &&
          targetBuilding.ownerId === player.index &&
          isRelicBuilding(targetBuilding) &&
          !targetBuilding.isUnderConstruction
        ) {
          issueUnitOrder(
            unit,
            { type: "depositRelic", buildingId: targetBuilding.id },
            queue
          );
        } else {
          issueUnitOrder(
            unit,
            { type: "dropRelic", target: { x: target.x, y: target.y } },
            queue
          );
        }
      }
    }

    if (payload.type === "depositRelic") {
      const queue = !!payload.queue;
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) return;
      const building = getBuildingById(match, buildingId);
      if (
        !building ||
        building.ownerId !== player.index ||
        !isRelicBuilding(building) ||
        building.isUnderConstruction
      ) {
        return;
      }
      for (const unitId of normalizeIdArray(payload.unitIds)) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index || unit.type !== "Monk") continue;
        if (!unit.relicId) continue;
        issueUnitOrder(unit, { type: "depositRelic", buildingId: building.id }, queue);
      }
    }

    if (payload.type === "takeRelic") {
      const queue = !!payload.queue;
      if (!canPlayerPickUpRelics(match, player)) return;
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) return;
      const building = getBuildingById(match, buildingId);
      if (
        !building ||
        building.ownerId !== player.index ||
        !isRelicBuilding(building) ||
        building.isUnderConstruction ||
        !(building.relicIds || []).length
      ) {
        return;
      }
      for (const unitId of normalizeIdArray(payload.unitIds)) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index || unit.type !== "Monk") continue;
        if (unit.relicId) continue;
        issueUnitOrder(unit, { type: "takeRelic", buildingId: building.id }, queue);
      }
    }

    if (payload.type === "setTradeHome") {
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) return;
      const building = getBuildingById(match, buildingId);
      if (!building || building.ownerId !== player.index || building.type !== "Market") return;
      if (building.isUnderConstruction) return;
      for (const unitId of normalizeIdArray(payload.unitIds)) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index || unit.type !== "Trader") continue;
        if (!unit.trade) {
          unit.trade = {
            homeId: null,
            destId: null,
            pendingHomeId: null,
            pendingDestId: null,
            leg: null,
            nextGold: 0,
            paused: false,
          };
        }
        unit.trade.homeId = building.id;
        unit.trade.pendingHomeId = null;
        unit.trade.paused = false;
        if (unit.trade.homeId && unit.trade.destId) {
          startTraderLeg(match, unit, "toDest");
        }
      }
    }

    if (payload.type === "setTradeDestination") {
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) return;
      const building = getBuildingById(match, buildingId);
      if (!building || building.type !== "TradePost") return;
      for (const unitId of normalizeIdArray(payload.unitIds)) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index || unit.type !== "Trader") continue;
        if (!unit.trade) {
          unit.trade = {
            homeId: null,
            destId: null,
            pendingHomeId: null,
            pendingDestId: null,
            leg: null,
            nextGold: 0,
            paused: false,
          };
        }
        unit.trade.destId = building.id;
        unit.trade.pendingDestId = null;
        unit.trade.paused = false;
        if (unit.trade.homeId && unit.trade.destId) {
          startTraderLeg(match, unit, "toDest");
        }
      }
    }

    if (payload.type === "restartTrading") {
      let restarted = 0;
      for (const unitId of normalizeIdArray(payload.unitIds)) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index || unit.type !== "Trader") continue;
        if (!unit.trade || !unit.trade.homeId || !unit.trade.destId) continue;
        unit.trade.paused = false;
        unit.trade.pendingHomeId = null;
        unit.trade.pendingDestId = null;
        startTraderLeg(match, unit, "toDest");
        restarted += 1;
      }
      if (typeof ack === "function") {
        if (!restarted) {
          ack({ ok: false, reason: "no_route" });
        } else {
          ack({ ok: true });
        }
      }
      if (restarted) {
        io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
      }
    }

    if (payload.type === "build") {
      const def = BUILDINGS[payload.buildingType];
      if (!def) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      const isAgeLandmark = isLandmarkType(payload.buildingType);
      if (isAgeLandmark) {
        if ((player.ageTier ?? 0) >= 4) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "age_max" });
          }
          return;
        }
        const choices = player.landmarkChoices || [];
        if (!choices.includes(payload.buildingType)) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "invalid_landmark" });
          }
          return;
        }
        if (player.landmarkBuiltAges?.[payload.buildingType]) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "landmark_already_built" });
          }
          return;
        }
        if (hasLandmarkPlaced(match, player.index, payload.buildingType)) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "landmark_already_built" });
          }
          return;
        }
        if (hasLandmarkUnderConstruction(match, player.index)) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "landmark_under_construction" });
          }
          return;
        }
      }
      if (
        typeof def.minAgeTier === "number" &&
        (player.ageTier ?? 0) < def.minAgeTier
      ) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "age_required" });
        }
        return;
      }
      if (def.requiresTech && !player.techs?.[def.requiresTech]) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "tech_required" });
        }
        return;
      }
      const buildCost = getBuildingCostForPlayer(match, player, payload.buildingType);
      if (!canAfford(player, buildCost)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "insufficient_resources" });
        }
        return;
      }
      const builders = normalizeIdArray(payload.builderIds)
        .map((id) => getUnitById(match, id))
        .filter(
          (unit) =>
            unit && unit.ownerId === player.index && unit.type === "Villager"
        );
      if (!builders.length) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "no_builders" });
        }
        return;
      }
      const xRaw = Number(payload.x);
      const yRaw = Number(payload.y);
      if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_location" });
        }
        return;
      }
      const x = Math.floor(xRaw);
      const y = Math.floor(yRaw);
      if (!isPlacementValid(match, payload.buildingType, x, y)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_location" });
        }
        return;
      }

      applyCost(player, buildCost);
      const building = createBuilding(
        player.index,
        payload.buildingType,
        x,
        y,
        match
      );
      building.costPaid = buildCost ? { ...buildCost } : null;
      if (isAgeLandmark) {
        const landmarkAgeTier = getLandmarkNextAgeTier(player);
        building.landmarkAgeTier = landmarkAgeTier;
        if (building.type === "DominionSpire") {
          building.maxHp = getDominionSpireMaxHpForAge(player, landmarkAgeTier);
        }
      }
      building.buildTime = getBuildingBuildTimeForPlayer(player, payload.buildingType);
      building.isUnderConstruction = building.buildTime > 0;
      building.buildProgress = 0;
      building.hp = building.isUnderConstruction ? 1 : building.maxHp;
      match.buildings.push(building);
      for (const builder of builders) {
        issueUnitOrder(builder, { type: "build", buildingId: building.id }, false);
      }
      io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
      if (typeof ack === "function") {
        ack({ ok: true });
      }
    }

    if (payload.type === "assignBuild") {
      const queue = !!payload.queue;
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) return;
      const building = getBuildingById(match, buildingId);
      if (!building || building.ownerId !== player.index) return;
      if (!building.isUnderConstruction) return;
      const builders = normalizeIdArray(payload.builderIds)
        .map((id) => getUnitById(match, id))
        .filter(
          (unit) =>
            unit && unit.ownerId === player.index && unit.type === "Villager"
        );
      if (!builders.length) return;
      for (const builder of builders) {
        issueUnitOrder(builder, { type: "build", buildingId: building.id }, queue);
      }
    }

    if (payload.type === "repair") {
      const queue = !!payload.queue;
      let targetOrder = null;
      if (payload.buildingId != null) {
        const buildingId = normalizeId(payload.buildingId);
        if (buildingId === null) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "invalid_building" });
          }
          return;
        }
        const building = getBuildingById(match, buildingId);
        if (
          !building ||
          building.ownerId !== player.index ||
          building.isUnderConstruction
        ) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "invalid_building" });
          }
          return;
        }
        const maxHp =
          building.maxHp ||
          getBuildingMaxHpForOwner(match, player.index, building.type);
        if ((building.hp ?? 0) >= maxHp) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "not_damaged" });
          }
          return;
        }
        targetOrder = { type: "repair", buildingId: building.id };
      } else if (payload.unitId != null) {
        const unitId = normalizeId(payload.unitId);
        if (unitId === null) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "invalid_unit" });
          }
          return;
        }
        const targetUnit = getUnitById(match, unitId);
        if (
          !targetUnit ||
          targetUnit.ownerId !== player.index ||
          !isSiegeUnitType(targetUnit.type)
        ) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "invalid_unit" });
          }
          return;
        }
        const maxHp = targetUnit.maxHp || UNITS[targetUnit.type]?.health || 1;
        if ((targetUnit.hp ?? 0) >= maxHp) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "not_damaged" });
          }
          return;
        }
        targetOrder = { type: "repair", unitId: targetUnit.id };
      } else {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_target" });
        }
        return;
      }

      const builders = normalizeIdArray(payload.builderIds)
        .map((id) => getUnitById(match, id))
        .filter(
          (unit) =>
            unit && unit.ownerId === player.index && unit.type === "Villager"
        );
      if (!builders.length) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "no_builders" });
        }
        return;
      }
      for (const builder of builders) {
        issueUnitOrder(builder, targetOrder, queue);
      }
      if (typeof ack === "function") {
        ack({ ok: true });
      }
    }

    if (payload.type === "cancelBuild") {
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) return;
      const building = getBuildingById(match, buildingId);
      if (!building || building.ownerId !== player.index) return;
      if (!building.isUnderConstruction) return;
      const def = BUILDINGS[building.type];
      const refundCost = normalizeCost(building.costPaid || def?.cost);
      if (refundCost) {
        for (const [key, value] of Object.entries(refundCost)) {
          player.resources[key] = (player.resources[key] || 0) + value;
        }
      }
      for (const unit of match.units) {
        if (
          unit.order &&
          unit.order.type === "build" &&
          unit.order.buildingId === building.id
        ) {
          unit.order = null;
        }
      }
      match.buildings = match.buildings.filter((b) => b.id !== building.id);
      io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
    }

    if (payload.type === "farmAssign") {
      const queue = !!payload.queue;
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) return;
      const building = getBuildingById(match, buildingId);
      if (!building || building.ownerId !== player.index) return;
      if (building.type !== "Farm") return;
      if (building.isUnderConstruction) return;
      if (building.farmerId) return;
      const builder = normalizeIdArray(payload.builderIds)
        .map((id) => getUnitById(match, id))
        .find(
          (unit) =>
            unit && unit.ownerId === player.index && unit.type === "Villager"
        );
      if (!builder) return;
      building.farmerId = builder.id;
      issueUnitOrder(builder, { type: "farm", buildingId: building.id }, queue);
    }


    if (payload.type === "cheat") {
      if (!match.singleplayer && !match.allowCheats) return;
      if (match.singleplayer && match.hostId !== socket.id) return;
      const spawnOnlyActions = new Set([
        "spawn_enemy",
        "spawn_castle",
        "spawn_disruptor_cannon",
        "enemy_attack_move",
      ]);
      if (!match.singleplayer && spawnOnlyActions.has(payload.action)) {
        return;
      }
      const action = payload.action;
      if (action === "grant_food") {
        player.resources.food += 10000;
      } else if (action === "grant_wood") {
        player.resources.wood += 10000;
      } else if (action === "grant_gold") {
        player.resources.gold += 10000;
      } else if (action === "grant_stone") {
        player.resources.stone += 10000;
      } else if (action === "spawn_enemy") {
        const enemyId = player.index === 0 ? 1 : 0;
        const unitType = payload.unitType;
        const spawnPoint = normalizeWorldPoint({ x: payload.x, y: payload.y });
        if (UNITS[unitType] && spawnPoint) {
          match.units.push(
            createUnit(enemyId, unitType, spawnPoint.x, spawnPoint.y, null, match)
          );
        }
      } else if (action === "spawn_castle") {
        const enemyId = player.index === 0 ? 1 : 0;
        const spawnPoint = normalizeWorldPoint({ x: payload.x, y: payload.y });
        if (!spawnPoint) return;
        const x = Math.floor(spawnPoint.x);
        const y = Math.floor(spawnPoint.y);
        if (
          isPlacementValid(match, "Castle", x, y)
        ) {
          match.buildings.push(createBuilding(enemyId, "Castle", x, y, match));
        }
      } else if (action === "spawn_disruptor_cannon") {
        const enemyId = player.index === 0 ? 1 : 0;
        const spawnPoint = normalizeWorldPoint({ x: payload.x, y: payload.y });
        if (!spawnPoint) return;
        const x = Math.floor(spawnPoint.x);
        const y = Math.floor(spawnPoint.y);
        if (isPlacementValid(match, "DisruptorCannon", x, y)) {
          match.buildings.push(
            createBuilding(enemyId, "DisruptorCannon", x, y, match)
          );
        }
      } else if (action === "enemy_attack_move") {
        const target = normalizeWorldPoint(payload.target);
        if (!target) return;
        const enemyId = player.index === 0 ? 1 : 0;
        for (const unit of match.units) {
          if (unit.ownerId === enemyId) {
            unit.order = { type: "attackMove", target };
          }
        }
      } else if (action === "reveal_fog") {
        match.fogReveal = true;
      } else if (action === "instant_build") {
        match.fastBuild = true;
        for (const building of match.buildings) {
          if (building.productionQueue && building.productionQueue.length) {
            for (const job of building.productionQueue) {
              const fastTime = job.techId ? 1 : 0.1;
              job.remaining = Math.min(job.remaining ?? fastTime, fastTime);
              job.total = fastTime;
            }
          }
        }
      }
    }

    if (payload.type === "garrison") {
      const queue = !!payload.queue;
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) return;
      const building = getBuildingById(match, buildingId);
      if (!building || building.ownerId !== player.index) return;
      if (building.isUnderConstruction || isDestroyedLandmark(building)) return;
      const capacity = getGarrisonCapacity(building);
      if (capacity <= 0) return;
      const available = capacity - building.garrison.length;
      if (available <= 0) return;
      const unitIds = normalizeIdArray(payload.unitIds);
      const toGarrison = [];
      for (const unitId of unitIds) {
        const unit = getUnitById(match, unitId);
        if (!unit || unit.ownerId !== player.index) continue;
        if (!canGarrison(unit)) continue;
        toGarrison.push(unit);
        if (toGarrison.length >= available) break;
      }
      if (!toGarrison.length) return;
      for (const unit of toGarrison) {
        issueUnitOrder(unit, { type: "garrison", buildingId: building.id }, queue);
      }
    }

    if (payload.type === "ungarrison") {
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) return;
      const building = getBuildingById(match, buildingId);
      if (!building || building.ownerId !== player.index) return;
      if (!building.garrison.length) return;
      const countRaw = Number(payload.count);
      const count = Number.isFinite(countRaw)
        ? Math.max(1, Math.min(Math.trunc(countRaw), building.garrison.length))
        : building.garrison.length;
      ungarrisonUnits(match, building, count);
    }

    if (payload.type === "produce") {
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      const building = getBuildingById(match, buildingId);
      if (!building || building.ownerId !== player.index) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      if (building.isUnderConstruction) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "building_incomplete" });
        }
        return;
      }
      if (isDestroyedLandmark(building)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "building_destroyed" });
        }
        return;
      }
      const buildingDef = BUILDINGS[building.type];
      if (!buildingDef.produce) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "cannot_produce_here" });
        }
        return;
      }
      if (!buildingDef.produce.includes(payload.unitType)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_unit_type" });
        }
        return;
      }
      const unitDef = UNITS[payload.unitType];
      if (!unitDef) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "unknown_unit" });
        }
        return;
      }
      const minTier = getUnitMinAgeForPlayer(player, payload.unitType);
      if (typeof minTier === "number" && (player.ageTier ?? 0) < minTier) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "age_required" });
        }
        return;
      }
      if (unitDef.requiresTech && !player.techs?.[unitDef.requiresTech]) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "tech_required" });
        }
        return;
      }
      const unitCost = getUnitCostForPlayer(
        match,
        player,
        payload.unitType,
        building
      );
      if (!canAfford(player, unitCost)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "insufficient_resources" });
        }
        return;
      }
      applyCost(player, unitCost);
      const buildTime = getUnitProductionTimeForPlayer(
        match,
        player,
        payload.unitType,
        building
      );
      building.productionQueue.push({
        unitType: payload.unitType,
        remaining: buildTime,
        total: buildTime,
        cost: unitCost,
      });

      io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
      if (typeof ack === "function") {
        ack({ ok: true });
      }
    }

    if (payload.type === "cancelQueue") {
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      const building = getBuildingById(match, buildingId);
      if (!building || building.ownerId !== player.index) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      const index = payload.index;
      if (typeof index !== "number") {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_index" });
        }
        return;
      }
      if (index < 0 || index >= building.productionQueue.length) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_index" });
        }
        return;
      }
      const item = building.productionQueue[index];
      if (item?.unitType) {
        const refundCost = normalizeCost(
          item.cost ||
          getUnitCostForPlayer(match, player, item.unitType, building)
        );
        if (refundCost) {
          for (const [key, value] of Object.entries(refundCost)) {
            player.resources[key] = (player.resources[key] || 0) + value;
          }
        }
      } else if (item?.techId) {
        const refundCost = normalizeCost(
          item.cost || getTechnologyCostForPlayer(player, item.techId)
        );
        if (refundCost) {
          for (const [key, value] of Object.entries(refundCost)) {
            player.resources[key] = (player.resources[key] || 0) + value;
          }
        }
      }
      building.productionQueue.splice(index, 1);
      io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
      if (typeof ack === "function") {
        ack({ ok: true });
      }
    }

    if (payload.type === "clearRally") {
      const requestedIds = normalizeIdsFromArrayOrSingle(
        payload.buildingIds,
        payload.buildingId
      );
      const ownedBuildings = requestedIds
        .map((id) => getBuildingById(match, id))
        .filter((building) => building && building.ownerId === player.index);
      if (!ownedBuildings.length) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      for (const building of ownedBuildings) {
        building.rallyPoint = null;
        building.attackTargetId = null;
      }
      io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
      if (typeof ack === "function") {
        ack({ ok: true, count: ownedBuildings.length });
      }
    }

    if (payload.type === "setFountainMode") {
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      const building = getBuildingById(match, buildingId);
      if (
        !building ||
        building.ownerId !== player.index ||
        building.type !== "GoldenFountainSquare" ||
        isDestroyedLandmark(building)
      ) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      const kind = String(payload.kind || "").toLowerCase();
      if (!["food", "wood", "gold"].includes(kind)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_mode" });
        }
        return;
      }
      building.convertResourceKind = kind;
      io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
      if (typeof ack === "function") {
        ack({ ok: true });
      }
    }

    if (payload.type === "rally") {
      const target = normalizeWorldPoint(payload.target);
      if (!target) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_target" });
        }
        return;
      }
      const requestedIds = normalizeIdsFromArrayOrSingle(
        payload.buildingIds,
        payload.buildingId
      );
      const ownedBuildings = requestedIds
        .map((id) => getBuildingById(match, id))
        .filter(
          (building) =>
            building &&
            building.ownerId === player.index &&
            !isDestroyedLandmark(building)
        );
      if (!ownedBuildings.length) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      const resource = findResourceAt(match, target.x, target.y);
      for (const building of ownedBuildings) {
        building.rallyPoint = {
          x: target.x,
          y: target.y,
          resourceId: resource ? resource.id : null,
        };
        building.attackTargetId = null;
      }
      io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
      if (typeof ack === "function") {
        ack({ ok: true, count: ownedBuildings.length });
      }
    }

    if (payload.type === "research") {
      const techId = payload.techId;
      const tech = TECHNOLOGIES[techId];
      if (!tech) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "unknown_tech" });
        }
        return;
      }
      const buildingId = normalizeId(payload.buildingId);
      if (buildingId === null) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      const building = getBuildingById(match, buildingId);
      if (!building || building.ownerId !== player.index) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "invalid_building" });
        }
        return;
      }
      if (building.isUnderConstruction) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "building_incomplete" });
        }
        return;
      }
      if (isDestroyedLandmark(building)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "building_destroyed" });
        }
        return;
      }
      const buildingDef = BUILDINGS[building.type];
      if (
        !buildingDef.research ||
        !buildingDef.research.includes(techId)
      ) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "cannot_research_here" });
        }
        return;
      }
      if (player.techs?.[techId]) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "already_researched" });
        }
        return;
      }
      if (tech.requiresTech && !player.techs?.[tech.requiresTech]) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "tech_prereq" });
        }
        return;
      }
      if (
        typeof tech.minAgeTier === "number" &&
        (player.ageTier ?? 0) < tech.minAgeTier
      ) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "age_required" });
        }
        return;
      }
      if (typeof tech.ageTier === "number") {
        const currentTier = player.ageTier ?? 0;
        if (tech.ageTier !== currentTier + 1) {
          if (typeof ack === "function") {
            ack({ ok: false, reason: "age_order" });
          }
          return;
        }
      }
      if (tech.scope === "building" && building.techs?.[techId]) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "already_researched" });
        }
        return;
      }
      if (
        isTechInProgress(
          match,
          player.index,
          techId,
          tech.scope === "building" ? building.id : null
        )
      ) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "already_researching" });
        }
        return;
      }
      const techCost = getTechnologyCostForPlayer(player, techId);
      if (!canAfford(player, techCost)) {
        if (typeof ack === "function") {
          ack({ ok: false, reason: "insufficient_resources" });
        }
        return;
      }
      applyCost(player, techCost);
      const researchTime = match.fastBuild ? 1 : tech.researchTime || 0;
      building.productionQueue.push({
        techId,
        remaining: researchTime,
        total: researchTime,
        cost: techCost,
      });
      io.to(match.id).emit("stateUpdate", getEntitySnapshot(match));
      if (typeof ack === "function") {
        ack({ ok: true });
      }
    }

    if (payload.type === "resign") {
      const matchId = socket.matchId;
      if (!matchId || !matches.has(matchId)) return;
      const resignedMatch = matches.get(matchId);
      const resignedIndex = player.index;
      eliminatePlayer(resignedMatch, player.index, "resigned");
      socket.to(matchId).emit("playerResigned", {
        playerIndex: resignedIndex,
        label: `Player ${resignedIndex + 1}`,
      });
      const outcome = getMatchOutcome(resignedMatch);
      if (outcome) {
        io.to(matchId).emit("matchEnded", outcome);
        cleanupMatch(matchId);
      } else {
        io.to(matchId).emit("stateUpdate", getEntitySnapshot(resignedMatch));
      }
    }
  });

  socket.on("disconnect", () => {
    const matchId = socket.matchId;
    if (matchId && matches.has(matchId)) {
      const match = matches.get(matchId);
      const player = match.players.find((p) => p.id === socket.id);
      if (player && !player.eliminated) {
        eliminatePlayer(match, player.index, "player_disconnected");
      }
      const outcome = getMatchOutcome(match);
      if (outcome) {
        io.to(matchId).emit("matchEnded", outcome);
        cleanupMatch(matchId);
      } else {
        io.to(matchId).emit("stateUpdate", getEntitySnapshot(match));
      }
    } else {
      if (socket.lobbyId) {
        leaveLobby(socket, "disconnect");
      }
      removeFromQueue(socket);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`RTS server running on http://localhost:${PORT}`);
});
  function parsePattern(patternRows) {
    return patternRows.map((row) =>
      row.split("").map((cell) => (cell === "x" ? 1 : 0))
    );
  }

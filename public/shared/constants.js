export const MAP = {
  width: 100,
  height: 100,
  tileSize: 80,
}; 

export const DEFAULT_SIGHT = 4;
export const DEFAULT_BUILDING_RANGED_ARMOR = 50;
export const AGE_ORDER = [
  "Copper Era",
  "Iron Era",
  "Diamond Era",
  "Emerald Era",
  "Enlightened Era",
];
export const AGE_UP_COSTS = {
  1: { food: 200, wood: 200, gold: 200 },
  2: { food: 500, wood: 500, gold: 500 },
  3: { food: 1000, wood: 1000, gold: 1000 },
  4: { food: 2000, wood: 2000, gold: 2000 },
};
export const LANDMARK_POOL = [
  "GroveUniversity",
  "ArgentThroneComplex",
  "DominionSpire",
  "OldMarketPavilion",
  "SanctumOfTheVeil",
  "BasilicaOfEternalLight",
  "EvermistGardens",
  "GoldenFountainSquare",
];

export const PLAYER_COLORS = ["#2c7be5", "#e25555"];
export const PLAYER_COLOR_OPTIONS = [
  { id: "blue", name: "Blue", hex: "#2c7be5" },
  { id: "red", name: "Red", hex: "#e25555" },
  { id: "yellow", name: "Yellow", hex: "#f1c40f" },
  { id: "purple", name: "Purple", hex: "#9b59b6" },
  { id: "lightgreen", name: "Light Green", hex: "#7bed9f" },
];

export const RESOURCE_DEFS = {
  BERRY: { kind: "food", amount: 250, size: 1, color: "#c0392b" },
  TREE: { kind: "wood", amount: 150, size: 1, color: "#6f4e37" },
  GOLD: { kind: "gold", amount: 4000, size: 3, color: "#f1c40f" },
  STONE: { kind: "stone", amount: 1200, size: 3, color: "#7f8c8d" },
};

export const RESOURCE_SPAWN_RULES = {
  berryGroups: 12,
  berryGroupMin: 6,
  berryGroupMax: 8,
  treeForests: 10,
  treeForestMin: 15,
  treeForestMax: 25,
  goldMines: 7,
  stoneMines: 7,
};

export const BUILDINGS = {
  TownCenter: {
    name: "Town Center",
    size: 4,
    health: 5000,
    sight: 15,
    tag: "Landmark",
    accepts: ["food", "wood", "gold", "stone"],
    attack: { damage: 8, range: 8, cooldown: 2 },
    produce: ["Villager", "Scout"],
    research: ["CarryingFrame"],
    image: "/images/buildings/town-center.png",
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
  },
  Farm: {
    name: "Farm",
    size: 2,
    health: 300,
    buildTime: 6,
    cost: { wood: 75 },
    image: "/images/buildings/farm.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
  },
  House: {
    name: "House",
    size: 2,
    health: 1000,
    buildTime: 15,
    cost: { wood: 50 },
    image: "/images/buildings/house.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    tag: "Population Building",
  },
  Mill: {
    name: "Mill",
    size: 2,
    health: 1200,
    buildTime: 15,
    cost: { wood: 50 },
    accepts: ["food"],
    image: "/images/buildings/mill.png",
    sight: DEFAULT_SIGHT,
    research: ["Basketry", "Agriculture", "ImprovedProcessing"],
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
  },
  LumberCamp: {
    name: "Lumber Camp",
    size: 2,
    health: 1200,
    buildTime: 15,
    cost: { wood: 50 },
    accepts: ["wood"],
    image: "/images/buildings/lumber-camp.png",
    sight: DEFAULT_SIGHT,
    research: ["OakHandle", "DoubleHeadedAxe", "WoodSaws"],
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
  },
  MiningCamp: {
    name: "Mining Camp",
    size: 2,
    health: 1200,
    buildTime: 15,
    cost: { wood: 50 },
    accepts: ["gold", "stone"],
    image: "/images/buildings/mining-camp.png",
    sight: DEFAULT_SIGHT,
    research: ["CarbideTip", "HeavySwings", "TungstenTip"],
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
  },
  Market: {
    name: "Market",
    size: 4,
    health: 1000,
    buildTime: 20,
    cost: { wood: 100 },
    image: "/images/buildings/market.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    minAgeTier: 1,
    produce: ["Trader"],
  },
  Monastery: {
    name: "Monastery",
    size: 4,
    health: 2000,
    buildTime: 30,
    cost: { wood: 200 },
    produce: ["Monk"],
    image: "/images/buildings/monastery.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    minAgeTier: 2,
    tag: "Religious Building",
  },
  TradePost: {
    name: "Trade Post",
    size: 4,
    health: 1,
    image: "/images/buildings/trade.png",
    tag: "Trade Site",
    sight: DEFAULT_SIGHT,
    rangedArmor: 0,
    isNeutral: true,
    isInvulnerable: true,
  },
  GroveUniversity: {
    name: "Grove University",
    size: 4,
    health: 5000,
    buildTime: 120,
    cost: { food: 200, wood: 200, gold: 200 },
    image: "/images/buildings/landmark.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    tag: "Technology Landmark",
    isAgeLandmark: true,
    research: ["GreaterRations", "SecondWind", "BedrockFoundations"],
  },
  ArgentThroneComplex: {
    name: "Argent Throne Complex",
    size: 4,
    health: 5000,
    buildTime: 120,
    cost: { food: 200, wood: 200, gold: 200 },
    image: "/images/buildings/landmark.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    tag: "Military Landmark",
    isAgeLandmark: true,
    produce: ["Spearman", "ManAtArms"],
    research: [
      "SpearmanIron",
      "SpearmanDiamond",
      "SpearmanEmerald",
      "SpearmanEnlightened",
      "ManAtArmsEmerald",
      "ManAtArmsEnlightened",
    ],
  },
  DominionSpire: {
    name: "Dominion Spire",
    size: 4,
    health: 5000,
    buildTime: 120,
    cost: { food: 200, wood: 200, gold: 200 },
    image: "/images/buildings/landmark.png",
    sight: 10,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    tag: "Defensive Landmark",
    isAgeLandmark: true,
    attack: { damage: 0, range: 8, cooldown: 0.5, volley: 0 },
    research: ["SpringaldEmplacement"],
  },
  OldMarketPavilion: {
    name: "Old Market Pavilion",
    size: 4,
    health: 5000,
    buildTime: 120,
    cost: { food: 200, wood: 200, gold: 200 },
    image: "/images/buildings/landmark.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    tag: "Economic Landmark",
    isAgeLandmark: true,
    accepts: ["food"],
  },
  SanctumOfTheVeil: {
    name: "Sanctum of the Veil",
    size: 4,
    health: 5000,
    buildTime: 120,
    cost: { food: 200, wood: 200, gold: 200 },
    image: "/images/buildings/landmark.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    tag: "Religious Landmark",
    isAgeLandmark: true,
    produce: ["Monk"],
    relicCapacity: 3,
    relicIncome: { gold: 4, interval: 3 },
  },
  BasilicaOfEternalLight: {
    name: "Basilica of Eternal Light",
    size: 4,
    health: 5000,
    buildTime: 120,
    cost: { food: 200, wood: 200, gold: 200 },
    image: "/images/buildings/landmark.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    tag: "Military Landmark",
    isAgeLandmark: true,
  },
  EvermistGardens: {
    name: "Evermist Gardens",
    size: 4,
    health: 5000,
    buildTime: 120,
    cost: { food: 200, wood: 200, gold: 200 },
    image: "/images/buildings/landmark.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    tag: "Religious Landmark",
    isAgeLandmark: true,
    relicCapacity: 3,
  },
  GoldenFountainSquare: {
    name: "Golden Fountain Square",
    size: 4,
    health: 5000,
    buildTime: 120,
    cost: { food: 200, wood: 200, gold: 200 },
    image: "/images/buildings/landmark.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    tag: "Economic Landmark",
    isAgeLandmark: true,
    accepts: ["food", "wood", "gold", "stone"],
  },
  Barracks: {
    name: "Barracks",
    size: 3,
    health: 1800,
    buildTime: 30,
    cost: { wood: 100 },
    produce: ["Spearman", "ManAtArms"],
    image: "/images/buildings/barracks.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    research: [
      "SpearmanIron",
      "SpearmanDiamond",
      "SpearmanEmerald",
      "SpearmanEnlightened",
      "ManAtArmsEmerald",
      "ManAtArmsEnlightened",
    ],
  },
  Armory: {
    name: "Armory",
    size: 4,
    health: 1800,
    buildTime: 20,
    cost: { wood: 150 },
    minAgeTier: 1,
    image: "/images/buildings/armory.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    research: [
      "IronForging",
      "LightweightShafts",
      "ChainmailArmor",
      "LeatherPadding",
      "DiamondForging",
      "EmeraldForging",
      "EnlightenedForging",
      "PiercingPoints",
      "Aerodynamic",
      "BodkinBolts",
      "DiamondArmor",
      "EmeraldArmor",
      "EnlightenedArmor",
      "ImprovedShields",
      "DeflectiveScales",
      "GildedFittings",
    ],
  },
  TechLab: {
    name: "Tech Lab",
    size: 4,
    health: 2000,
    buildTime: 60,
    cost: { wood: 400 },
    image: "/images/buildings/tech_lab.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    minAgeTier: 3,
    tag: "Technology Building",
    research: [
      "Resourcefulness",
      "RapidFabrications",
      "AdvancedRadar",
      "ImprovedGunpowder",
      "SuperWeapons",
    ],
  },
  ArcheryRange: {
    name: "Archery Range",
    size: 3,
    health: 1600,
    buildTime: 30,
    cost: { wood: 150 },
    produce: ["Archer", "Crossbowman", "Handcannoneer"],
    image: "/images/buildings/archery.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    minAgeTier: 1,
    research: [
      "ArcherDiamond",
      "ArcherEmerald",
      "ArcherEnlightened",
      "CrossbowmanEmerald",
      "CrossbowmanEnlightened",
      "HandcannoneerEnlightened",
    ],
  },
  Stable: {
    name: "Stable",
    size: 3,
    health: 1600,
    buildTime: 30,
    cost: { wood: 150 },
    produce: ["Horseman", "Knight"],
    image: "/images/buildings/stable.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    minAgeTier: 1,
    research: [
      "HorsemanDiamond",
      "HorsemanEmerald",
      "HorsemanEnlightened",
      "KnightEmerald",
      "KnightEnlightened",
    ],
  },
  SiegeWorkshop: {
    name: "Siege Workshop",
    size: 3,
    health: 2000,
    buildTime: 45,
    cost: { wood: 250 },
    produce: ["CounterweightTrebuchet", "Cannon"],
    image: "/images/buildings/siege.png",
    sight: DEFAULT_SIGHT,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    minAgeTier: 2,
  },
  Outpost: {
    name: "Outpost",
    size: 2,
    health: 1200,
    buildTime: 40,
    cost: { wood: 100 },
    image: "/images/buildings/outpost.png",
    sight: 15,
    attack: { damage: 0, range: 6, cooldown: 2, volley: 0 },
    research: ["Arrowslits", "SpringaldEmplacement"],
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
  },
  StoneTower: {
    name: "Stone Tower",
    size: 3,
    health: 3000,
    buildTime: 60,
    cost: { stone: 300 },
    image: "/images/buildings/stonetower.png",
    sight: 12,
    attack: { damage: 0, range: 7, cooldown: 2, volley: 0 },
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    minAgeTier: 1,
  },
  Castle: {
    name: "Castle",
    size: 4,
    health: 5000,
    buildTime: 150,
    cost: { stone: 900 },
    attack: { damage: 12, range: 8, cooldown: 0.5, volley: 3 },
    image: "/images/buildings/keep.png",
    sight: 10,
    research: ["SpringaldEmplacement"],
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    minAgeTier: 2,
  },
  DisruptorCannon: {
    name: "Disruptor Cannon",
    size: 3,
    health: 4000,
    buildTime: 90,
    cost: { stone: 800, gold: 800 },
    image: "/images/buildings/disruptor_cannon.png",
    sight: 15,
    rangedArmor: DEFAULT_BUILDING_RANGED_ARMOR,
    minAgeTier: 4,
    requiresTech: "SuperWeapons",
    attack: {
      damage: 50,
      range: 20,
      minRange: 5,
      cooldown: 10,
      volley: 1,
      splashRadius: 1.5,
      splashFalloff: [
        { radius: 0.5, scale: 1 },
        { radius: 1, scale: 0.66 },
        { radius: 1.5, scale: 0.33 },
      ],
    },
  },
};

export const BUILDING_CATEGORIES = {
  economy: ["Farm", "House", "Mill", "LumberCamp", "MiningCamp", "Market", "Monastery"],
  military: [
    "Barracks",
    "ArcheryRange",
    "Stable",
    "SiegeWorkshop",
    "Armory",
    "TechLab",
  ],
  defensive: ["Outpost", "StoneTower", "Castle", "DisruptorCannon"],
};

export const BUILDING_DESCRIPTIONS = {
  TownCenter: "Produces worker units and acts as a drop-off building for all resources.",
  Farm: "Infinite food source. One villager can gather at a time.",
  House: "Increases maximum population by 10.",
  Mill: "Villagers can drop off Food at this building.",
  LumberCamp: "Villagers can drop off Wood at this building.",
  MiningCamp: "Villagers can drop off Gold and Stone at this building.",
  Market: "Produces traders and allows trading with this location.",
  Monastery: "Produces religious units. Religious units can place Relics in this building to generate resources.",
  TradePost: "Send traders to this location to generate resources.",
  Barracks: "Produces melee infantry units.",
  Armory: "Researches military technologies.",
  TechLab: "Researches advanced technologies.",
  ArcheryRange: "Produces ranged infantry units.",
  Stable: "Produces cavalry units.",
  SiegeWorkshop: "Produces siege units.",
  Outpost: "Light garrison position with long line of sight.",
  StoneTower: "Heavy defensive tower equipped with a springald.",
  Castle: "Heavy defensive building. Can be upgraded with additional emplacements.",
  DisruptorCannon: "Heavy artillery.",
};

export const LANDMARK_BONUSES = {
  GroveUniversity: {
    techCostReductionByAge: [0.1, 0.15, 0.25, 0.4],
    techCostByAge: [
      { food: 50, gold: 100 },
      { food: 100, gold: 200 },
      { food: 250, gold: 500 },
      { food: 400, gold: 1000 },
    ],
  },
  ArgentThroneComplex: {
    productionSpeedBonusByAge: [1, 3, 8, 15],
    infantryHealthBonusByAge: [0.1, 0.2, 0.3, 0.4],
  },
  DominionSpire: {
    hpByAge: [5000, 6000, 7000, 8000],
    arrowslitsByAge: [2, 3, 4, 5],
    arrowslitDamageByAge: [10, 12, 16, 20],
    garrisonByAge: [8, 15, 20, 25],
  },
  OldMarketPavilion: {
    foodToGoldByAge: [0.3, 0.6, 0.8, 1.2],
  },
  SanctumOfTheVeil: {
    auraRange: 6,
    auraHealByAge: [6, 10, 20, 35],
    religiousCostReductionByAge: [0.2, 0.5, 0.7, 0.8],
  },
  BasilicaOfEternalLight: {
    auraHealByAge: [1, 2, 3, 4],
    auraDamageByAge: [0.1, 0.2, 0.3, 0.4],
    auraRange: 15,
  },
  EvermistGardens: {
    incomePerMinuteByAge: [
      { gold: 60, wood: 20, food: 20, stone: 20 },
      { gold: 80, wood: 60, food: 60, stone: 40 },
      { gold: 200, wood: 160, food: 160, stone: 80 },
      { gold: 300, wood: 200, food: 200, stone: 100 },
    ],
  },
  GoldenFountainSquare: {
    auraRange: 6,
    gatherRateBonusByAge: [0.2, 0.4, 0.7, 1],
  },
};

function clampDescriptionIndex(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function formatDescriptionNumber(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value - Math.round(value)) < 0.01) {
    return `${Math.round(value)}`;
  }
  return value.toFixed(1);
}

function formatDescriptionPercent(value) {
  return `${formatDescriptionNumber((value || 0) * 100)}%`;
}

function formatDescriptionCost(cost) {
  if (!cost) return "Free";
  const parts = [];
  if (cost.food) parts.push(`${formatDescriptionNumber(cost.food)} food`);
  if (cost.wood) parts.push(`${formatDescriptionNumber(cost.wood)} wood`);
  if (cost.gold) parts.push(`${formatDescriptionNumber(cost.gold)} gold`);
  if (cost.stone) parts.push(`${formatDescriptionNumber(cost.stone)} stone`);
  return parts.join(", ") || "Free";
}

export function getLandmarkDescriptionForTier(buildingType, ageTier = 1) {
  const idx = clampDescriptionIndex((Number(ageTier) || 1) - 1, 0, 3);
  switch (buildingType) {
    case "GroveUniversity": {
      const reduction =
        LANDMARK_BONUSES?.GroveUniversity?.techCostReductionByAge?.[idx] || 0;
      const techCost =
        LANDMARK_BONUSES?.GroveUniversity?.techCostByAge?.[idx] || null;
      return `Reduces research cost of all technologies by ${formatDescriptionPercent(
        reduction
      )}. Contains technologies unique to this landmark.`;
    }
    case "ArgentThroneComplex": {
      const speedBonus =
        LANDMARK_BONUSES?.ArgentThroneComplex?.productionSpeedBonusByAge?.[
          idx
        ] || 0;
      const hpBonus =
        LANDMARK_BONUSES?.ArgentThroneComplex?.infantryHealthBonusByAge?.[
          idx
        ] || 0;
      return `Acts as a Barracks that produces ${formatDescriptionNumber(
        speedBonus * 100
      )}% faster. Infantry produced here have +${formatDescriptionPercent(
        hpBonus
      )} health.`;
    }
    case "DominionSpire": {
      const hp = LANDMARK_BONUSES?.DominionSpire?.hpByAge?.[idx] || 5000;
      const arrows =
        LANDMARK_BONUSES?.DominionSpire?.arrowslitsByAge?.[idx] || 2;
      const arrowslitDamage =
        LANDMARK_BONUSES?.DominionSpire?.arrowslitDamageByAge?.[idx] || 10;
      const garrison =
        LANDMARK_BONUSES?.DominionSpire?.garrisonByAge?.[idx] || 8;
      return `Defensive building with increased health, garrison space and arrow fire.`;
    }
    case "OldMarketPavilion": {
      const extraGold =
        LANDMARK_BONUSES?.OldMarketPavilion?.foodToGoldByAge?.[idx] || 0;
      return `Acts as a Mill. Generates gold equal to ${formatDescriptionPercent(
        extraGold
      )} of Food dropped off.`;
    }
    case "SanctumOfTheVeil": {
      const heal =
        LANDMARK_BONUSES?.SanctumOfTheVeil?.auraHealByAge?.[idx] || 0;
      const range = LANDMARK_BONUSES?.SanctumOfTheVeil?.auraRange || 6;
      const discount =
        LANDMARK_BONUSES?.SanctumOfTheVeil?.religiousCostReductionByAge?.[
          idx
        ] || 0;
      return `Acts as a Monastery. Heals nearby out-of-combat friendly units for ${formatDescriptionNumber(
        heal
      )} HP/s within ${range} tiles. Religious units produced here cost ${formatDescriptionPercent(
        discount
      )} less.`;
    }
    case "BasilicaOfEternalLight": {
      const heal =
        LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraHealByAge?.[idx] || 0;
      const damageBonus =
        LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraDamageByAge?.[idx] || 0;
      const range = LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraRange || 15;
      return `Nearby allied units within ${range} tiles regenerate ${formatDescriptionNumber(
        heal
      )} HP/s and gain +${formatDescriptionPercent(damageBonus)} damage.`;
    }
    case "EvermistGardens": {
      const income =
        LANDMARK_BONUSES?.EvermistGardens?.incomePerMinuteByAge?.[idx] || {};
      return `Religious units can place Relics in thie building to generate ${formatDescriptionNumber(
        income.gold || 0
      )} gold, ${formatDescriptionNumber(income.wood || 0)} wood, ${formatDescriptionNumber(
        income.food || 0
      )} food, and ${formatDescriptionNumber(income.stone || 0)} stone per minute.`;
    }
    case "GoldenFountainSquare": {
      const gatherBonus =
        LANDMARK_BONUSES?.GoldenFountainSquare?.gatherRateBonusByAge?.[idx] ||
        0;
      return `All resources can be dropped off here. Provides a +${formatDescriptionPercent(
        gatherBonus
      )} gathering boost to nearby Villagers. Resources dropped off can be converted into Food, Wood or Gold.`;
    }
    default:
      return BUILDING_DESCRIPTIONS[buildingType] || "Structure for your settlement.";
  }
}

export function getTechnologyDescriptionForTier(techId, ageTier = 1) {
  const tech = TECHNOLOGIES[techId];
  if (!tech) return "";
  const idx = clampDescriptionIndex((Number(ageTier) || 1) - 1, 0, 3);
  if (techId === "GreaterRations") {
    const bonus = tech.groveScalingByAge?.[idx] || 0;
    return `Increases the health of all non-siege units by +${formatDescriptionPercent(
      bonus
    )}.`;
  }
  if (techId === "SecondWind") {
    const bonus = tech.groveScalingByAge?.[idx] || 0;
    return `Non-siege units below 35% max health deal +${formatDescriptionPercent(
      bonus
    )} damage.`;
  }
  if (techId === "BedrockFoundations") {
    const bonus = tech.groveScalingByAge?.[idx] || 0;
    return `All buildings gain +${formatDescriptionPercent(
      bonus
    )} maximum health.`;
  }
  return tech.description || "";
}

export const UNITS = {
  Villager: {
    name: "Villager",
    type: "Worker",
    health: 50,
    speed: 1.125,
    damage: 5,
    attackCooldown: 3,
    range: 0.5,
    meleeArmor: 0,
    rangedArmor: 0,
    cost: { food: 50 },
    buildTime: 20,
    gatherRate: 1,
    sight: DEFAULT_SIGHT,
  },
  Trader: {
    name: "Trader",
    type: "Worker",
    health: 100,
    speed: 1,
    damage: 0,
    attackCooldown: 0,
    range: 0.5,
    meleeArmor: 0,
    rangedArmor: 0,
    cost: { food: 40, wood: 40, gold: 40 },
    buildTime: 30,
    sight: DEFAULT_SIGHT,
    minAgeTier: 1,
  },
  Monk: {
    name: "Monk",
    type: "Religious",
    health: 90,
    speed: 1.125,
    damage: 0,
    attackCooldown: 1,
    range: 0.5,
    meleeArmor: 0,
    rangedArmor: 0,
    cost: { gold: 150 },
    buildTime: 20,
    sight: DEFAULT_SIGHT,
    minAgeTier: 2,
  },
  Scout: {
    name: "Scout",
    type: "Light Melee Cavalry",
    health: 120,
    speed: 1.75,
    damage: 2,
    attackCooldown: 2,
    range: 0.5,
    meleeArmor: 0,
    rangedArmor: 0,
    cost: { food: 50 },
    buildTime: 20,
    sight: 12,
  },
  Spearman: {
    name: "Spearman",
    type: "Light Melee Infantry",
    health: 80,
    speed: 1.25,
    damage: 7,
    attackCooldown: 1.5,
    range: 0.5,
    meleeArmor: 0,
    rangedArmor: 0,
    cost: { food: 60, wood: 20 },
    buildTime: 15,
    bonus: [{ target: "Cavalry", damage: 18 }],
    sight: DEFAULT_SIGHT,
  },
  ManAtArms: {
    name: "Man-at-Arms",
    type: "Heavy Melee Infantry",
    health: 140,
    speed: 1.125,
    damage: 12,
    attackCooldown: 1.5,
    range: 0.5,
    meleeArmor: 4,
    rangedArmor: 4,
    cost: { food: 100, gold: 20 },
    buildTime: 22.5,
    sight: DEFAULT_SIGHT,
    minAgeTier: 0,
  },
  Horseman: {
    name: "Horseman",
    type: "Light Melee Cavalry",
    health: 100,
    speed: 1.875,
    damage: 9,
    attackCooldown: 1.5,
    range: 0.5,
    meleeArmor: 0,
    rangedArmor: 2,
    cost: { food: 100, wood: 20 },
    buildTime: 22.5,
    bonus: [{ target: "Ranged", damage: 9 }],
    sight: DEFAULT_SIGHT,
    minAgeTier: 0,
  },
  Knight: {
    name: "Knight",
    type: "Heavy Melee Cavalry",
    health: 220,
    speed: 1.625,
    damage: 20,
    chargeDamage: 10,
    attackCooldown: 1.5,
    range: 0.5,
    meleeArmor: 4,
    rangedArmor: 4,
    cost: { food: 140, gold: 100 },
    buildTime: 45,
    sight: DEFAULT_SIGHT,
    minAgeTier: 1,
  },
  Archer: {
    name: "Archer",
    type: "Light Ranged Infantry",
    health: 80,
    speed: 1.25,
    damage: 5,
    attackCooldown: 1.8,
    range: 4,
    meleeArmor: 0,
    rangedArmor: 0,
    cost: { food: 50, wood: 30 },
    buildTime: 15,
    bonus: [{ target: "Light Melee Infantry", damage: 5 }],
    sight: 6,
    minAgeTier: 1,
  },
  Crossbowman: {
    name: "Crossbowman",
    type: "Light Ranged Infantry",
    health: 80,
    speed: 1.125,
    damage: 10,
    attackCooldown: 2,
    range: 5,
    meleeArmor: 2,
    rangedArmor: 0,
    cost: { food: 80, gold: 40 },
    buildTime: 22.5,
    bonus: [{ target: "Heavy", damage: 10 }],
    sight: DEFAULT_SIGHT,
    minAgeTier: 2,
  },
  Handcannoneer: {
    name: "Handcannoneer",
    type: "Light Ranged Gunpowder Infantry",
    health: 120,
    speed: 1.125,
    damage: 40,
    attackCooldown: 2,
    range: 4,
    meleeArmor: 0,
    rangedArmor: 0,
    cost: { food: 120, gold: 120 },
    buildTime: 30,
    sight: DEFAULT_SIGHT,
    minAgeTier: 1,
  },
  CounterweightTrebuchet: {
    name: "Counterweight Trebuchet",
    type: "Siege",
    health: 150,
    speed: 0.75,
    damage: 50,
    attackCooldown: 12,
    range: 16,
    minRange: 4,
    meleeArmor: 0,
    rangedArmor: 0,
    rangedResistance: 0.8,
    cost: { wood: 400, gold: 150 },
    buildTime: 30,
    bonus: [{ target: "Building", damage: 400 }],
    sight: 18,
    minAgeTier: 2,
    population: 2,
  },
  Cannon: {
    name: "Cannon",
    type: "Gunpowder Siege",
    health: 300,
    speed: 0.75,
    damage: 50,
    attackCooldown: 5,
    range: 10,
    minRange: 3,
    meleeArmor: 0,
    rangedArmor: 0,
    rangedResistance: 0.85,
    cost: { wood: 400, gold: 500 },
    buildTime: 50,
    bonus: [
      { target: "Infantry", damage: 50 },
      { target: "Building", damage: 500 },
    ],
    sight: 12,
    minAgeTier: 3,
    population: 3,
  },
};

export const UNIT_UPGRADE_PATHS = {
  Spearman: {
    building: "Barracks",
    unlockTier: 0,
    techs: {
      1: "SpearmanIron",
      2: "SpearmanDiamond",
      3: "SpearmanEmerald",
      4: "SpearmanEnlightened",
    },
  },
  Archer: {
    building: "ArcheryRange",
    unlockTier: 1,
    normalTier: 1,
    techs: {
      2: "ArcherDiamond",
      3: "ArcherEmerald",
      4: "ArcherEnlightened",
    },
  },
  Horseman: {
    building: "Stable",
    unlockTier: 1,
    normalTier: 1,
    techs: {
      2: "HorsemanDiamond",
      3: "HorsemanEmerald",
      4: "HorsemanEnlightened",
    },
  },
  Knight: {
    building: "Stable",
    unlockTier: 2,
    normalTier: 2,
    techs: {
      3: "KnightEmerald",
      4: "KnightEnlightened",
    },
  },
  ManAtArms: {
    building: "Barracks",
    unlockTier: 2,
    normalTier: 2,
    techs: {
      3: "ManAtArmsEmerald",
      4: "ManAtArmsEnlightened",
    },
  },
  Crossbowman: {
    building: "ArcheryRange",
    unlockTier: 2,
    normalTier: 2,
    techs: {
      3: "CrossbowmanEmerald",
      4: "CrossbowmanEnlightened",
    },
  },
  Handcannoneer: {
    building: "ArcheryRange",
    unlockTier: 3,
    normalTier: 3,
    techs: {
      4: "HandcannoneerEnlightened",
    },
  },
};

export const UNIT_UPGRADE_STATS = {
  Spearman: {
    1: {
      health: 90,
      damage: 8,
      meleeArmor: 1,
      rangedArmor: 0,
      bonus: [{ target: "Cavalry", damage: 20 }],
    },
    2: {
      health: 100,
      damage: 9,
      meleeArmor: 1,
      rangedArmor: 0,
      bonus: [{ target: "Cavalry", damage: 22 }],
    },
    3: {
      health: 120,
      damage: 11,
      meleeArmor: 1,
      rangedArmor: 0,
      bonus: [{ target: "Cavalry", damage: 27 }],
    },
    4: {
      health: 140,
      damage: 15,
      meleeArmor: 2,
      rangedArmor: 0,
      bonus: [{ target: "Cavalry", damage: 35 }],
    },
  },
  Archer: {
    2: {
      health: 90,
      damage: 7,
      meleeArmor: 0,
      rangedArmor: 0,
      bonus: [{ target: "Light Melee Infantry", damage: 7 }],
    },
    3: {
      health: 100,
      damage: 8,
      meleeArmor: 0,
      rangedArmor: 0,
      bonus: [{ target: "Light Melee Infantry", damage: 8 }],
    },
    4: {
      health: 120,
      damage: 10,
      meleeArmor: 0,
      rangedArmor: 0,
      bonus: [{ target: "Light Melee Infantry", damage: 10 }],
    },
  },
  Horseman: {
    0: {
      health: 90,
      damage: 8,
      meleeArmor: 0,
      rangedArmor: 2,
      bonus: [{ target: "Ranged", damage: 8 }],
    },
    1: {
      health: 100,
      damage: 9,
      meleeArmor: 0,
      rangedArmor: 2,
      bonus: [{ target: "Ranged", damage: 9 }],
    },
    2: {
      health: 120,
      damage: 11,
      meleeArmor: 0,
      rangedArmor: 3,
      bonus: [{ target: "Ranged", damage: 11 }],
    },
    3: {
      health: 140,
      damage: 15,
      meleeArmor: 0,
      rangedArmor: 5,
      bonus: [{ target: "Ranged", damage: 15 }],
    },
    4: {
      health: 180,
      damage: 18,
      meleeArmor: 0,
      rangedArmor: 7,
      bonus: [{ target: "Ranged", damage: 18 }],
    },
  },
  Knight: {
    1: {
      health: 180,
      damage: 18,
      chargeDamage: 10,
      meleeArmor: 3,
      rangedArmor: 3,
      bonus: [],
    },
    2: {
      health: 220,
      damage: 20,
      chargeDamage: 10,
      meleeArmor: 4,
      rangedArmor: 4,
      bonus: [],
    },
    3: {
      health: 270,
      damage: 27,
      chargeDamage: 20,
      meleeArmor: 5,
      rangedArmor: 5,
      bonus: [],
    },
    4: {
      health: 320,
      damage: 35,
      chargeDamage: 30,
      meleeArmor: 6,
      rangedArmor: 6,
      bonus: [],
    },
  },
  ManAtArms: {
    0: {
      health: 100,
      damage: 8,
      meleeArmor: 2,
      rangedArmor: 2,
      bonus: [],
    },
    1: {
      health: 120,
      damage: 10,
      meleeArmor: 3,
      rangedArmor: 3,
      bonus: [],
    },
    2: {
      health: 140,
      damage: 12,
      meleeArmor: 4,
      rangedArmor: 4,
      bonus: [],
    },
    3: {
      health: 180,
      damage: 16,
      meleeArmor: 6,
      rangedArmor: 6,
      bonus: [],
    },
    4: {
      health: 220,
      damage: 20,
      meleeArmor: 8,
      rangedArmor: 8,
      bonus: [],
    },
  },
  Crossbowman: {
    3: {
      health: 90,
      damage: 12,
      meleeArmor: 4,
      rangedArmor: 0,
      bonus: [{ target: "Heavy", damage: 12 }],
    },
    4: {
      health: 120,
      damage: 15,
      meleeArmor: 6,
      rangedArmor: 0,
      bonus: [{ target: "Heavy", damage: 15 }],
    },
  },
  Handcannoneer: {
    1: {
      health: 90,
      damage: 22,
      meleeArmor: 0,
      rangedArmor: 0,
      bonus: [],
    },
    2: {
      health: 110,
      damage: 30,
      meleeArmor: 0,
      rangedArmor: 0,
      bonus: [],
    },
    3: {
      health: 120,
      damage: 40,
      meleeArmor: 0,
      rangedArmor: 0,
      bonus: [],
    },
    4: {
      health: 150,
      damage: 60,
      meleeArmor: 1,
      rangedArmor: 1,
      bonus: [],
    },
  },
};

export const UNIT_DESCRIPTIONS = {
  Villager: "Gathers resources and constructs buildings.",
  Trader: "Travels between Markets and Trade Posts, generating gold.",
  Monk: "Support unit that heals allied units.",
  Scout: "Fast cavalry with long line of sight.",
  Spearman: "Light infantry effective against cavalry.",
  ManAtArms: "Heavy melee infantry with high armor and damage.",
  Horseman: "Fast cavalry effective against ranged and siege units.",
  Knight: "Expensive cavalry with high armor and a powerful charge attack.",
  Archer: "Ranged infantry effective against unarmored targets.",
  Crossbowman: "High damage ranged infantry effective against armored units.",
  Handcannoneer: "Gunpowder infantry with extremely high damage.",
  CounterweightTrebuchet: "Powerful long-ranged siege weapon effective against buildings.",
  Cannon: "High damage siege cannon exceptional against buildings.",
};

export const TECHNOLOGIES = {
  CarryingFrame: {
    name: "Carrying Frame",
    cost: { wood: 25, gold: 50 },
    description: "Villagers carry +5 resources.",
    carryBonus: 5,
    speedBonus: 0.125,
    researchTime: 20,
    building: "TownCenter",
    minAgeTier: 1,
  },
  Resourcefulness: {
    name: "Resourcefulness",
    cost: { food: 500, wood: 500, gold: 1000 },
    description: "Cost to produce all units is reduced by 10%.",
    researchTime: 90,
    building: "TechLab",
    minAgeTier: 3,
  },
  RapidFabrications: {
    name: "Rapid Fabrications",
    cost: { wood: 500, gold: 1000 },
    description: "Buildings and siege units are built 50% faster.",
    researchTime: 90,
    building: "TechLab",
    minAgeTier: 3,
  },
  AdvancedRadar: {
    name: "Advanced Radar",
    cost: { food: 300, wood: 300, gold: 500 },
    description: "Line of sight of all units and buildings is increased by 50%.",
    researchTime: 90,
    building: "TechLab",
    minAgeTier: 3,
  },
  ImprovedGunpowder: {
    name: "Improved Gunpowder",
    cost: { food: 400, gold: 800 },
    description: "Gunpowder units and siege weapons gain +20% damage and +1 range.",
    researchTime: 90,
    building: "TechLab",
    minAgeTier: 3,
  },
  SuperWeapons: {
    name: "Super Weapons",
    cost: { wood: 1000, gold: 1000 },
    description: "Enables building advanced weapons.",
    researchTime: 90,
    building: "TechLab",
    minAgeTier: 4,
  },
  Basketry: {
    name: "Basketry",
    cost: { wood: 50, gold: 100 },
    description: "Improves Villager Food gather rate by +10%.",
    gatherBonus: { food: 0.1 },
    researchTime: 60,
    building: "Mill",
    minAgeTier: 1,
  },
  Agriculture: {
    name: "Agriculture",
    cost: { wood: 100, gold: 250 },
    description: "Improves Villager Food gather rate by +10%.",
    gatherBonus: { food: 0.1 },
    researchTime: 60,
    building: "Mill",
    minAgeTier: 2,
    requiresTech: "Basketry",
  },
  ImprovedProcessing: {
    name: "Improved Processing",
    cost: { wood: 200, gold: 400 },
    description: "Food dropped off is increased by +10%.",
    dropoffBonus: { food: 0.1 },
    researchTime: 60,
    building: "Mill",
    minAgeTier: 3,
    requiresTech: "Agriculture",
  },
  OakHandle: {
    name: "Oak Handle",
    cost: { wood: 50, gold: 100 },
    description: "Improves Villager Wood gather rate by +10%.",
    gatherBonus: { wood: 0.1 },
    researchTime: 60,
    building: "LumberCamp",
    minAgeTier: 1,
  },
  DoubleHeadedAxe: {
    name: "Double Headed Axe",
    cost: { wood: 100, gold: 250 },
    description: "Improves Villager Wood gather rate by +10%.",
    gatherBonus: { wood: 0.1 },
    researchTime: 60,
    building: "LumberCamp",
    minAgeTier: 2,
    requiresTech: "OakHandle",
  },
  WoodSaws: {
    name: "Wood Saws",
    cost: { wood: 200, gold: 400 },
    description: "Wood dropped off is increased by +10%.",
    dropoffBonus: { wood: 0.1 },
    researchTime: 60,
    building: "LumberCamp",
    minAgeTier: 3,
    requiresTech: "DoubleHeadedAxe",
  },
  CarbideTip: {
    name: "Carbide Tip",
    cost: { wood: 50, gold: 100 },
    description: "Improves Villager Gold and Stone gather rate by +10%.",
    gatherBonus: { gold: 0.1, stone: 0.1 },
    researchTime: 60,
    building: "MiningCamp",
    minAgeTier: 1,
  },
  HeavySwings: {
    name: "Heavy Swings",
    cost: { wood: 100, gold: 250 },
    description: "Improves Villager Gold and Stone gather rate by +10%.",
    gatherBonus: { gold: 0.1, stone: 0.1 },
    researchTime: 60,
    building: "MiningCamp",
    minAgeTier: 2,
    requiresTech: "CarbideTip",
  },
  TungstenTip: {
    name: "Tungsten Tip",
    cost: { wood: 200, gold: 400 },
    description: "Gold and Stone dropped off is increased by +10%.",
    dropoffBonus: { gold: 0.1, stone: 0.1 },
    researchTime: 60,
    building: "MiningCamp",
    minAgeTier: 3,
    requiresTech: "HeavySwings",
  },
  Arrowslits: {
    name: "Arrowslits",
    cost: { stone: 75 },
    description: "Add a defensive arrowslit to this outpost.\nIncrease weapon range by +1.",
    researchTime: 20,
    building: "Outpost",
    scope: "building",
    minAgeTier: 1,
  },
  SpringaldEmplacement: {
    name: "Springald Emplacement",
    cost: { stone: 175 },
    description: "Add a defensive springald emplacement to this building.",
    researchTime: 30,
    building: "Outpost",
    scope: "building",
    minAgeTier: 2,
  },
  GreaterRations: {
    name: "Greater Rations",
    cost: { food: 50, gold: 100 },
    description: "Increases the health of all non-siege units.",
    researchTime: 60,
    building: "GroveUniversity",
    minAgeTier: 1,
    groveDynamicCost: true,
    groveScalingByAge: [0.05, 0.08, 0.12, 0.15],
  },
  SecondWind: {
    name: "Second Wind",
    cost: { food: 50, gold: 100 },
    description:
      "Non-siege units below 35% health deal increased damage.",
    researchTime: 60,
    building: "GroveUniversity",
    minAgeTier: 1,
    groveDynamicCost: true,
    groveScalingByAge: [0.2, 0.3, 0.4, 0.5],
  },
  BedrockFoundations: {
    name: "Bedrock Foundations",
    cost: { food: 50, gold: 100 },
    description: "All buildings gain additional maximum health.",
    researchTime: 60,
    building: "GroveUniversity",
    minAgeTier: 1,
    groveDynamicCost: true,
    groveScalingByAge: [0.1, 0.2, 0.3, 0.4],
  },
  SpearmanIron: {
    name: "Upgrade to Iron",
    cost: { food: 10, gold: 20 },
    description: "Upgrade Spearmen to Iron Spearmen.",
    researchTime: 15,
    building: "Barracks",
    minAgeTier: 1,
    upgradeUnit: "Spearman",
    upgradeTier: 1,
  },
  SpearmanDiamond: {
    name: "Upgrade to Diamond",
    cost: { food: 50, gold: 150 },
    description: "Upgrade Iron Spearmen to Diamond Spearmen.",
    researchTime: 60,
    building: "Barracks",
    minAgeTier: 2,
    requiresTech: "SpearmanIron",
    upgradeUnit: "Spearman",
    upgradeTier: 2,
  },
  SpearmanEmerald: {
    name: "Upgrade to Emerald",
    cost: { food: 200, gold: 500 },
    description: "Upgrade Diamond Spearmen to Emerald Spearmen.",
    researchTime: 60,
    building: "Barracks",
    minAgeTier: 3,
    requiresTech: "SpearmanDiamond",
    upgradeUnit: "Spearman",
    upgradeTier: 3,
  },
  SpearmanEnlightened: {
    name: "Upgrade to Enlightened",
    cost: { food: 300, gold: 700 },
    description: "Upgrade Emerald Spearmen to Enlightened Spearmen.",
    researchTime: 60,
    building: "Barracks",
    minAgeTier: 4,
    requiresTech: "SpearmanEmerald",
    upgradeUnit: "Spearman",
    upgradeTier: 4,
  },
  ArcherDiamond: {
    name: "Upgrade to Diamond",
    cost: { food: 50, gold: 150 },
    description: "Upgrade Archers to Diamond Archers.",
    researchTime: 60,
    building: "ArcheryRange",
    minAgeTier: 2,
    upgradeUnit: "Archer",
    upgradeTier: 2,
  },
  ArcherEmerald: {
    name: "Upgrade to Emerald",
    cost: { food: 200, gold: 500 },
    description: "Upgrade Diamond Archers to Emerald Archers.",
    researchTime: 60,
    building: "ArcheryRange",
    minAgeTier: 3,
    requiresTech: "ArcherDiamond",
    upgradeUnit: "Archer",
    upgradeTier: 3,
  },
  ArcherEnlightened: {
    name: "Upgrade to Enlightened",
    cost: { food: 300, gold: 700 },
    description: "Upgrade Emerald Archers to Enlightened Archers.",
    researchTime: 60,
    building: "ArcheryRange",
    minAgeTier: 4,
    requiresTech: "ArcherEmerald",
    upgradeUnit: "Archer",
    upgradeTier: 4,
  },
  HorsemanDiamond: {
    name: "Upgrade to Diamond",
    cost: { food: 50, gold: 150 },
    description: "Upgrade Horsemen to Diamond Horsemen.",
    researchTime: 60,
    building: "Stable",
    minAgeTier: 2,
    upgradeUnit: "Horseman",
    upgradeTier: 2,
  },
  HorsemanEmerald: {
    name: "Upgrade to Emerald",
    cost: { food: 200, gold: 500 },
    description: "Upgrade Diamond Horsemen to Emerald Horsemen.",
    researchTime: 60,
    building: "Stable",
    minAgeTier: 3,
    requiresTech: "HorsemanDiamond",
    upgradeUnit: "Horseman",
    upgradeTier: 3,
  },
  HorsemanEnlightened: {
    name: "Upgrade to Enlightened",
    cost: { food: 300, gold: 700 },
    description: "Upgrade Emerald Horsemen to Enlightened Horsemen.",
    researchTime: 60,
    building: "Stable",
    minAgeTier: 4,
    requiresTech: "HorsemanEmerald",
    upgradeUnit: "Horseman",
    upgradeTier: 4,
  },
  // Early/vanguard tiers disabled for now.
  KnightEmerald: {
    name: "Upgrade to Emerald",
    cost: { food: 200, gold: 500 },
    description: "Upgrade Knights to Emerald Knights.",
    researchTime: 60,
    building: "Stable",
    minAgeTier: 3,
    upgradeUnit: "Knight",
    upgradeTier: 3,
  },
  KnightEnlightened: {
    name: "Upgrade to Enlightened",
    cost: { food: 300, gold: 700 },
    description: "Upgrade Emerald Knights to Enlightened Knights.",
    researchTime: 60,
    building: "Stable",
    minAgeTier: 4,
    requiresTech: "KnightEmerald",
    upgradeUnit: "Knight",
    upgradeTier: 4,
  },
  // Early/vanguard tiers disabled for now.
  ManAtArmsEmerald: {
    name: "Upgrade to Emerald",
    cost: { food: 200, gold: 500 },
    description: "Upgrade Men-at-Arms to Emerald Men-at-Arms.",
    researchTime: 60,
    building: "Barracks",
    minAgeTier: 3,
    upgradeUnit: "ManAtArms",
    upgradeTier: 3,
  },
  ManAtArmsEnlightened: {
    name: "Upgrade to Enlightened",
    cost: { food: 300, gold: 700 },
    description: "Upgrade Emerald Men-at-Arms to Enlightened Men-at-Arms.",
    researchTime: 60,
    building: "Barracks",
    minAgeTier: 4,
    requiresTech: "ManAtArmsEmerald",
    upgradeUnit: "ManAtArms",
    upgradeTier: 4,
  },
  CrossbowmanEmerald: {
    name: "Upgrade to Emerald",
    cost: { food: 200, gold: 500 },
    description: "Upgrade Crossbowmen to Emerald Crossbowmen.",
    researchTime: 60,
    building: "ArcheryRange",
    minAgeTier: 3,
    upgradeUnit: "Crossbowman",
    upgradeTier: 3,
  },
  CrossbowmanEnlightened: {
    name: "Upgrade to Enlightened",
    cost: { food: 300, gold: 700 },
    description: "Upgrade Emerald Crossbowmen to Enlightened Crossbowmen.",
    researchTime: 60,
    building: "ArcheryRange",
    minAgeTier: 4,
    requiresTech: "CrossbowmanEmerald",
    upgradeUnit: "Crossbowman",
    upgradeTier: 4,
  },
  // Early/vanguard tiers disabled for now.
  HandcannoneerEnlightened: {
    name: "Upgrade to Enlightened",
    cost: { food: 300, gold: 700 },
    description: "Upgrade Handcannoneers to Enlightened Handcannoneers.",
    researchTime: 60,
    building: "ArcheryRange",
    minAgeTier: 4,
    upgradeUnit: "Handcannoneer",
    upgradeTier: 4,
  },
  IronForging: {
    name: "Iron Forging",
    cost: { wood: 50, gold: 125 },
    description: "All units deal +1 melee damage.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 1,
  },
  LightweightShafts: {
    name: "Lightweight Shafts",
    cost: { wood: 50, gold: 125 },
    description: "All ranged units and buildings deal +1 damage.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 1,
  },
  ChainmailArmor: {
    name: "Chainmail Armor",
    cost: { wood: 50, gold: 125 },
    description: "All non-siege units gain +1 melee armor.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 1,
  },
  LeatherPadding: {
    name: "Leather Padding",
    cost: { wood: 50, gold: 125 },
    description: "All non-siege units gain +1 ranged armor.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 1,
  },
  DiamondForging: {
    name: "Diamond Forging",
    cost: { wood: 100, gold: 250 },
    description: "All units deal +1 melee damage.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 2,
    requiresTech: "IronForging",
  },
  EmeraldForging: {
    name: "Emerald Forging",
    cost: { wood: 150, gold: 350 },
    description: "All units deal +1 melee damage.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 3,
    requiresTech: "DiamondForging",
  },
  EnlightenedForging: {
    name: "Enlightened Forging",
    cost: { wood: 300, gold: 700 },
    description: "All units deal +1 melee damage.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 4,
    requiresTech: "EmeraldForging",
  },
  PiercingPoints: {
    name: "Piercing Points",
    cost: { wood: 100, gold: 250 },
    description: "All ranged units and buildings deal +1 damage.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 2,
    requiresTech: "LightweightShafts",
  },
  Aerodynamic: {
    name: "Aerodynamic",
    cost: { wood: 150, gold: 350 },
    description: "All ranged units and buildings deal +1 damage.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 3,
    requiresTech: "PiercingPoints",
  },
  BodkinBolts: {
    name: "Bodkin Bolts",
    cost: { wood: 300, gold: 700 },
    description: "All ranged units and buildings deal +1 damage.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 4,
    requiresTech: "Aerodynamic",
  },
  DiamondArmor: {
    name: "Diamond Armor",
    cost: { wood: 100, gold: 250 },
    description: "All non-siege units gain +1 melee armor.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 2,
    requiresTech: "ChainmailArmor",
  },
  EmeraldArmor: {
    name: "Emerald Armor",
    cost: { wood: 150, gold: 350 },
    description: "All non-siege units gain +1 melee armor.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 3,
    requiresTech: "DiamondArmor",
  },
  EnlightenedArmor: {
    name: "Enlightened Armor",
    cost: { wood: 300, gold: 700 },
    description: "All non-siege units gain +1 melee armor.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 4,
    requiresTech: "EmeraldArmor",
  },
  ImprovedShields: {
    name: "Improved Shields",
    cost: { wood: 100, gold: 250 },
    description: "All non-siege units gain +1 ranged armor.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 2,
    requiresTech: "LeatherPadding",
  },
  DeflectiveScales: {
    name: "Deflective Scales",
    cost: { wood: 150, gold: 350 },
    description: "All non-siege units gain +1 ranged armor.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 3,
    requiresTech: "ImprovedShields",
  },
  GildedFittings: {
    name: "Gilded Fittings",
    cost: { wood: 300, gold: 700 },
    description: "All non-siege units gain +1 ranged armor.",
    researchTime: 60,
    building: "Armory",
    minAgeTier: 4,
    requiresTech: "DeflectiveScales",
  },
  IronEra: {
    name: "Iron Era",
    cost: { food: 200, wood: 200, gold: 200 },
    description: "Advance to the Iron Era.",
    researchTime: 120,
    building: "Armory",
    ageTier: 1,
  },
  DiamondEra: {
    name: "Diamond Era",
    cost: { food: 500, wood: 500, gold: 500 },
    description: "Advance to the Diamond Era.",
    researchTime: 120,
    building: "Armory",
    ageTier: 2,
  },
  EmeraldEra: {
    name: "Emerald Era",
    cost: { food: 1000, wood: 1000, gold: 1000 },
    description: "Advance to the Emerald Era.",
    researchTime: 120,
    building: "Armory",
    ageTier: 3,
  },
  EnlightenedEra: {
    name: "Enlightened Era",
    cost: { food: 2000, wood: 2000, gold: 2000 },
    description: "Advance to the Enlightened Era.",
    researchTime: 120,
    building: "Armory",
    ageTier: 4,
  },
};


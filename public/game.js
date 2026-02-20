import {
  MAP,
  RESOURCE_DEFS,
  BUILDINGS,
  BUILDING_DESCRIPTIONS,
  BUILDING_CATEGORIES,
  UNIT_DESCRIPTIONS,
  UNITS,
  UNIT_UPGRADE_PATHS,
  UNIT_UPGRADE_STATS,
  PLAYER_COLORS,
  PLAYER_COLOR_OPTIONS,
  DEFAULT_SIGHT,
  TECHNOLOGIES,
  AGE_ORDER,
  AGE_UP_COSTS,
  LANDMARK_POOL,
  LANDMARK_BONUSES,
  getLandmarkDescriptionForTier as getDynamicLandmarkDescription,
  getTechnologyDescriptionForTier as getDynamicTechnologyDescription,
} from "./shared/constants.js";

const socket = io();

socket.on("connect", () => {
  socket.emit("requestLobbies");
});

window.addEventListener("pointerdown", initAudio);
window.addEventListener("keydown", initAudio);

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const minimap = document.getElementById("minimap");
const miniCtx = minimap.getContext("2d");
const overlay = document.getElementById("overlay");
const playButton = document.getElementById("play");
const singleplayerButton = document.getElementById("singleplayer");
const lobbyNameInput = document.getElementById("lobby-name-input");
const createLobbyButton = document.getElementById("create-lobby");
const lobbyListEl = document.getElementById("lobby-list");
const leaveLobbyButton = document.getElementById("leave-lobby");
const startLobbyButton = document.getElementById("start-lobby");
const refreshLobbiesButton = document.getElementById("refresh-lobbies");
const lobbyBrowser = document.getElementById("lobby-browser");
const lobbyRoom = document.getElementById("lobby-room");
const lobbyRoomName = document.getElementById("lobby-room-name");
const lobbyRoomPlayers = document.getElementById("lobby-room-players");
const lobbyCheatsToggle = document.getElementById("lobby-cheats");
const lobbyColors = document.getElementById("lobby-colors");
const lobbyTeams = document.getElementById("lobby-teams");
const lobbyModal = document.getElementById("lobby-modal");
const confirmLobbyButton = document.getElementById("confirm-lobby");
const cancelLobbyButton = document.getElementById("cancel-lobby");
const resignModal = document.getElementById("resign-modal");
const confirmResignButton = document.getElementById("confirm-resign");
const cancelResignButton = document.getElementById("cancel-resign");
const statusEl = document.getElementById("status");
const resourcesEl = document.getElementById("resources");
const idleVillagersEl = document.getElementById("idle-villagers");
const idleTradersEl = document.getElementById("idle-traders");
const selectionTitle = document.getElementById("selection-title");
const selectionDetails = document.getElementById("selection-details");
const productionButtons = document.getElementById("production-buttons");
const productionQueueEl = document.getElementById("production-queue");
const buildButtons = document.getElementById("build-buttons");
const buildTooltip = document.getElementById("build-tooltip");
const garrisonPanel = document.getElementById("garrison-panel");
const garrisonList = document.getElementById("garrison-list");
const ungarrisonAllButton = document.getElementById("ungarrison-all");
const cheatBar = document.getElementById("cheat-bar");
const attackNotify = document.getElementById("attack-notify");
const researchNotify = document.getElementById("research-notify");
const ageNotify = document.getElementById("age-notify");
const playerList = document.getElementById("player-list");
const bottomBar = document.getElementById("bottom-bar");
let errorBanner = document.getElementById("error-banner");

if (buildButtons) {
  buildButtons.classList.add("build-hidden");
}
if (bottomBar) {
  bottomBar.classList.add("hidden");
}

// Market trading will be added in a future update.


let map = MAP;
let resources = [];
let relics = [];
let units = [];
let buildings = [];
let players = [];
let playerIndex = null;
let selectedUnits = [];
let selectedBuilding = null;
let selectedBuildings = [];
let selectedResource = null;
let selectedRelic = null;
let selectionBox = null;
let isDraggingSelection = false;
let lastClickTime = 0;
let lastClickUnitType = null;
let lastClickBuildingType = null;
let lastClickBuildingOwner = null;
let buildMode = null;
let lastMouseWorld = null;
let isSingleplayer = false;
let allowCheats = false;
let selectedColorId = null;
let isSearching = false;
let currentLobby = null;
let isLobbyHost = false;
let pendingCheat = null;
let lastMouseScreen = { x: 0, y: 0 };
const projectiles = [];
const projectileImpacts = [];
let fogVisible = new Uint8Array(MAP.width * MAP.height);
let fogExplored = new Uint8Array(MAP.width * MAP.height);
let lastAttackLocation = null;
let lastAttackTime = 0;
const minimapAlerts = [];
let fogCheatReveal = false;
let lastUiAgeTier = null;
const tempVisionReveals = [];
const ATTACK_REVEAL_RADIUS = 4;
const ATTACK_REVEAL_DURATION_MS = 3500;
const unitLastHealth = new Map();
const buildingLastHealth = new Map();
const unitDamageTime = new Map();
const unitRecoverTime = new Map();
const buildingDamageTime = new Map();
const buildingRepairTime = new Map();
const DAMAGE_BAR_DURATION_MS = 3000;
const UNIT_RECOVER_ICON_GRACE_MS = 260;
const REPAIR_BAR_GRACE_MS = 450;
const DISRUPTOR_IMPACT_DURATION_MS = 380;

let camera = { x: 0, y: 0 };
let cameraOverpan = MAP.tileSize * 20;
let attackMoveArmed = false;
let dropRelicArmed = false;
let healArmed = false;
let repairArmed = false;
const keys = new Set();
const buildingImages = {};
const landmarkRoleImages = {};
const LANDMARK_ROLE_ICON_PATHS = Object.freeze({
  economic: "/images/economic.png",
  military: "/images/military.png",
  religious: "/images/religious.png",
  technology: "/images/technology.png",
  defensive: "/images/defensive.png",
});
const unitRenderState = new Map();
let lastStateUpdate = null;
const DEFAULT_INTERP_MS = 1000 / 20;
let idleVillagerCycleIndex = 0;
let audioContext = null;
let audioReady = false;
let lastSelectionSignature = "";

function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  audioReady = audioContext.state === "running";
}

function playTone(freq, duration, type = "sine", volume = 0.08) {
  if (!audioReady || !audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playSound(kind) {
  if (!audioReady) return;
  switch (kind) {
    case "select":
      playTone(520, 0.08, "triangle", 0.06);
      break;
    case "unit_complete":
      playTone(640, 0.1, "square", 0.06);
      break;
    case "building_complete":
      playTone(520, 0.14, "square", 0.07);
      playTone(780, 0.08, "triangle", 0.05);
      break;
    case "research_complete":
      playTone(740, 0.12, "sine", 0.07);
      playTone(980, 0.08, "sine", 0.05);
      break;
    case "under_attack":
      playTone(220, 0.12, "sawtooth", 0.08);
      break;
    case "age_advance":
      playTone(440, 0.1, "sine", 0.06);
      playTone(660, 0.12, "sine", 0.06);
      playTone(880, 0.12, "sine", 0.06);
      break;
    default:
      break;
  }
}

let errorTimeout = null;
let minimapDragging = false;
let pendingButtonUiRefresh = false;
let pointerIsDown = false;
let suppressPeriodicUiRefreshUntil = 0;
const unitFacing = new Map();
const productionRoundRobinIndex = new Map();
const controlGroups = new Map();
const controlGroupLastSelect = new Map();
const UNIT_PRODUCTION_HOTKEYS = ["q", "e", "r", "t", "y"];
const REPAIR_COMMAND_HOTKEY = "z";
const CANCEL_QUEUE_HOTKEY = "b";

function isTypingFieldActive() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function requestUiRefreshFromButtonClick() {
  suppressPeriodicUiRefreshUntil = performance.now() + 200;
  if (pendingButtonUiRefresh) return;
  pendingButtonUiRefresh = true;
  requestAnimationFrame(() => {
    pendingButtonUiRefresh = false;
    updateSelectionUI();
    updateResourcesHUD();
  });
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button");
  if (!button) return;
  requestUiRefreshFromButtonClick();
});

window.addEventListener("pointerdown", () => {
  pointerIsDown = true;
  suppressPeriodicUiRefreshUntil = performance.now() + 200;
});

window.addEventListener("pointerup", () => {
  pointerIsDown = false;
  suppressPeriodicUiRefreshUntil = performance.now() + 160;
});

window.addEventListener("pointercancel", () => {
  pointerIsDown = false;
  suppressPeriodicUiRefreshUntil = performance.now() + 160;
});

if (!errorBanner && bottomBar) {
  errorBanner = document.createElement("div");
  errorBanner.id = "error-banner";
  errorBanner.setAttribute("aria-live", "polite");
  if (productionButtons && productionButtons.parentElement === bottomBar) {
    bottomBar.insertBefore(errorBanner, productionButtons);
  } else {
    bottomBar.appendChild(errorBanner);
  }
}

if (productionQueueEl) {
  productionQueueEl.addEventListener("click", (event) => {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    const button = path.find(
      (node) =>
        node instanceof Element && node.classList?.contains("queue-item")
    );
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(button.dataset.index);
    const buildingId = Number(button.dataset.buildingId);
    let building =
      selectedBuildings.find((b) => b.id === buildingId) || selectedBuildings[0];
    if (!building && Number.isFinite(buildingId)) {
      building = buildings.find((b) => b.id === buildingId) || null;
    }
    if (!building || !Number.isFinite(index)) return;
    sendCommand(
      { type: "cancelQueue", buildingId: building.id, index },
      {
        expectAck: true,
        onError: (response) => {
          const reason = response?.reason || "cancel_failed";
          if (reason === "invalid_building") {
            showBanner("Building no longer valid.", "error", 1800);
          } else if (reason === "invalid_index") {
            showBanner("Queue item no longer exists.", "error", 1800);
          } else {
            showBanner("Unable to cancel queue item.", "error", 1800);
          }
        },
      }
    );
  });
}

// Visual smoke test so we can confirm the banner is actually rendering.
if (errorBanner) {
  errorBanner.textContent = "UI ready.";
  setTimeout(() => {
    if (errorBanner.textContent === "UI ready.") {
      errorBanner.textContent = "";
    }
  }, 1500);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  minimap.width = minimap.clientWidth;
  minimap.height = minimap.clientHeight;
  updateNotificationPositions();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function preloadImages() {
  Object.values(BUILDINGS).forEach((building) => {
    if (!building.image) return;
    const img = new Image();
    img.src = building.image;
    buildingImages[building.name] = img;
  });
  Object.entries(LANDMARK_ROLE_ICON_PATHS).forEach(([role, src]) => {
    const img = new Image();
    img.src = src;
    landmarkRoleImages[role] = img;
  });
}

preloadImages();

if (playButton) {
  playButton.addEventListener("click", () => {
    if (isSearching) {
      socket.emit("cancelQueue");
      isSearching = false;
      playButton.textContent = "Play";
      statusEl.textContent = "Idle";
      return;
    }
    statusEl.textContent = "Searching for opponent...";
    isSearching = true;
    playButton.textContent = "Cancel";
    socket.emit("play");
  });
}

singleplayerButton.addEventListener("click", () => {
  if (isSearching) {
    socket.emit("cancelQueue");
    isSearching = false;
    if (playButton) playButton.textContent = "Play";
  }
  if (currentLobby) {
    socket.emit("leaveLobby");
    currentLobby = null;
    if (leaveLobbyButton) leaveLobbyButton.disabled = true;
  }
  statusEl.textContent = "Starting singleplayer match...";
  socket.emit("singleplayer");
});

if (createLobbyButton) {
  createLobbyButton.addEventListener("click", () => {
    setLobbyModal(true);
  });
}

if (leaveLobbyButton) {
  leaveLobbyButton.addEventListener("click", () => {
    if (!currentLobby) return;
    socket.emit("leaveLobby");
  });
}

if (startLobbyButton) {
  startLobbyButton.addEventListener("click", () => {
    if (!currentLobby || !isLobbyHost) return;
    socket.emit("startLobby", { id: currentLobby.id }, (response) => {
      if (response && response.ok === false) {
        const reason = response.reason || "unknown";
        const friendly = {
          not_found: "Lobby not found.",
          not_host: "Only the host can start the match.",
          not_ready: "Need another player to start.",
          team_not_ready: "At least two different teams are required.",
        }[reason] || "Unable to start match.";
        showBanner(friendly, "error");
      }
    });
  });
}

if (refreshLobbiesButton) {
  refreshLobbiesButton.addEventListener("click", () => {
    socket.emit("requestLobbies");
  });
}

if (confirmLobbyButton) {
  confirmLobbyButton.addEventListener("click", () => {
    submitLobbyCreate();
  });
}

if (cancelLobbyButton) {
  cancelLobbyButton.addEventListener("click", () => {
    setLobbyModal(false);
  });
}

if (lobbyCheatsToggle) {
  lobbyCheatsToggle.addEventListener("change", () => {
    if (!currentLobby || !isLobbyHost) return;
    socket.emit("setLobbyCheats", {
      id: currentLobby.id,
      allowCheats: !!lobbyCheatsToggle.checked,
    });
  });
}

if (lobbyColors) {
  lobbyColors.addEventListener("change", (event) => {
    const select = event.target.closest(".lobby-select-color");
    if (!select || !currentLobby) return;
    const colorId = select.value;
    if (!colorId) return;
    socket.emit("setLobbyColor", { id: currentLobby.id, colorId });
  });
}

if (lobbyTeams) {
  lobbyTeams.addEventListener("change", (event) => {
    const select = event.target.closest(".lobby-select-team");
    if (!select || !currentLobby) return;
    const team = Number(select.value);
    if (!Number.isFinite(team)) return;
    socket.emit("setLobbyTeam", { id: currentLobby.id, team });
  });
}

if (lobbyModal) {
  lobbyModal.addEventListener("click", (event) => {
    if (event.target === lobbyModal) {
      setLobbyModal(false);
    }
  });
}

if (lobbyNameInput) {
  lobbyNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitLobbyCreate();
    }
  });
}

if (confirmResignButton) {
  confirmResignButton.addEventListener("click", () => {
    setResignModal(false);
    sendCommand({ type: "resign" }, { expectAck: false });
  });
}

if (cancelResignButton) {
  cancelResignButton.addEventListener("click", () => {
    setResignModal(false);
  });
}

if (resignModal) {
  resignModal.addEventListener("click", (event) => {
    if (event.target === resignModal) {
      setResignModal(false);
    }
  });
}

socket.on("queue", () => {
  statusEl.textContent = "Waiting for another player...";
  isSearching = true;
  if (playButton) playButton.textContent = "Cancel";
});

function renderLobbyList(lobbies = []) {
  if (!lobbyListEl) return;
  lobbyListEl.innerHTML = "";
  if (!lobbies.length) {
    lobbyListEl.innerHTML = `<div class="lobby-entry"><div class="meta">No lobbies found.</div></div>`;
    return;
  }
  lobbies.forEach((lobby) => {
    const entry = document.createElement("div");
    entry.className = "lobby-entry";
    const meta = document.createElement("div");
    meta.className = "meta";
    const title = document.createElement("div");
    title.textContent = lobby.name;
    const count = document.createElement("span");
    count.textContent = `${lobby.players}/${lobby.capacity}`;
    meta.appendChild(title);
    meta.appendChild(count);
    const joinBtn = document.createElement("button");
    joinBtn.textContent = "Join";
    const full = lobby.players >= lobby.capacity;
    joinBtn.disabled = full || !!currentLobby;
    joinBtn.addEventListener("click", () => {
      socket.emit("joinLobby", { id: lobby.id }, (response) => {
        if (response && response.ok === false) {
          const reason = response.reason || "unknown";
          const friendly = {
            not_found: "Lobby not found.",
            full: "Lobby is full.",
            already_in_match: "Already in a match.",
          }[reason] || "Unable to join lobby.";
          showBanner(friendly, "error");
          return;
        }
      });
    });
    entry.appendChild(meta);
    entry.appendChild(joinBtn);
    lobbyListEl.appendChild(entry);
  });
}

function setLobbyView(active) {
  if (lobbyBrowser) lobbyBrowser.classList.toggle("hidden", !!active);
  if (lobbyRoom) lobbyRoom.classList.toggle("hidden", !active);
}

function isLobbyReadyToStart(lobby) {
  if (!lobby) return false;
  const playerCount = Array.isArray(lobby.players)
    ? lobby.players.length
    : Number(lobby.players || 0);
  if (playerCount < 2) return false;
  const assignments = lobby.teamAssignments || {};
  const teams = new Set();
  const ids = Array.isArray(lobby.players)
    ? lobby.players.map((p) => (typeof p === "string" ? p : p.id)).filter(Boolean)
    : [];
  if (ids.length) {
    ids.forEach((id) => {
      const team = Number(assignments[id] || 1);
      teams.add(team);
    });
  } else {
    Object.values(assignments).forEach((team) => teams.add(Number(team)));
  }
  return teams.size >= 2;
}

function setLobbyModal(open) {
  if (!lobbyModal) return;
  lobbyModal.classList.toggle("hidden", !open);
  if (open && lobbyNameInput) {
    lobbyNameInput.value = lobbyNameInput.value || "";
    lobbyNameInput.focus();
  }
}

function setResignModal(open) {
  if (!resignModal) return;
  resignModal.classList.toggle("hidden", !open);
}

function submitLobbyCreate() {
  const name = (lobbyNameInput?.value || "").trim();
  setLobbyModal(false);
  socket.emit("createLobby", { name }, (response) => {
    if (response && response.ok === false) {
      const reason = response.reason || "unknown";
      const friendly = {
        already_in_match: "Already in a match.",
      }[reason] || "Unable to create lobby.";
      showBanner(friendly, "error");
    }
  });
}

function renderLobbyRoom(lobby) {
  if (!lobbyRoomPlayers || !lobbyRoomName) return;
  lobbyRoomName.textContent = lobby?.name ? `Lobby: ${lobby.name}` : "Lobby";
  const players = lobby?.players || [];
  if (!players.length) {
    lobbyRoomPlayers.innerHTML = `<div class="lobby-player">Waiting for players...</div>`;
    return;
  }
  lobbyRoomPlayers.innerHTML = players
    .map((player, idx) => {
      const label = player.label || `Player ${idx + 1}`;
      const team = Number(player.team || lobby?.teamAssignments?.[player.id] || 1);
      const isSelf = player.id === socket.id;
      const hostTag = player.isHost ? "<span>Host</span>" : "<span>Guest</span>";
      const selfTag = isSelf ? "<span>You</span>" : "";
      return `<div class="lobby-player${isSelf ? " self" : ""}">${label} - Team ${team}${selfTag}${hostTag}</div>`;
    })
    .join("");
  if (lobbyCheatsToggle) {
    lobbyCheatsToggle.checked = !!lobby.allowCheats;
    lobbyCheatsToggle.disabled = !lobby.isHost;
  }
  if (lobbyColors) {
    const assignments = lobby.colorAssignments || {};
    const taken = new Set(Object.values(assignments || {}));
    selectedColorId = assignments[socket.id] || selectedColorId;
    const selectedColor =
      assignments[socket.id] ||
      selectedColorId ||
      PLAYER_COLOR_OPTIONS?.[0]?.id ||
      "";
    const colorOptions = (PLAYER_COLOR_OPTIONS || [])
      .map((color) => {
        const isTaken = taken.has(color.id) && assignments[socket.id] !== color.id;
        const selectedAttr = selectedColor === color.id ? "selected" : "";
        const disabledAttr = isTaken ? "disabled" : "";
        const suffix = isTaken ? " (Taken)" : "";
        return `<option value="${color.id}" ${selectedAttr} ${disabledAttr}>${color.name}${suffix}</option>`;
      })
      .join("");
    lobbyColors.innerHTML = `
      <label class="lobby-select-row">
        <span>Color</span>
        <select class="lobby-select-color">${colorOptions}</select>
      </label>
    `;
  }
  if (lobbyTeams) {
    const teamAssignments = lobby.teamAssignments || {};
    const selectedTeam = Number(teamAssignments[socket.id] || 1);
    const teamOptions = [1, 2, 3, 4]
      .map(
        (team) =>
          `<option value="${team}" ${
            selectedTeam === team ? "selected" : ""
          }>Team ${team}</option>`
      )
      .join("");
    lobbyTeams.innerHTML = `
      <label class="lobby-select-row">
        <span>Team</span>
        <select class="lobby-select-team">${teamOptions}</select>
      </label>
    `;
  }
}

socket.on("lobbyList", (list) => {
  renderLobbyList(list || []);
  if (currentLobby && startLobbyButton) {
    const lobby = (list || []).find((entry) => entry.id === currentLobby.id);
    const ready = isLobbyReadyToStart(currentLobby);
    startLobbyButton.disabled = !(isLobbyHost && ready);
  }
});

socket.on("lobbyJoined", (lobby) => {
  currentLobby = lobby;
  isLobbyHost = lobby.isHost || false;
  allowCheats = !!lobby.allowCheats;
  selectedColorId = lobby.colorAssignments?.[socket.id] || null;
  if (leaveLobbyButton) leaveLobbyButton.disabled = false;
  if (createLobbyButton) createLobbyButton.disabled = true;
  if (lobbyNameInput) lobbyNameInput.disabled = true;
  if (startLobbyButton) {
    const ready = isLobbyReadyToStart(lobby);
    startLobbyButton.disabled = !(isLobbyHost && ready);
  }
  statusEl.textContent = `Lobby: ${lobby.name}`;
  setLobbyView(true);
  setLobbyModal(false);
  renderLobbyRoom(lobby);
  renderLobbyList([]);
});

socket.on("lobbyLeft", () => {
  currentLobby = null;
  isLobbyHost = false;
  allowCheats = false;
  selectedColorId = null;
  if (leaveLobbyButton) leaveLobbyButton.disabled = true;
  if (createLobbyButton) createLobbyButton.disabled = false;
  if (lobbyNameInput) lobbyNameInput.disabled = false;
  if (startLobbyButton) startLobbyButton.disabled = true;
  statusEl.textContent = "Idle";
  setLobbyView(false);
  setLobbyModal(false);
  socket.emit("requestLobbies");
});

socket.on("lobbyUpdate", (lobby) => {
  if (!currentLobby || lobby.id !== currentLobby.id) return;
  currentLobby = lobby;
  isLobbyHost = lobby.isHost || false;
  allowCheats = !!lobby.allowCheats;
  selectedColorId = lobby.colorAssignments?.[socket.id] || null;
  renderLobbyRoom(lobby);
  if (startLobbyButton) {
    const ready = isLobbyReadyToStart(lobby);
    startLobbyButton.disabled = !(isLobbyHost && ready);
  }
});

socket.on("matchStart", (payload) => {
  overlay.classList.add("hidden");
  isSearching = false;
  if (playButton) playButton.textContent = "Play";
  currentLobby = null;
  if (leaveLobbyButton) leaveLobbyButton.disabled = true;
  if (createLobbyButton) createLobbyButton.disabled = false;
  if (lobbyNameInput) lobbyNameInput.disabled = false;
  if (startLobbyButton) startLobbyButton.disabled = true;
  setLobbyView(false);
  setLobbyModal(false);
  setResignModal(false);
  if (bottomBar) bottomBar.classList.add("hidden");
  map = payload.map;
  resources = payload.resources;
  relics = payload.relics || [];
  units = payload.units;
  buildings = payload.buildings;
  players = payload.players;
  playerIndex = payload.playerIndex;
  isSingleplayer = !!payload.singleplayer;
  allowCheats = !!payload.allowCheats;
  selectedColorId = null;
  selectedUnits = [];
  selectedBuilding = null;
  selectedBuildings = [];
  selectedResource = null;
  selectedRelic = null;
  selectionBox = null;
  isDraggingSelection = false;
  attackMoveArmed = false;
  dropRelicArmed = false;
  healArmed = false;
  repairArmed = false;
  unitRenderState.clear();
  unitLastHealth.clear();
  buildingLastHealth.clear();
  unitDamageTime.clear();
  unitRecoverTime.clear();
  buildingDamageTime.clear();
  buildingRepairTime.clear();
  projectiles.length = 0;
  projectileImpacts.length = 0;
  lastStateUpdate = performance.now();
  units.forEach((unit) => {
    unitRenderState.set(unit.id, {
      fromX: unit.x,
      fromY: unit.y,
      toX: unit.x,
      toY: unit.y,
      renderX: unit.x,
      renderY: unit.y,
      startTime: lastStateUpdate,
      duration: DEFAULT_INTERP_MS,
    });
    unitLastHealth.set(unit.id, unit.health ?? unit.hp ?? 0);
  });
  buildings.forEach((building) => {
    buildingLastHealth.set(building.id, building.health ?? building.hp ?? 0);
  });

  const tc = buildings.find(
    (b) => b.ownerId === playerIndex && b.type === "TownCenter"
  );
  if (tc) {
    camera.x = tc.x * map.tileSize - canvas.width / 2 + 2 * map.tileSize;
    camera.y = tc.y * map.tileSize - canvas.height / 2 + 2 * map.tileSize;
  }

  fogVisible = new Uint8Array(map.width * map.height);
  fogExplored = new Uint8Array(map.width * map.height);
  tempVisionReveals.length = 0;

  renderCheatBar();
  updateSelectionUI();
});

socket.on("stateUpdate", (payload) => {
  const prevUnits = new Map(units.map((u) => [u.id, u]));
  const prevBuildings = new Map(buildings.map((b) => [b.id, b]));
  const prevPlayers = new Map(players.map((p) => [p.index, p]));
  units = payload.units;
  buildings = payload.buildings;
  players = payload.players;
  resources = payload.resources || resources;
  relics = payload.relics || relics;
  if (payload.fogReveal !== undefined) {
    fogCheatReveal = payload.fogReveal;
  }
  if (payload.attacks && payload.attacks.length) {
    const now = performance.now();
    payload.attacks.forEach((attack) => {
      const speed = 12;
      const dx = attack.to.x - attack.from.x;
      const dy = attack.to.y - attack.from.y;
      const distance = Math.hypot(dx, dy);
      const duration = Math.max(120, (distance / speed) * 1000);
      projectiles.push({
        from: attack.from,
        to: attack.to,
        type: attack.type,
        startTime: now,
        duration,
      });
    });
  }
  const now = performance.now();
  const interval = lastStateUpdate ? Math.max(20, now - lastStateUpdate) : DEFAULT_INTERP_MS;
  const seen = new Set();
  units.forEach((unit) => {
    const existing = unitRenderState.get(unit.id);
    const fromX = existing ? existing.renderX : unit.x;
    const fromY = existing ? existing.renderY : unit.y;
    unitRenderState.set(unit.id, {
      fromX,
      fromY,
      toX: unit.x,
      toY: unit.y,
      renderX: fromX,
      renderY: fromY,
      startTime: now,
      duration: interval,
    });
    seen.add(unit.id);
    const prev = prevUnits.get(unit.id);
    const prevHealth = prev ? prev.health ?? prev.hp ?? 0 : 0;
    const currentHealth = unit.health ?? unit.hp ?? 0;
    if (prev && currentHealth < prevHealth) {
      unitDamageTime.set(unit.id, now);
    } else if (prev && currentHealth > prevHealth) {
      unitRecoverTime.set(unit.id, now);
    }
    unitLastHealth.set(unit.id, currentHealth);
  });
  for (const id of unitRenderState.keys()) {
    if (!seen.has(id)) {
      unitRenderState.delete(id);
    }
  }
  for (const id of unitLastHealth.keys()) {
    if (!seen.has(id)) {
      unitLastHealth.delete(id);
      unitDamageTime.delete(id);
      unitRecoverTime.delete(id);
    }
  }
  const seenBuildings = new Set();
  buildings.forEach((building) => {
    seenBuildings.add(building.id);
    const prev = prevBuildings.get(building.id);
    const prevHealth = prev ? prev.health ?? prev.hp ?? 0 : 0;
    const currentHealth = building.health ?? building.hp ?? 0;
    if (prev && currentHealth < prevHealth) {
      buildingDamageTime.set(building.id, now);
    } else if (prev && currentHealth > prevHealth && !building.isUnderConstruction) {
      buildingRepairTime.set(building.id, now);
    }
    buildingLastHealth.set(building.id, currentHealth);
  });
  for (const id of buildingLastHealth.keys()) {
    if (!seenBuildings.has(id)) {
      buildingLastHealth.delete(id);
      buildingDamageTime.delete(id);
      buildingRepairTime.delete(id);
    }
  }
  lastStateUpdate = now;
  if (selectedUnits.length) {
    const unitById = new Map(units.map((u) => [u.id, u]));
    selectedUnits = selectedUnits
      .map((u) => unitById.get(u.id))
      .filter(Boolean);
  }
  if (selectedBuilding) {
    const fresh = buildings.find((b) => b.id === selectedBuilding.id);
    selectedBuilding = fresh ? { ...fresh } : null;
  }
  if (selectedBuildings.length) {
    const byId = new Map(buildings.map((b) => [b.id, b]));
    selectedBuildings = selectedBuildings
      .map((b) => byId.get(b.id))
      .filter(Boolean)
      .map((b) => ({ ...b }));
    selectedBuilding = selectedBuildings[0] || null;
  }
  if (selectedResource) {
    const fresh = resources.find((r) => r.id === selectedResource.id);
    selectedResource = fresh ? { ...fresh } : null;
  }
  if (selectedRelic) {
    const fresh = relics.find((r) => r.id === selectedRelic.id);
    selectedRelic = fresh ? { ...fresh } : null;
  }
  const playerPrev = prevPlayers.get(playerIndex);
  const playerNow = players.find((p) => p.index === playerIndex);
  const ageTier = playerNow?.ageTier ?? null;
  const ageChanged = ageTier !== lastUiAgeTier;
  if (ageChanged) {
    lastUiAgeTier = ageTier;
  }
  const resourcesChanged = didPlayerResourcesChange(
    playerPrev?.resources,
    playerNow?.resources
  );
  const selectedBuildingChanged = didSelectedBuildingUiChange(
    prevBuildings,
    selectedBuildings
  );
  const selectedUnitChanged = didSelectedUnitUiChange(prevUnits, selectedUnits);
  const hasSelection =
    !!selectedBuilding ||
    selectedBuildings.length > 0 ||
    selectedUnits.length > 0 ||
    !!selectedResource ||
    !!selectedRelic;
  const shouldRebuildBottomBar =
    hasSelection && (selectedBuildingChanged || selectedUnitChanged || ageChanged);
  if (shouldRebuildBottomBar) {
    updateSelectionUI();
  } else if (hasSelection && resourcesChanged) {
    // Keep buttons stable while still updating selection text that can depend on resources.
    refreshSelectionDetails();
  } else {
    refreshSelectionDetails();
  }
});

socket.on("matchEnded", (payload = {}) => {
  overlay.classList.remove("hidden");
  if (payload.reason === "team_victory" && Number.isFinite(payload.winnerTeam)) {
    statusEl.textContent = `Team ${payload.winnerTeam} wins. Choose multiplayer or singleplayer to start again.`;
  } else {
    statusEl.textContent = "Match ended. Choose multiplayer or singleplayer to start again.";
  }
  isSearching = false;
  allowCheats = false;
  if (playButton) playButton.textContent = "Play";
  currentLobby = null;
  if (leaveLobbyButton) leaveLobbyButton.disabled = true;
  if (createLobbyButton) createLobbyButton.disabled = false;
  if (lobbyNameInput) lobbyNameInput.disabled = false;
  if (startLobbyButton) startLobbyButton.disabled = true;
  socket.emit("requestLobbies");
  setLobbyView(false);
  setLobbyModal(false);
  setResignModal(false);
  if (bottomBar) bottomBar.classList.add("hidden");
  selectedUnits = [];
  selectedBuilding = null;
  selectedBuildings = [];
  selectedResource = null;
  selectedRelic = null;
  selectionBox = null;
  isDraggingSelection = false;
  attackMoveArmed = false;
  dropRelicArmed = false;
  healArmed = false;
  repairArmed = false;
  buildMode = null;
  pendingCheat = null;
  unitRenderState.clear();
  unitFacing.clear();
  unitDamageTime.clear();
  unitRecoverTime.clear();
  buildingDamageTime.clear();
  buildingRepairTime.clear();
  projectiles.length = 0;
  projectileImpacts.length = 0;
  minimapAlerts.length = 0;
  tempVisionReveals.length = 0;
  relics = [];
  fogVisible = new Uint8Array(map.width * map.height);
  fogExplored = new Uint8Array(map.width * map.height);
  updateSelectionUI();
  renderCheatBar();
});

socket.on("attackAlert", (payload) => {
  if (!payload?.isAlly) {
    lastAttackLocation = { x: payload.x, y: payload.y };
    lastAttackTime = performance.now();
  }
  if (attackNotify) {
    const text = payload?.isAlly
      ? "Ally under attack!"
      : payload.kind === "landmark"
      ? "Landmark under attack!"
      : payload.kind === "building"
      ? "Buildings under attack!"
      : "Units under attack!";
    attackNotify.textContent = text;
    attackNotify.classList.add("visible");
    setTimeout(() => {
      attackNotify.classList.remove("visible");
    }, 2500);
  }
  minimapAlerts.push({
    x: payload.x,
    y: payload.y,
    ally: !!payload?.isAlly,
    time: performance.now(),
  });
  if (
    Number.isFinite(payload.attackerX) &&
    Number.isFinite(payload.attackerY)
  ) {
    tempVisionReveals.push({
      x: payload.attackerX,
      y: payload.attackerY,
      radius: ATTACK_REVEAL_RADIUS,
      expiresAt: performance.now() + ATTACK_REVEAL_DURATION_MS,
    });
  }
  playSound("under_attack");
});

socket.on("landmarkDestroyed", () => {
  if (!researchNotify) return;
  const toast = document.createElement("div");
  toast.className = "research-toast";
  toast.textContent = "Enemy destroyed Landmark";
  researchNotify.appendChild(toast);
  researchNotify.classList.add("visible");
  setTimeout(() => {
    toast.remove();
    if (!researchNotify.querySelector(".research-toast")) {
      researchNotify.classList.remove("visible");
    }
  }, 3500);
});

socket.on("researchComplete", (payload) => {
  const name = payload?.name || "Research";
  if (!researchNotify) return;
  const toast = document.createElement("div");
  toast.className = "research-toast";
  toast.textContent = `${name} completed`;
  researchNotify.appendChild(toast);
  researchNotify.classList.add("visible");
  setTimeout(() => {
    toast.remove();
    if (!researchNotify.querySelector(".research-toast")) {
      researchNotify.classList.remove("visible");
    }
  }, 3000);
  playSound(payload?.isAge ? "age_advance" : "research_complete");

  if (payload?.techId) {
    if (payload.scope === "building" && payload.buildingId) {
      const building = buildings.find((b) => b.id === payload.buildingId);
      if (building) {
        building.techs = building.techs || {};
        building.techs[payload.techId] = true;
      }
    } else if (playerIndex !== null) {
      const player = players.find((p) => p.index === playerIndex);
      if (player) {
        player.techs = player.techs || {};
        player.techs[payload.techId] = true;
      }
    }
  }
  if (payload?.isAge && playerIndex !== null) {
    const player = players.find((p) => p.index === playerIndex);
    if (player) {
      if (typeof payload.ageTier === "number") {
        player.ageTier = payload.ageTier;
      }
      if (payload.age) {
        player.age = payload.age;
      }
    }
  }

  if (payload?.isAge && ageNotify) {
    const ageToast = document.createElement("div");
    ageToast.className = "age-toast";
    ageToast.textContent = "A new age begins";
    ageNotify.innerHTML = "";
    ageNotify.appendChild(ageToast);
    ageNotify.classList.add("visible");
    setTimeout(() => {
      ageNotify.classList.remove("visible");
      ageNotify.innerHTML = "";
    }, 3000);
  }

  updateSelectionUI();
});

socket.on("playerResigned", (payload) => {
  const resignedIndex = Number(payload?.playerIndex);
  if (!Number.isFinite(resignedIndex)) return;
  if (playerIndex !== null && resignedIndex === playerIndex) return;
  const label = payload?.label || `Player ${resignedIndex + 1}`;
  if (researchNotify) {
    const toast = document.createElement("div");
    toast.className = "research-toast resign-toast";
    toast.textContent = `${label} resigned`;
    researchNotify.appendChild(toast);
    researchNotify.classList.add("visible");
    setTimeout(() => {
      toast.remove();
      if (!researchNotify.querySelector(".research-toast")) {
        researchNotify.classList.remove("visible");
      }
    }, 3500);
  }
  showBanner(`${label} resigned.`, "info", 2500);
});

socket.on("unitComplete", () => {
  playSound("unit_complete");
});

socket.on("buildingComplete", () => {
  playSound("building_complete");
});

function worldToScreen(x, y) {
  return {
    x: x * map.tileSize - camera.x,
    y: y * map.tileSize - camera.y,
  };
}

function screenToWorld(x, y) {
  return {
    x: (x + camera.x) / map.tileSize,
    y: (y + camera.y) / map.tileSize,
  };
}

function drawGrid() {
  const startX = Math.floor(camera.x / map.tileSize);
  const startY = Math.floor(camera.y / map.tileSize);
  const endX = startX + Math.ceil(canvas.width / map.tileSize) + 1;
  const endY = startY + Math.ceil(canvas.height / map.tileSize) + 1;

  ctx.fillStyle = "#2b3138";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const screen = worldToScreen(x, y);
      ctx.fillStyle = (x + y) % 2 === 0 ? "#2d343d" : "#2a3037";
      ctx.fillRect(screen.x, screen.y, map.tileSize, map.tileSize);
    }
  }
}

function drawResources() {
  resources.forEach((node) => {
    const cx = node.x + node.size / 2;
    const cy = node.y + node.size / 2;
    if (playerIndex !== null && !isExplored(cx, cy)) {
      return;
    }
    const def = RESOURCE_DEFS[node.type];
    const center = worldToScreen(cx, cy);
    const radius = (node.size * map.tileSize) / 2;
    const visible =
      playerIndex === null ? true : isVisible(cx, cy);
    ctx.fillStyle = visible ? def.color : "rgba(120, 120, 120, 0.6)";
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (selectedResource && selectedResource.id === node.id) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

function drawHealthBar(x, y, width, height, ratio) {
  const clamped = Math.max(0, Math.min(1, ratio));
  ctx.fillStyle = "#e74c3c";
  ctx.fillRect(x, y, width, height);
  if (clamped > 0) {
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(x, y, width * clamped, height);
  }
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}

function getBuildingDefaultReloadData(building, def) {
  if (!building || !def) return null;
  if (building.type === "StoneTower") {
    return {
      key: "springald",
      total: 4,
      remaining: Math.max(0, Number(building.attackCooldowns?.springald || 0)),
    };
  }
  if (building.type === "DisruptorCannon") {
    return {
      key: "disruptor",
      total: Math.max(0.001, Number(def.attack?.cooldown || 10)),
      remaining: Math.max(0, Number(building.attackCooldowns?.disruptor || 0)),
    };
  }
  return null;
}

function drawRelicIcon(x, y, size, strokeWidth = 2) {
  ctx.fillStyle = "#f1c40f";
  ctx.beginPath();
  ctx.moveTo(x - size * 0.45, y - size * 0.2);
  ctx.lineTo(x + size * 0.45, y - size * 0.2);
  ctx.lineTo(x + size * 0.25, y + size * 0.15);
  ctx.lineTo(x - size * 0.25, y + size * 0.15);
  ctx.closePath();
  ctx.fill();

  ctx.fillRect(x - size * 0.12, y + size * 0.15, size * 0.24, size * 0.26);
  ctx.fillRect(x - size * 0.3, y + size * 0.4, size * 0.6, size * 0.12);

  ctx.strokeStyle = "#c39b09";
  ctx.lineWidth = strokeWidth;
  ctx.strokeRect(x - size * 0.45, y - size * 0.2, size * 0.9, size * 0.35);
}

function getBuildingRangeRingTiles(buildingType, buildingTechs = null) {
  const def = BUILDINGS[buildingType];
  if (!def) return 0;
  let range = def.attack?.range || 0;
  if (buildingType === "Outpost" && buildingTechs?.Arrowslits) {
    range = Math.max(range, 7);
  }
  if (buildingType === "StoneTower") {
    range = Math.max(range, 9);
  }
  if (
    (buildingType === "Outpost" ||
      buildingType === "Castle" ||
      buildingType === "DominionSpire") &&
    buildingTechs?.SpringaldEmplacement
  ) {
    range = Math.max(range, 9);
  }
  return range;
}

function getBuildingMinRangeRingTiles(buildingType) {
  const def = BUILDINGS[buildingType];
  if (!def) return 0;
  return Math.max(0, Number(def.attack?.minRange || 0));
}

function getBuildingAuraRingTiles(buildingType) {
  if (buildingType === "SanctumOfTheVeil") {
    return LANDMARK_BONUSES?.SanctumOfTheVeil?.auraRange || 6;
  }
  if (buildingType === "BasilicaOfEternalLight") {
    return LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraRange || 15;
  }
  if (buildingType === "GoldenFountainSquare") {
    return LANDMARK_BONUSES?.GoldenFountainSquare?.auraRange || 6;
  }
  return 0;
}

function getLandmarkRoleIconKey(buildingType) {
  if (!isLandmarkType(buildingType)) return null;
  const tag = String(BUILDINGS[buildingType]?.tag || "").toLowerCase();
  if (tag.includes("economic")) return "economic";
  if (tag.includes("military")) return "military";
  if (tag.includes("religious")) return "religious";
  if (tag.includes("technology")) return "technology";
  if (tag.includes("defensive")) return "defensive";
  return null;
}

function drawLandmarkRoleIconOverlay(building, screen, sizePx) {
  const role = getLandmarkRoleIconKey(building.type);
  if (!role) return;
  const icon = landmarkRoleImages[role];
  if (!icon || !icon.complete) return;
  const iconSize = Math.max(12, Math.min(sizePx * 0.35, 24));
  const iconX = screen.x + (sizePx - iconSize) / 2;
  const iconY = screen.y + Math.max(2, sizePx * 0.04);
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(iconX - 2, iconY - 2, iconSize + 4, iconSize + 4);
  // Force icon art to render as white regardless of source color.
  ctx.filter = "brightness(0) invert(1)";
  ctx.drawImage(icon, iconX, iconY, iconSize, iconSize);
  ctx.restore();
}

function drawBuildings() {
  buildings.forEach((building) => {
    const def = BUILDINGS[building.type];
    if (!def) return;
    if (def.isNeutral) return;
    if (
      playerIndex !== null &&
      building.ownerId !== playerIndex &&
      !def.isNeutral &&
      !isVisible(
        building.x + def.size / 2,
        building.y + def.size / 2
      )
    ) {
      return;
    }
    const screen = worldToScreen(building.x, building.y);
    const sizePx = def.size * map.tileSize;
    const img = buildingImages[def.name];
    if (building.ownerId !== null && building.ownerId !== undefined) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = getPlayerColor(building.ownerId);
      ctx.fillRect(screen.x, screen.y, sizePx, sizePx);
      ctx.restore();
    }
    if (img && img.complete) {
      ctx.drawImage(img, screen.x, screen.y, sizePx, sizePx);
    } else {
      ctx.fillStyle = "#9b59b6";
      ctx.fillRect(screen.x, screen.y, sizePx, sizePx);
    }
    const damageTime = buildingDamageTime.get(building.id);
    if (damageTime && performance.now() - damageTime < 220) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(screen.x, screen.y, sizePx, sizePx);
      ctx.restore();
    }
    const destroyedLandmark = isDestroyedLandmarkClient(building);
    if (destroyedLandmark) {
      ctx.save();
      ctx.fillStyle = "rgba(20, 20, 20, 0.58)";
      ctx.fillRect(screen.x, screen.y, sizePx, sizePx);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(screen.x + 6, screen.y + 6);
      ctx.lineTo(screen.x + sizePx - 6, screen.y + sizePx - 6);
      ctx.moveTo(screen.x + sizePx - 6, screen.y + 6);
      ctx.lineTo(screen.x + 6, screen.y + sizePx - 6);
      ctx.stroke();
      ctx.restore();
    }
    drawLandmarkRoleIconOverlay(building, screen, sizePx);
    const isSelected = selectedBuildings.some((sel) => sel.id === building.id);
    ctx.strokeStyle = isSelected ? "#b6ff9a" : "#000000";
    ctx.lineWidth = 2;
    ctx.strokeRect(screen.x, screen.y, sizePx, sizePx);

    if (isSelected && !destroyedLandmark) {
      const range = getBuildingRangeRingTiles(building.type, building.techs);
      const minRange = getBuildingMinRangeRingTiles(building.type);
      const auraRange = getBuildingAuraRingTiles(building.type);
      const centerX = building.x + def.size / 2;
      const centerY = building.y + def.size / 2;
      const centerScreen = worldToScreen(centerX, centerY);
      if (range > 0) {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(182, 255, 154, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(
          centerScreen.x,
          centerScreen.y,
          range * map.tileSize,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }
      if (minRange > 0) {
        ctx.save();
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = "rgba(240, 60, 60, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(
          centerScreen.x,
          centerScreen.y,
          minRange * map.tileSize,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }
      if (auraRange > 0) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          centerScreen.x,
          centerScreen.y,
          auraRange * map.tileSize,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }
    }

    if (building.rallyPoint && isSelected) {
      const centerX = building.x + def.size / 2;
      const centerY = building.y + def.size / 2;
      const rally = worldToScreen(building.rallyPoint.x, building.rallyPoint.y);
      const centerScreen = worldToScreen(centerX, centerY);
      const color = getPlayerColor(building.ownerId);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerScreen.x, centerScreen.y);
      ctx.lineTo(rally.x, rally.y);
      ctx.stroke();

      const poleHeight = Math.max(10, map.tileSize * 0.35);
      const poleWidth = Math.max(2, map.tileSize * 0.05);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = poleWidth;
      ctx.beginPath();
      ctx.moveTo(rally.x, rally.y);
      ctx.lineTo(rally.x, rally.y - poleHeight);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(rally.x, rally.y - poleHeight);
      ctx.lineTo(rally.x + poleHeight * 0.5, rally.y - poleHeight * 0.8);
      ctx.lineTo(rally.x, rally.y - poleHeight * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    const lastDamage = buildingDamageTime.get(building.id) || 0;
    const lastRepair = buildingRepairTime.get(building.id) || 0;
    if (
      !def.isNeutral &&
      (isSelected ||
        performance.now() - lastDamage < DAMAGE_BAR_DURATION_MS ||
        performance.now() - lastRepair < REPAIR_BAR_GRACE_MS)
    ) {
      const barHeight = Math.max(4, Math.floor(map.tileSize * 0.12));
      const barY = screen.y + sizePx + 2 - (barHeight + 2);
      const currentHealth = building.health ?? building.hp ?? 0;
      const maxHealth =
        building.maxHp || def.health || building.health || building.hp || 1;
      drawHealthBar(
        screen.x,
        barY,
        sizePx,
        barHeight,
        currentHealth / maxHealth
      );
    }

    if (building.productionQueue && building.productionQueue.length > 0) {
      const job = building.productionQueue[0];
      const total =
        job.total ||
        (job.techId
          ? TECHNOLOGIES[job.techId]?.researchTime
          : UNITS[job.unitType]?.buildTime) ||
        1;
      const progress = Math.max(0, Math.min(1, 1 - job.remaining / total));
      const barHeight = Math.max(4, Math.floor(map.tileSize * 0.12));
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(
        screen.x,
        screen.y + sizePx + 2,
        sizePx,
        barHeight
      );
      ctx.fillStyle = job.techId ? "#f1c40f" : "#2ecc71";
      ctx.fillRect(
        screen.x,
        screen.y + sizePx + 2,
        sizePx * progress,
        barHeight
      );
    }

    const reload = getBuildingDefaultReloadData(building, def);
    if (reload && reload.remaining > 0.001) {
      const total = Math.max(0.001, reload.total || 1);
      const progress = Math.max(0, Math.min(1, 1 - reload.remaining / total));
      const barHeight = Math.max(4, Math.floor(map.tileSize * 0.12));
      let barY = screen.y + sizePx + 2;
      if (building.productionQueue && building.productionQueue.length > 0) {
        barY += barHeight + 2;
      }
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(screen.x, barY, sizePx, barHeight);
      ctx.fillStyle = "#f39c12";
      ctx.fillRect(screen.x, barY, sizePx * progress, barHeight);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.strokeRect(screen.x, barY, sizePx, barHeight);
    }

    if (building.isUnderConstruction && building.buildTime > 0) {
      const progress = Math.max(
        0,
        Math.min(1, building.buildProgress / building.buildTime)
      );
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(screen.x, screen.y, sizePx, sizePx);
      const barHeight = Math.max(4, Math.floor(map.tileSize * 0.12));
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(screen.x, screen.y - barHeight - 2, sizePx, barHeight);
      ctx.fillStyle = "#f1c40f";
      ctx.fillRect(
        screen.x,
        screen.y - barHeight - 2,
        sizePx * progress,
        barHeight
      );
    }

    if (isRelicBuildingType(building.type)) {
      const relicCount = (building.relicIds || []).length;
      if (relicCount > 0) {
        const iconSize = Math.max(10, map.tileSize * 0.28);
        const spacing = iconSize * 1.15;
        const totalSpan = (relicCount - 1) * spacing;
        const iconY = screen.y - iconSize * 0.9;
        for (let i = 0; i < relicCount; i++) {
          const iconX = screen.x + sizePx / 2 - totalSpan / 2 + i * spacing;
          ctx.strokeStyle = "#f1c40f";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(iconX, iconY + iconSize * 0.08, iconSize * 0.85, 0, Math.PI * 2);
          ctx.stroke();
          drawRelicIcon(iconX, iconY, iconSize, 1.8);
        }
      }
    }
  });
}

function drawRelics() {
  relics.forEach((relic) => {
    if (relic.carrierId || relic.storedInBuildingId) return;
    if (playerIndex !== null && !isExplored(relic.x, relic.y)) return;
    const screen = worldToScreen(relic.x, relic.y);
    const size = Math.max(10, map.tileSize * 0.28);

    drawRelicIcon(screen.x, screen.y, size, 2);

    if (selectedRelic && selectedRelic.id === relic.id) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y + size * 0.1, size * 0.75, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function drawNeutralBuildings() {
  buildings.forEach((building) => {
    const def = BUILDINGS[building.type];
    if (!def || !def.isNeutral) return;
    const screen = worldToScreen(building.x, building.y);
    const sizePx = def.size * map.tileSize;
    const img = buildingImages[def.name];
    if (img && img.complete) {
      ctx.drawImage(img, screen.x, screen.y, sizePx, sizePx);
    } else {
      ctx.fillStyle = "#95a5a6";
      ctx.fillRect(screen.x, screen.y, sizePx, sizePx);
    }
    const isSelected = selectedBuildings.some((sel) => sel.id === building.id);
    ctx.strokeStyle = isSelected ? "#b6ff9a" : "#000000";
    ctx.lineWidth = 2;
    ctx.strokeRect(screen.x, screen.y, sizePx, sizePx);
    if (building.ownerId !== null && building.ownerId !== undefined) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = getPlayerColor(building.ownerId);
      ctx.fillRect(screen.x, screen.y, sizePx, sizePx);
      ctx.restore();
    }
  });
}

function drawUnits() {
  units.forEach((unit) => {
    if (
      playerIndex !== null &&
      unit.ownerId !== playerIndex &&
      !isVisible(unit.x, unit.y)
    ) {
      return;
    }
    const renderState = unitRenderState.get(unit.id);
    const posX = renderState ? renderState.renderX : unit.x;
    const posY = renderState ? renderState.renderY : unit.y;
    const screen = worldToScreen(posX, posY);
    const def = UNITS[unit.type] || {};
    const baseRadius = map.tileSize * 0.25;
    const isSiege = !!def.type?.includes("Siege");
    const isSelected = selectedUnits.some((sel) => sel.id === unit.id);
    const radius = isSiege ? baseRadius * 2 : baseRadius;
    let angle = unitFacing.get(unit.id);
    if (!Number.isFinite(angle)) {
      angle = Number.isFinite(unit.facing) ? unit.facing : 0;
    }

    let targetAngle = null;
    if (renderState) {
      const dx = renderState.toX - renderState.fromX;
      const dy = renderState.toY - renderState.fromY;
      if (Math.hypot(dx, dy) > 0.02) {
        targetAngle = Math.atan2(dy, dx);
      }
    }
    if (targetAngle === null && Number.isFinite(unit.facing)) {
      targetAngle = unit.facing;
    }
    if (targetAngle !== null) {
      const turnRate = 0.18;
      const diff = normalizeAngle(targetAngle - angle);
      angle = angle + diff * turnRate;
      unitFacing.set(unit.id, angle);
    }

    if (isSelected && isSiege) {
      const owner = players.find((p) => p.index === unit.ownerId) || null;
      const range = (def.range || 0.5) + getGunpowderSiegeRangeBonus(owner, unit.type);
      const minRange = Math.max(0, Number(def.minRange || 0));
      if (range > 0.5) {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(182, 255, 154, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, range * map.tileSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (minRange > 0) {
        ctx.save();
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = "rgba(240, 60, 60, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, minRange * map.tileSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(angle);

    const color = getPlayerColor(unit.ownerId);
    if (isSiege) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    if (
      unit.type === "Horseman" ||
      unit.type === "Trader" ||
      unit.type === "Scout" ||
      unit.type === "Knight" ||
      unit.type === "CounterweightTrebuchet" ||
      unit.type === "Cannon"
    ) {
      if (unit.type === "CounterweightTrebuchet" || unit.type === "Cannon") {
        ctx.fillStyle = "#8b5a2b";
        if (unit.type === "CounterweightTrebuchet") {
          ctx.fillRect(-radius * 0.9, -radius * 0.9, radius * 1.8, radius * 1.8);
          ctx.strokeStyle = "#5d4037";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-radius * 0.2, radius * 0.2);
          ctx.lineTo(radius * 0.6, -radius * 0.6);
          ctx.stroke();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(radius * 0.6, -radius * 0.6, radius * 0.35, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillRect(-radius * 1.1, -radius * 0.4, radius * 2.2, radius * 0.8);
          ctx.strokeStyle = "#3e2723";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -radius * 0.1);
          ctx.lineTo(radius * 1.2, -radius * 0.1);
          ctx.stroke();
          ctx.strokeStyle = "#4d4d4d";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(radius * 0.2, -radius * 0.35);
          ctx.lineTo(radius * 1.4, -radius * 0.35);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle =
          unit.type === "Scout"
            ? "#7f8c8d"
            : unit.type === "Knight"
            ? "#7a4a2c"
            : "#8b5a2b";
        ctx.beginPath();
        ctx.ellipse(
          0,
          radius * 0.6,
          radius * 1.3,
          radius * 0.7,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    if (!isSiege) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    if (unit.type === "Scout") {
      ctx.fillStyle = "#f1c40f";
      ctx.beginPath();
      ctx.moveTo(0, -radius * 1.1);
      ctx.lineTo(radius * 0.55, -radius * 0.2);
      ctx.lineTo(-radius * 0.55, -radius * 0.2);
      ctx.closePath();
      ctx.fill();
    }

    if (unit.type === "Spearman") {
      ctx.strokeStyle = "#d8c6a1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.2, radius * 0.6);
      ctx.lineTo(radius * 0.8, -radius * 0.7);
      ctx.stroke();
      ctx.fillStyle = "#c0c0c0";
      ctx.beginPath();
      ctx.arc(radius * 0.8, -radius * 0.7, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (unit.type === "ManAtArms") {
      ctx.fillStyle = "#7f8c8d";
      ctx.fillRect(-radius * 0.5, -radius * 0.6, radius, radius * 1.2);
      ctx.strokeStyle = "#c0c0c0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.1, radius * 0.7);
      ctx.lineTo(radius * 0.9, -radius * 0.6);
      ctx.stroke();
      ctx.fillStyle = "#c0c0c0";
      ctx.beginPath();
      ctx.arc(radius * 0.95, -radius * 0.7, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (unit.type === "Archer") {
      ctx.strokeStyle = "#c9a36a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(radius * 0.5, -radius * 0.1, radius * 0.6, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = "#f2e2c4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(radius * 0.5, -radius * 0.7);
      ctx.lineTo(radius * 0.5, radius * 0.5);
      ctx.stroke();
    } else if (unit.type === "Crossbowman") {
      ctx.strokeStyle = "#8e5a2b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.3, -radius * 0.1);
      ctx.lineTo(radius * 0.6, -radius * 0.1);
      ctx.stroke();
      ctx.strokeStyle = "#d8c6a1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(radius * 0.2, -radius * 0.4);
      ctx.lineTo(radius * 0.2, radius * 0.2);
      ctx.stroke();
      ctx.strokeStyle = "#f2e2c4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.1, -radius * 0.1);
      ctx.lineTo(radius * 0.5, -radius * 0.1);
      ctx.stroke();
    } else if (unit.type === "Horseman") {
      ctx.strokeStyle = "#d8c6a1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.3, radius * 0.5);
      ctx.lineTo(radius * 0.9, -radius * 0.6);
      ctx.stroke();
      ctx.fillStyle = "#c0c0c0";
      ctx.beginPath();
      ctx.arc(radius * 0.9, -radius * 0.6, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (unit.type === "Knight") {
      ctx.fillStyle = "#6c7a89";
      ctx.fillRect(-radius * 0.55, -radius * 0.65, radius * 1.1, radius * 1.3);
      ctx.strokeStyle = "#34495e";
      ctx.lineWidth = 2;
      ctx.strokeRect(-radius * 0.55, -radius * 0.65, radius * 1.1, radius * 1.3);
      ctx.strokeStyle = "#d8c6a1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.25, radius * 0.55);
      ctx.lineTo(radius * 0.95, -radius * 0.65);
      ctx.stroke();
      ctx.fillStyle = "#c0c0c0";
      ctx.beginPath();
      ctx.arc(radius * 0.95, -radius * 0.65, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (unit.type === "Handcannoneer") {
      ctx.strokeStyle = "#4d4d4d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.2, -radius * 0.1);
      ctx.lineTo(radius * 0.9, -radius * 0.1);
      ctx.stroke();
      ctx.strokeStyle = "#c0c0c0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(radius * 0.6, -radius * 0.2);
      ctx.lineTo(radius * 0.9, -radius * 0.2);
      ctx.stroke();
    } else if (unit.type === "Monk") {
      ctx.strokeStyle = "#f1c40f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.15, radius * 0.65);
      ctx.lineTo(radius * 0.75, -radius * 0.75);
      ctx.stroke();
      ctx.fillStyle = "#f7dc6f";
      ctx.beginPath();
      ctx.arc(radius * 0.78, -radius * 0.78, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (unit.type === "Monk" && unit.relicId) {
      const relicSize = Math.max(10, map.tileSize * 0.28);
      const rx = radius * 0.65;
      const ry = -radius * 0.05;
      drawRelicIcon(rx, ry, relicSize, 1.5);
    }

    if (isSelected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (unit.type === "Villager" && unit.carry && unit.carry.amount > 0) {
      const carryColor = {
        food: "#e74c3c",
        wood: "#8e5a2b",
        gold: "#f1c40f",
        stone: "#95a5a6",
      }[unit.carry.kind] || "#ffffff";
      const size = Math.max(4, map.tileSize * 0.12);
      ctx.fillStyle = carryColor;
      ctx.fillRect(
        -size / 2,
        -size / 2,
        size,
        size
      );
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        -size / 2,
        -size / 2,
        size,
        size
      );
    }

    ctx.restore();

    const plusSize = Math.max(6, map.tileSize * 0.22);
    const plusY = screen.y - radius - plusSize - 4;
    if (unit.type === "Monk" && unit.isHealing) {
      ctx.strokeStyle = "#2ecc71";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(screen.x - plusSize / 2, plusY);
      ctx.lineTo(screen.x + plusSize / 2, plusY);
      ctx.moveTo(screen.x, plusY - plusSize / 2);
      ctx.lineTo(screen.x, plusY + plusSize / 2);
      ctx.stroke();
    } else {
      const lastRecover = unitRecoverTime.get(unit.id) || 0;
      if (performance.now() - lastRecover < UNIT_RECOVER_ICON_GRACE_MS) {
        ctx.strokeStyle = "#e74c3c";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screen.x - plusSize / 2, plusY);
        ctx.lineTo(screen.x + plusSize / 2, plusY);
        ctx.moveTo(screen.x, plusY - plusSize / 2);
        ctx.lineTo(screen.x, plusY + plusSize / 2);
        ctx.stroke();
      }
    }

    if (def.type?.includes("Siege")) {
      const cooldownMax = Math.max(0.001, def.attackCooldown || 1);
      const cooldownRemaining = Math.max(0, Number(unit.attackCooldown || 0));
      if (cooldownRemaining > 0.001) {
        const progress = Math.max(
          0,
          Math.min(1, 1 - cooldownRemaining / cooldownMax)
        );
        const barWidth = radius * 2.4;
        const barHeight = Math.max(3, Math.floor(map.tileSize * 0.1));
        const barY = screen.y + radius + 6;
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.fillRect(screen.x - barWidth / 2, barY, barWidth, barHeight);
        ctx.fillStyle = "#f39c12";
        ctx.fillRect(
          screen.x - barWidth / 2,
          barY,
          barWidth * progress,
          barHeight
        );
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;
        ctx.strokeRect(screen.x - barWidth / 2, barY, barWidth, barHeight);
      }
    }

    const lastDamage = unitDamageTime.get(unit.id) || 0;
    if (isSelected || performance.now() - lastDamage < DAMAGE_BAR_DURATION_MS) {
    const currentHealth = unit.health ?? unit.hp ?? 0;
    const maxHealth = unit.maxHp || def.health || unit.health || unit.hp || 1;
    const barWidth = radius * 2.4;
    const barHeight = Math.max(3, Math.floor(map.tileSize * 0.1));
    drawHealthBar(
      screen.x - barWidth / 2,
      screen.y - radius - barHeight - 6,
        barWidth,
        barHeight,
        currentHealth / maxHealth
      );
    }
  });
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function drawSelectionBox() {
  if (!selectionBox) return;
  const x = Math.min(selectionBox.startX, selectionBox.endX);
  const y = Math.min(selectionBox.startY, selectionBox.endY);
  const w = Math.abs(selectionBox.endX - selectionBox.startX);
  const h = Math.abs(selectionBox.endY - selectionBox.startY);
  ctx.strokeStyle = "rgba(180, 255, 154, 0.9)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

function getQueuedOrderTargetPoint(order) {
  if (!order) return null;
  const type = order.type;
  if ((type === "move" || type === "attackMove" || type === "dropRelic") && order.target) {
    return { x: order.target.x, y: order.target.y };
  }
  if (type === "gather" && order.resourceId != null) {
    const node = resources.find((r) => r.id === order.resourceId);
    if (!node) return null;
    return { x: node.x + node.size / 2, y: node.y + node.size / 2 };
  }
  if (type === "pickupRelic" && order.relicId != null) {
    const relic = relics.find((r) => r.id === order.relicId);
    if (!relic) return null;
    return { x: relic.x, y: relic.y };
  }
  if (
    (type === "return" ||
      type === "build" ||
      type === "repair" ||
      type === "farm" ||
      type === "garrison" ||
      type === "depositRelic" ||
      type === "takeRelic" ||
      type === "trade") &&
    order.buildingId != null
  ) {
    const building = buildings.find((b) => b.id === order.buildingId);
    if (!building) return null;
    const def = BUILDINGS[building.type];
    if (!def) return null;
    return { x: building.x + def.size / 2, y: building.y + def.size / 2 };
  }
  if (type === "repair" && order.unitId != null) {
    const targetUnit = units.find((u) => u.id === order.unitId);
    if (!targetUnit) return null;
    return { x: targetUnit.x, y: targetUnit.y };
  }
  if ((type === "attack" || type === "heal") && order.targetId != null) {
    const targetUnit = units.find((u) => u.id === order.targetId);
    if (targetUnit) return { x: targetUnit.x, y: targetUnit.y };
    const targetBuilding = buildings.find((b) => b.id === order.targetId);
    if (!targetBuilding) return null;
    const def = BUILDINGS[targetBuilding.type];
    if (!def) return null;
    return { x: targetBuilding.x + def.size / 2, y: targetBuilding.y + def.size / 2 };
  }
  return null;
}

function drawQueuedCommandLines() {
  if (!selectedUnits.length) return;
  const selectedIdSet = new Set(selectedUnits.map((u) => u.id));
  for (const unit of units) {
    if (!selectedIdSet.has(unit.id)) continue;
    const activeOrder = unit.activeOrder || unit.order || null;
    const queued = unit.queuedOrders || unit.orderQueue || [];
    const orderCount = (activeOrder ? 1 : 0) + queued.length;
    if (orderCount < 2) continue;

    const renderState = unitRenderState.get(unit.id);
    let from = {
      x: renderState ? renderState.renderX : unit.x,
      y: renderState ? renderState.renderY : unit.y,
    };

    const points = [];
    if (activeOrder) {
      const activePoint = getQueuedOrderTargetPoint(activeOrder);
      if (activePoint) points.push(activePoint);
    }
    for (const order of queued) {
      const point = getQueuedOrderTargetPoint(order);
      if (!point) continue;
      points.push(point);
    }
    if (!points.length) continue;

    ctx.save();
    ctx.strokeStyle = "rgba(173, 216, 230, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    let fromScreen = worldToScreen(from.x, from.y);
    ctx.moveTo(fromScreen.x, fromScreen.y);
    for (const point of points) {
      const p = worldToScreen(point.x, point.y);
      ctx.lineTo(p.x, p.y);
      from = point;
      fromScreen = p;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    for (const point of points) {
      const p = worldToScreen(point.x, point.y);
      ctx.fillStyle = "rgba(173, 216, 230, 0.95)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function updateFog() {
  if (fogCheatReveal) {
    fogVisible.fill(1);
    fogExplored.fill(1);
    return;
  }
  fogVisible.fill(0);
  const reveal = (x, y, range, markExplored = true) => {
    const startX = Math.max(0, Math.floor(x - range));
    const endX = Math.min(map.width - 1, Math.ceil(x + range));
    const startY = Math.max(0, Math.floor(y - range));
    const endY = Math.min(map.height - 1, Math.ceil(y + range));
    const rangeSq = range * range;
    for (let ty = startY; ty <= endY; ty++) {
      for (let tx = startX; tx <= endX; tx++) {
        const dx = tx + 0.5 - x;
        const dy = ty + 0.5 - y;
        if (dx * dx + dy * dy <= rangeSq) {
          const idx = ty * map.width + tx;
          fogVisible[idx] = 1;
          if (markExplored) {
            fogExplored[idx] = 1;
          }
        }
      }
    }
  };

  units.forEach((unit) => {
    if (!arePlayersAllied(unit.ownerId, playerIndex)) return;
    const range = getUnitSight(unit);
    reveal(unit.x, unit.y, range);
  });
  buildings.forEach((building) => {
    if (!arePlayersAllied(building.ownerId, playerIndex)) return;
    if (isDestroyedLandmarkClient(building)) return;
    const range = getBuildingSight(building);
    const centerX = building.x + BUILDINGS[building.type].size / 2;
    const centerY = building.y + BUILDINGS[building.type].size / 2;
    reveal(centerX, centerY, range);
  });

  const now = performance.now();
  for (let i = tempVisionReveals.length - 1; i >= 0; i--) {
    const entry = tempVisionReveals[i];
    if ((entry.expiresAt || 0) <= now) {
      tempVisionReveals.splice(i, 1);
      continue;
    }
    reveal(entry.x, entry.y, entry.radius || ATTACK_REVEAL_RADIUS, true);
  }
}

function getUnitSight(unit) {
  const type = typeof unit === "string" ? unit : unit?.type;
  const ownerId = typeof unit === "object" ? unit?.ownerId : null;
  const owner = players.find((p) => p.index === ownerId);
  const baseSight = UNITS[type]?.sight ?? DEFAULT_SIGHT;
  return baseSight * getSightMultiplierForPlayer(owner);
}

function getBuildingSight(building) {
  const type = typeof building === "string" ? building : building?.type;
  const ownerId = typeof building === "object" ? building?.ownerId : null;
  const owner = players.find((p) => p.index === ownerId);
  const baseSight = BUILDINGS[type]?.sight ?? DEFAULT_SIGHT;
  return baseSight * getSightMultiplierForPlayer(owner);
}

function isVisible(x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  return fogVisible[ty * map.width + tx] === 1;
}

function isExplored(x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  return fogExplored[ty * map.width + tx] === 1;
}

function drawFog() {
  const startX = Math.max(0, Math.floor(camera.x / map.tileSize));
  const startY = Math.max(0, Math.floor(camera.y / map.tileSize));
  const endX = Math.min(
    map.width - 1,
    Math.ceil((camera.x + canvas.width) / map.tileSize)
  );
  const endY = Math.min(
    map.height - 1,
    Math.ceil((camera.y + canvas.height) / map.tileSize)
  );
  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const idx = ty * map.width + tx;
      if (fogVisible[idx]) continue;
      const screen = worldToScreen(tx, ty);
      if (!fogExplored[idx]) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      } else {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      }
      ctx.fillRect(screen.x, screen.y, map.tileSize, map.tileSize);
    }
  }
}

function drawProjectiles() {
  const now = performance.now();
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const t = (now - p.startTime) / p.duration;
    if (t >= 1) {
      if (p.type === "disruptor") {
        projectileImpacts.push({
          type: "disruptor",
          x: p.to.x,
          y: p.to.y,
          startTime: now,
          duration: DISRUPTOR_IMPACT_DURATION_MS,
        });
      }
      projectiles.splice(i, 1);
      continue;
    }
    const x = p.from.x + (p.to.x - p.from.x) * t;
    const y = p.from.y + (p.to.y - p.from.y) * t;
    const screen = worldToScreen(x, y);
    if (p.type === "boulder") {
      const size = Math.max(5, map.tileSize * 0.18);
      ctx.fillStyle = "#6d4c41";
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === "cannonball") {
      const size = Math.max(6, map.tileSize * 0.24);
      ctx.fillStyle = "#4d4d4d";
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === "springald") {
      ctx.strokeStyle = "#c9cfd6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(screen.x - 6, screen.y);
      ctx.lineTo(screen.x + 6, screen.y);
      ctx.stroke();
    } else if (p.type === "disruptor") {
      const size = Math.max(10, map.tileSize * 0.32);
      ctx.fillStyle = "rgba(255, 120, 60, 0.9)";
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 220, 120, 0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size * 0.65, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#f5d76e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screen.x - 4, screen.y - 2);
      ctx.lineTo(screen.x + 4, screen.y + 2);
      ctx.stroke();
    }
  }
}

function drawProjectileImpacts() {
  const now = performance.now();
  for (let i = projectileImpacts.length - 1; i >= 0; i--) {
    const impact = projectileImpacts[i];
    const t = (now - impact.startTime) / impact.duration;
    if (t >= 1) {
      projectileImpacts.splice(i, 1);
      continue;
    }
    if (impact.type !== "disruptor") continue;

    const screen = worldToScreen(impact.x, impact.y);
    const fade = Math.max(0, 1 - t);
    const rRed = 1.5 * map.tileSize;
    const rOrange = 1 * map.tileSize;
    const rYellow = 0.5 * map.tileSize;

    ctx.save();
    ctx.fillStyle = `rgba(220, 35, 35, ${0.22 * fade})`;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, rRed, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 140, 30, ${0.3 * fade})`;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, rOrange, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 230, 60, ${0.4 * fade})`;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, rYellow, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255, 190, 70, ${0.7 * fade})`;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, rYellow, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function isPlacementValidClient(type, x, y) {
  const def = BUILDINGS[type];
  if (!def) return false;
  if (x < 0 || y < 0) return false;
  if (x + def.size > map.width || y + def.size > map.height) return false;

  const areas = [];
  buildings.forEach((building) => {
    const bDef = BUILDINGS[building.type];
    areas.push({ x: building.x, y: building.y, size: bDef.size });
  });
  resources.forEach((node) => {
    areas.push({ x: node.x, y: node.y, size: node.size });
  });

  return isAreaFree(x, y, def.size, areas);
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

function drawBuildPreview() {
  if (!buildMode || !lastMouseWorld) return;
  const def = BUILDINGS[buildMode];
  if (!def) return;
  const topLeftX = Math.floor(lastMouseWorld.x);
  const topLeftY = Math.floor(lastMouseWorld.y);
  const screen = worldToScreen(topLeftX, topLeftY);
  const sizePx = def.size * map.tileSize;
  const valid = isPlacementValidClient(buildMode, topLeftX, topLeftY);
  const img = buildingImages[def.name];
  ctx.save();
  ctx.globalAlpha = valid ? 0.55 : 0.35;
  if (img && img.complete) {
    ctx.drawImage(img, screen.x, screen.y, sizePx, sizePx);
  } else {
    ctx.fillStyle = valid
      ? "rgba(46, 204, 113, 0.2)"
      : "rgba(231, 76, 60, 0.2)";
    ctx.fillRect(screen.x, screen.y, sizePx, sizePx);
  }
  ctx.restore();
  ctx.strokeStyle = valid ? "#2ecc71" : "#e74c3c";
  ctx.lineWidth = 2;
  ctx.strokeRect(screen.x, screen.y, sizePx, sizePx);

  const auraRange = getBuildingAuraRingTiles(buildMode);
  if (auraRange > 0) {
    const centerScreen = worldToScreen(
      topLeftX + def.size / 2,
      topLeftY + def.size / 2
    );
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      centerScreen.x,
      centerScreen.y,
      auraRange * map.tileSize,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }

  const buildTag = (BUILDINGS[buildMode]?.tag || "").toLowerCase();
  const isDefensive =
    BUILDING_CATEGORIES?.defensive?.includes(buildMode) ||
    buildTag.includes("defensive");
  if (!isDefensive) return;
  const range = getBuildingRangeRingTiles(buildMode);
  const minRange = getBuildingMinRangeRingTiles(buildMode);
  if (range > 0) {
    const centerScreen = worldToScreen(topLeftX + def.size / 2, topLeftY + def.size / 2);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = valid
      ? "rgba(46, 204, 113, 0.9)"
      : "rgba(231, 76, 60, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerScreen.x, centerScreen.y, range * map.tileSize, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (minRange > 0) {
      ctx.save();
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = "rgba(240, 60, 60, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(centerScreen.x, centerScreen.y, minRange * map.tileSize, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawMinimap() {
  const w = minimap.width;
  const h = minimap.height;
  if (w === 0 || h === 0) return;

  miniCtx.clearRect(0, 0, w, h);
  miniCtx.fillStyle = "#1f242b";
  miniCtx.fillRect(0, 0, w, h);

  const scaleX = w / map.width;
  const scaleY = h / map.height;

  resources.forEach((node) => {
    const def = RESOURCE_DEFS[node.type];
    const cx = node.x + node.size / 2;
    const cy = node.y + node.size / 2;
    if (playerIndex !== null && !isExplored(cx, cy)) {
      return;
    }
    const visible = playerIndex === null ? true : isVisible(cx, cy);
    miniCtx.fillStyle = visible ? def.color : "rgba(120, 120, 120, 0.6)";
    miniCtx.beginPath();
    miniCtx.arc(
      cx * scaleX,
      cy * scaleY,
      Math.max(1, node.size * 0.5 * scaleX),
      0,
      Math.PI * 2
    );
    miniCtx.fill();
  });

  relics.forEach((relic) => {
    if (relic.carrierId || relic.storedInBuildingId) return;
    if (playerIndex !== null && !isExplored(relic.x, relic.y)) {
      return;
    }
    const visible = playerIndex === null ? true : isVisible(relic.x, relic.y);
    miniCtx.fillStyle = visible ? "#f1c40f" : "rgba(160, 140, 60, 0.7)";
    miniCtx.beginPath();
    miniCtx.arc(
      relic.x * scaleX,
      relic.y * scaleY,
      Math.max(2, 0.45 * scaleX),
      0,
      Math.PI * 2
    );
    miniCtx.fill();
    if (selectedRelic && selectedRelic.id === relic.id) {
      miniCtx.strokeStyle = "#ffffff";
      miniCtx.lineWidth = 1.5;
      miniCtx.beginPath();
      miniCtx.arc(
        relic.x * scaleX,
        relic.y * scaleY,
        Math.max(3, 0.7 * scaleX),
        0,
        Math.PI * 2
      );
      miniCtx.stroke();
    }
  });

  buildings.forEach((building) => {
    const def = BUILDINGS[building.type];
    if (
      playerIndex !== null &&
      building.ownerId !== playerIndex &&
      !def?.isNeutral &&
      !isVisible(
        building.x + def.size / 2,
        building.y + def.size / 2
      )
    ) {
      return;
    }
    miniCtx.fillStyle = getPlayerColor(building.ownerId);
    miniCtx.fillRect(
      building.x * scaleX,
      building.y * scaleY,
      def.size * scaleX,
      def.size * scaleY
    );
  });

  units.forEach((unit) => {
    if (
      playerIndex !== null &&
      unit.ownerId !== playerIndex &&
      !isVisible(unit.x, unit.y)
    ) {
      return;
    }
    miniCtx.fillStyle = getPlayerColor(unit.ownerId);
    miniCtx.fillRect(
      unit.x * scaleX,
      unit.y * scaleY,
      Math.max(1, 0.5 * scaleX),
      Math.max(1, 0.5 * scaleY)
    );
  });

  if (selectedUnits.length === 1 && selectedUnits[0].type === "Trader") {
    const trader = selectedUnits[0];
    const trade = trader.trade;
    if (trade?.homeId && trade?.destId) {
      const home = buildings.find((b) => b.id === trade.homeId);
      const dest = buildings.find((b) => b.id === trade.destId);
      if (home && dest) {
        const homeX = (home.x + BUILDINGS[home.type].size / 2) * scaleX;
        const homeY = (home.y + BUILDINGS[home.type].size / 2) * scaleY;
        const destX = (dest.x + BUILDINGS[dest.type].size / 2) * scaleX;
        const destY = (dest.y + BUILDINGS[dest.type].size / 2) * scaleY;
        miniCtx.strokeStyle = "#f1c40f";
        miniCtx.lineWidth = 2;
        miniCtx.beginPath();
        miniCtx.moveTo(homeX, homeY);
        miniCtx.lineTo(destX, destY);
        miniCtx.stroke();
        miniCtx.fillStyle = "#2ecc71";
        miniCtx.beginPath();
        miniCtx.arc(homeX, homeY, 4, 0, Math.PI * 2);
        miniCtx.fill();
        miniCtx.fillStyle = "#e67e22";
        miniCtx.beginPath();
        miniCtx.arc(destX, destY, 4, 0, Math.PI * 2);
        miniCtx.fill();
      }
    }
  }

  const viewX = camera.x / map.tileSize;
  const viewY = camera.y / map.tileSize;
  const viewW = canvas.width / map.tileSize;
  const viewH = canvas.height / map.tileSize;
  miniCtx.strokeStyle = "#ffffff";
  miniCtx.lineWidth = 1;
  miniCtx.strokeRect(
    viewX * scaleX,
    viewY * scaleY,
    viewW * scaleX,
    viewH * scaleY
  );

  const now = performance.now();
  for (let i = minimapAlerts.length - 1; i >= 0; i--) {
    const alert = minimapAlerts[i];
    if (now - alert.time > 3000) {
      minimapAlerts.splice(i, 1);
      continue;
    }
    miniCtx.strokeStyle = alert.ally
      ? "rgba(241, 196, 15, 0.95)"
      : "rgba(231, 76, 60, 0.9)";
    miniCtx.lineWidth = 2;
    miniCtx.beginPath();
    miniCtx.arc(
      alert.x * scaleX,
      alert.y * scaleY,
      Math.max(4, 4 * scaleX),
      0,
      Math.PI * 2
    );
    miniCtx.stroke();
  }

  if (playerIndex !== null) {
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const idx = ty * map.width + tx;
        if (fogVisible[idx]) continue;
        if (!fogExplored[idx]) {
          miniCtx.fillStyle = "rgba(0, 0, 0, 0.75)";
        } else {
          miniCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
        }
        miniCtx.fillRect(
          tx * scaleX,
          ty * scaleY,
          scaleX,
          scaleY
        );
      }
    }
  }
}

function render() {
  updateRenderPositions();
  updateCamera();
  if (playerIndex !== null) {
    updateFog();
  }
  drawGrid();
  drawResources();
  drawRelics();
  drawBuildings();
  drawQueuedCommandLines();
  drawUnits();
  drawProjectiles();
  drawProjectileImpacts();
  drawSelectionBox();
  drawBuildPreview();
  drawAttackMoveCursor();
  if (playerIndex !== null) {
    drawFog();
  }
  drawMapBoundsTint();
  drawNeutralBuildings();
  drawMinimap();
  requestAnimationFrame(render);
}

function drawMapBoundsTint() {
  const mapWidthPx = map.width * map.tileSize;
  const mapHeightPx = map.height * map.tileSize;
  const left = -camera.x;
  const top = -camera.y;
  const right = left + mapWidthPx;
  const bottom = top + mapHeightPx;
  ctx.save();
  ctx.fillStyle = "rgba(180, 30, 30, 0.35)";
  if (left > 0) {
    ctx.fillRect(0, 0, left, canvas.height);
  }
  if (right < canvas.width) {
    ctx.fillRect(right, 0, canvas.width - right, canvas.height);
  }
  if (top > 0) {
    ctx.fillRect(0, 0, canvas.width, top);
  }
  if (bottom < canvas.height) {
    ctx.fillRect(0, bottom, canvas.width, canvas.height - bottom);
  }
  ctx.restore();
}

function drawAttackMoveCursor() {
  if (!attackMoveArmed) return;
  const radius = Math.max(12, map.tileSize * 0.4);
  ctx.save();
  ctx.strokeStyle = "rgba(231, 76, 60, 0.6)";
  ctx.fillStyle = "rgba(231, 76, 60, 0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(lastMouseScreen.x, lastMouseScreen.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

render();

function updateResourcesHUD() {
  if (playerIndex === null) return;
  const player = players.find((p) => p.index === playerIndex);
  if (!player) return;
  const res = player.resources;
  const popUsed = Math.floor(getPopulationUsedForPlayer(player));
  const popCap = Math.floor(getPopulationCapForPlayer(player));
  resourcesEl.innerHTML = `
    <span style="color:#e74c3c;">Food: ${Math.floor(res.food || 0)}</span>
    <span style="color:#8e5a2b;">Wood: ${Math.floor(res.wood || 0)}</span>
    <span style="color:#f1c40f;">Gold: ${Math.floor(res.gold || 0)}</span>
    <span style="color:#95a5a6;">Stone: ${Math.floor(res.stone || 0)}</span>
    <span style="color:#ecf0f1;">Pop: ${popUsed}/${popCap}</span>
  `;
  if (idleVillagersEl) {
    const idle = units.filter((unit) => {
      if (unit.ownerId !== playerIndex) return false;
      if (unit.type !== "Villager") return false;
      const orderType = unit.order?.type || unit.orderType;
      return !orderType;
    });
    idleVillagersEl.textContent = `Idle Villagers: ${idle.length}`;
    idleVillagersEl.classList.toggle("disabled", idle.length === 0);
  }
  if (idleTradersEl) {
    const ownedTraders = units.filter(
      (unit) => unit.ownerId === playerIndex && unit.type === "Trader"
    );
    if (!ownedTraders.length) {
      idleTradersEl.style.display = "none";
    } else {
      const idleTraders = ownedTraders.filter((unit) => {
        const orderType = unit.order?.type || unit.orderType;
        return !orderType;
      });
      idleTradersEl.textContent = `Idle Traders: ${idleTraders.length}`;
      idleTradersEl.style.display = "block";
      idleTradersEl.classList.toggle("disabled", idleTraders.length === 0);
    }
  }
}

setInterval(updateResourcesHUD, 200);

if (idleVillagersEl) {
  idleVillagersEl.addEventListener("click", () => {
    if (playerIndex === null) return;
    const idle = units.filter((unit) => {
      if (unit.ownerId !== playerIndex) return false;
      if (unit.type !== "Villager") return false;
      const orderType = unit.order?.type || unit.orderType;
      return !orderType;
    });
    if (!idle.length) return;
    if (idleVillagerCycleIndex >= idle.length) {
      idleVillagerCycleIndex = 0;
    }
    const target = idle[idleVillagerCycleIndex];
    idleVillagerCycleIndex =
      (idleVillagerCycleIndex + 1) % idle.length;
    selectedUnits = [target];
    selectedBuilding = null;
    selectedBuildings = [];
    selectedResource = null;
    selectedRelic = null;
    updateSelectionUI();
    camera.x = target.x * map.tileSize - canvas.width / 2;
    camera.y = target.y * map.tileSize - canvas.height / 2;
    clampCamera();
  });
}

function updatePlayerList() {
  if (!playerList) return;
  if (!players || !players.length || playerIndex === null) {
    playerList.classList.remove("visible");
    playerList.innerHTML = "";
    updateNotificationPositions();
    return;
  }
  const items = players.map((player) => {
    const ageTier = (player.ageTier ?? 0) + 1;
    const team = Number(player.team || player.index + 1);
    const label = `Player ${player.index + 1} (T${team})`;
    const color = getPlayerColor(player.index);
    const eliminated = player.eliminated ? " - Out" : "";
    return `<div class="player-entry"><div style="color:${color};">${label}</div><span>Age ${ageTier}${eliminated}</span></div>`;
  });
  playerList.innerHTML = items.join("");
  playerList.classList.add("visible");
  updateNotificationPositions();
}

setInterval(updatePlayerList, 500);
setInterval(() => {
  if (pointerIsDown) return;
  if (performance.now() < suppressPeriodicUiRefreshUntil) return;
  updateSelectionUI();
}, 500);

function updateNotificationPositions() {
  const baseRightPanelOffset = 12;
  let top = Math.round(window.innerHeight * 0.5 + baseRightPanelOffset);
  if (playerList && playerList.classList.contains("visible")) {
    const rect = playerList.getBoundingClientRect();
    top = Math.round(rect.bottom + baseRightPanelOffset);
  }
  if (attackNotify) {
    attackNotify.style.top = `${top}px`;
    attackNotify.style.transform = "none";
  }
  if (researchNotify) {
    researchNotify.style.top = `${top + 56}px`;
    researchNotify.style.transform = "none";
  }
}

function updateSelectionUI() {
  if (
    dropRelicArmed &&
    !selectedUnits.some(
      (u) => u.ownerId === playerIndex && u.type === "Monk" && u.relicId
    )
  ) {
    dropRelicArmed = false;
  }
  if (
    healArmed &&
    !selectedUnits.some(
      (u) => u.ownerId === playerIndex && u.type === "Monk" && !u.relicId
    )
  ) {
    healArmed = false;
  }
  if (
    repairArmed &&
    !selectedUnits.some(
      (u) => u.ownerId === playerIndex && u.type === "Villager"
    )
  ) {
    repairArmed = false;
  }
  if (selectedBuildings.length) {
    selectedUnits = [];
    selectedResource = null;
    selectedRelic = null;
  } else if (selectedUnits.length) {
    selectedBuildings = [];
    selectedBuilding = null;
    selectedResource = null;
    selectedRelic = null;
  } else if (selectedResource) {
    selectedUnits = [];
    selectedBuildings = [];
    selectedBuilding = null;
    selectedRelic = null;
  } else if (selectedRelic) {
    selectedUnits = [];
    selectedBuildings = [];
    selectedBuilding = null;
    selectedResource = null;
  }
  if (!selectedBuildings.length && selectedBuilding) {
    selectedBuildings = [selectedBuilding];
  }
  const selectionSignature = selectedUnits.length
    ? `u:${selectedUnits.map((u) => u.id).join(",")}`
    : selectedBuildings.length
    ? `b:${selectedBuildings.map((b) => b.id).join(",")}`
    : selectedResource
    ? `r:${selectedResource.id}`
    : selectedRelic
    ? `l:${selectedRelic.id}`
    : "none";
  if (selectionSignature !== lastSelectionSignature) {
    if (selectedUnits.length) {
      playSound("select");
    }
    lastSelectionSignature = selectionSignature;
  }
  if (!selectedUnits.length && !selectedBuildings.length && !selectedResource && !selectedRelic) {
    if (bottomBar) bottomBar.classList.add("hidden");
    selectionTitle.textContent = "No selection";
    selectionDetails.textContent = "Select a unit or building to see details.";
    productionButtons.innerHTML = "";
    renderProductionQueue(null);
    clearBuildButtons();
    if (buildButtons) buildButtons.classList.add("build-hidden");
    hideGarrisonPanel();
    return;
  }

  if (bottomBar) bottomBar.classList.remove("hidden");
  refreshSelectionDetails();
  if (selectedBuildings.length) {
    renderProductionButtons(selectedBuildings);
    renderProductionQueue(selectedBuildings);
    if (selectedBuildings.length === 1) {
      renderGarrisonPanel(selectedBuildings[0]);
    } else {
      hideGarrisonPanel();
    }
    if (buildButtons) buildButtons.classList.add("build-hidden");
    if (buildButtons) buildButtons.style.display = "none";
    clearBuildButtons();
  } else {
    renderUnitActionButtons();
    renderProductionQueue(null);
    hideGarrisonPanel();
    if (selectedRelic) {
      clearBuildButtons();
      if (buildButtons) {
        buildButtons.classList.add("build-hidden");
        buildButtons.style.display = "none";
      }
    } else {
      renderBuildButtons();
    }
  }
}

function renderCheatBar() {
  if (!cheatBar) return;
  cheatBar.innerHTML = "";
  if (!isSingleplayer && !allowCheats) {
    cheatBar.classList.remove("visible");
    return;
  }
  const singleplayerSpawnOnly = isSingleplayer;
  cheatBar.classList.add("visible");
  const buttons = [
    { label: "Grant 10,000 food", action: "grant_food" },
    { label: "Grant 10,000 wood", action: "grant_wood" },
    { label: "Grant 10,000 gold", action: "grant_gold" },
    { label: "Grant 10,000 stone", action: "grant_stone" },
    { label: "Instant build & produce", action: "instant_build" },
    { label: "Reveal fog of war", action: "reveal_fog" },
  ];
  if (singleplayerSpawnOnly) {
    buttons.push(
      { label: "Enemy attack-move", action: "enemy_attack_move" },
      { label: "Spawn enemy spearman", action: "spawn_spearman" },
      { label: "Spawn enemy horseman", action: "spawn_horseman" },
      { label: "Spawn enemy archer", action: "spawn_archer" },
      { label: "Spawn enemy knight", action: "spawn_knight" },
      { label: "Spawn enemy man-at-arms", action: "spawn_manatarms" },
      { label: "Spawn enemy crossbowman", action: "spawn_crossbowman" },
      { label: "Spawn enemy castle", action: "spawn_castle" },
      { label: "Spawn enemy disruptor cannon", action: "spawn_disruptor_cannon" }
    );
  }
  buttons.forEach((entry) => {
    const btn = document.createElement("button");
    btn.className = "cheat-btn";
    btn.textContent = entry.label;
    btn.addEventListener("click", () => {
      if (entry.action.startsWith("grant_")) {
        sendCommand(
          { type: "cheat", action: entry.action },
          { expectAck: false }
        );
      } else if (entry.action === "reveal_fog") {
        sendCommand(
          { type: "cheat", action: "reveal_fog" },
          { expectAck: false }
        );
      } else if (entry.action === "instant_build") {
        sendCommand(
          { type: "cheat", action: "instant_build" },
          { expectAck: false }
        );
      } else {
        pendingCheat = entry.action;
        showBanner("Click a location on the map.", "info", 2000);
      }
    });
    cheatBar.appendChild(btn);
  });
}

function getActivePlayer(playerOverride = null) {
  if (playerOverride) return playerOverride;
  return players.find((p) => p.index === playerIndex) || null;
}

function scaleCost(cost, factor) {
  if (!cost) return null;
  const scaled = {};
  for (const [key, value] of Object.entries(cost)) {
    const numericValue = Number(value) || 0;
    const multiplier = Number.isFinite(factor) ? factor : 1;
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

function isGunpowderUnitType(unitType) {
  const type = UNITS[unitType]?.type || "";
  return type.includes("Gunpowder");
}

function getGunpowderSiegeRangeBonus(player, unitType) {
  if (!player?.techs?.ImprovedGunpowder) return 0;
  return isGunpowderUnitType(unitType) ? 1 : 0;
}

function getGunpowderSiegeDamageMultiplier(player, unitType) {
  if (!player?.techs?.ImprovedGunpowder) return 1;
  return isGunpowderUnitType(unitType) ? 1.2 : 1;
}

function getSecondWindDamageBonusForPlayer(player) {
  if (!player?.techs?.SecondWind) return 0;
  const tier = getGroveAgeTierForPlayer(player) || 1;
  return (
    TECHNOLOGIES.SecondWind?.groveScalingByAge?.[clamp(tier - 1, 0, 3)] || 0
  );
}

function getNearbyBasilicaDamageBonusForUnit(unit, playerOverride = null) {
  if (!unit) return 0;
  const owner =
    playerOverride || players.find((p) => p.index === unit.ownerId) || null;
  if (!owner) return 0;
  const auraRange = LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraRange || 15;
  let bestBonus = 0;
  for (const building of buildings) {
    if (building.ownerId !== unit.ownerId) continue;
    if (building.type !== "BasilicaOfEternalLight") continue;
    if (building.isUnderConstruction) continue;
    if (isDestroyedLandmarkClient(building)) continue;
    const size = BUILDINGS[building.type]?.size || 0;
    const centerX = building.x + size / 2;
    const centerY = building.y + size / 2;
    if (Math.hypot(centerX - unit.x, centerY - unit.y) > auraRange) continue;
    const ageTier = getLandmarkAgeTierForBuilding(building, owner) || 1;
    const bonus =
      LANDMARK_BONUSES?.BasilicaOfEternalLight?.auraDamageByAge?.[
        clamp(ageTier - 1, 0, 3)
      ] || 0;
    if (bonus > bestBonus) bestBonus = bonus;
  }
  return bestBonus;
}

function getNearbyGoldenFountainGatherBonusForUnit(
  unit,
  playerOverride = null
) {
  if (!unit) return 0;
  const owner =
    playerOverride || players.find((p) => p.index === unit.ownerId) || null;
  if (!owner) return 0;
  const auraRange = LANDMARK_BONUSES?.GoldenFountainSquare?.auraRange || 6;
  let bestBonus = 0;
  for (const building of buildings) {
    if (building.ownerId !== unit.ownerId) continue;
    if (building.type !== "GoldenFountainSquare") continue;
    if (building.isUnderConstruction) continue;
    if (isDestroyedLandmarkClient(building)) continue;
    const size = BUILDINGS[building.type]?.size || 0;
    const centerX = building.x + size / 2;
    const centerY = building.y + size / 2;
    if (Math.hypot(centerX - unit.x, centerY - unit.y) > auraRange) continue;
    const ageTier = getLandmarkAgeTierForBuilding(building, owner) || 1;
    const bonus =
      LANDMARK_BONUSES?.GoldenFountainSquare?.gatherRateBonusByAge?.[
        clamp(ageTier - 1, 0, 3)
      ] || 0;
    if (bonus > bestBonus) bestBonus = bonus;
  }
  return bestBonus;
}

function getUnitDamageMultiplierForDisplay(unit, player) {
  let multiplier = getGunpowderSiegeDamageMultiplier(player, unit?.type);
  if (
    player?.techs?.SecondWind &&
    !UNITS[unit?.type]?.type?.includes("Siege")
  ) {
    const hp = Number(unit?.hp || 0);
    const maxHp = Number(unit?.maxHp || UNITS[unit?.type]?.health || 1);
    if (maxHp > 0 && hp / maxHp < 0.35) {
      multiplier *= 1 + getSecondWindDamageBonusForPlayer(player);
    }
  }
  const basilicaBonus = getNearbyBasilicaDamageBonusForUnit(unit, player);
  if (basilicaBonus > 0) {
    multiplier *= 1 + basilicaBonus;
  }
  return multiplier;
}

function getSightMultiplierForPlayer(player) {
  return player?.techs?.AdvancedRadar ? 1.5 : 1;
}

function getRangedTechBonus(player, unitType = null) {
  if (!player) return 0;
  if (unitType && UNITS[unitType]?.type?.includes("Gunpowder")) return 0;
  let bonus = 0;
  if (player.techs?.LightweightShafts) bonus += 1;
  if (player.techs?.PiercingPoints) bonus += 1;
  if (player.techs?.Aerodynamic) bonus += 1;
  if (player.techs?.BodkinBolts) bonus += 1;
  return bonus;
}

function getMeleeTechBonus(player) {
  if (!player) return 0;
  let bonus = 0;
  if (player.techs?.IronForging) bonus += 1;
  if (player.techs?.DiamondForging) bonus += 1;
  if (player.techs?.EmeraldForging) bonus += 1;
  if (player.techs?.EnlightenedForging) bonus += 1;
  return bonus;
}

function getUnitUpgradeTierForPlayer(unitType, player) {
  const path = UNIT_UPGRADE_PATHS[unitType];
  if (!path || !player) return null;
  if (path.autoByAge) {
    return Math.max(path.unlockTier ?? 0, Math.min(4, player?.ageTier ?? 0));
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

function getUnitMinAgeForPlayer(unitType, player) {
  const path = UNIT_UPGRADE_PATHS[unitType];
  if (!path || !player) return UNITS[unitType]?.minAgeTier ?? 0;
  if (path.autoByAge) {
    return path.unlockTier ?? (path.normalTier ?? 0);
  }
  return path.unlockTier ?? (path.normalTier ?? 0);
}

function getUnitCostForPlayer(unitType, playerOverride = null, building = null) {
  const def = UNITS[unitType];
  if (!def) return null;
  const player = getActivePlayer(playerOverride);
  let multiplier = player?.techs?.Resourcefulness ? 0.9 : 1;
  if (building?.type === "SanctumOfTheVeil" && def.type?.includes("Religious")) {
    const ageTier = getLandmarkAgeTierForBuilding(building, player) || 1;
    const reduction =
      LANDMARK_BONUSES?.SanctumOfTheVeil?.religiousCostReductionByAge?.[
        ageTier - 1
      ] || 0;
    multiplier *= Math.max(0.05, 1 - reduction);
  }
  return scaleCost(def.cost, multiplier);
}

function getUnitBuildTimeForPlayer(unitType, playerOverride = null, building = null) {
  const def = UNITS[unitType];
  if (!def) return 0;
  const player = getActivePlayer(playerOverride);
  let time = def.buildTime || 0;
  if (!time) return 0;
  if (player?.techs?.RapidFabrications && UNITS[unitType]?.type?.includes("Siege")) {
    time *= 0.5;
  }
  if (building?.type === "ArgentThroneComplex" && def.type?.includes("Infantry")) {
    const ageTier = getLandmarkAgeTierForBuilding(building, player) || 1;
    const speedBonus =
      LANDMARK_BONUSES?.ArgentThroneComplex?.productionSpeedBonusByAge?.[
        ageTier - 1
      ] || 0;
    const speedMultiplier = 1 + speedBonus;
    if (speedMultiplier > 0) {
      time /= speedMultiplier;
    }
  }
  return Math.max(0.05, time);
}

function getBuildingBuildTimeForPlayer(type, playerOverride = null) {
  const def = BUILDINGS[type];
  if (!def) return 0;
  const player = getActivePlayer(playerOverride);
  if (player?.techs?.RapidFabrications) {
    return (def.buildTime || 0) * 0.5;
  }
  return def.buildTime || 0;
}

function getBuildingQueueRemainingTime(building) {
  if (!Array.isArray(building?.productionQueue) || building.productionQueue.length === 0) {
    return 0;
  }
  return building.productionQueue.reduce(
    (sum, job) => sum + Math.max(0, Number(job?.remaining) || 0),
    0
  );
}

function pickBestProductionBuildingForUnit(
  actionableBuildings,
  unitType,
  player,
  preferredBuilding = null
) {
  if (!Array.isArray(actionableBuildings) || actionableBuildings.length === 0) {
    return null;
  }
  const epsilon = 1e-6;
  let bestProjected = Infinity;
  const candidates = [];
  for (const building of actionableBuildings) {
    const projectedTime =
      getBuildingQueueRemainingTime(building) +
      getUnitBuildTimeForPlayer(unitType, player, building);
    if (projectedTime + epsilon < bestProjected) {
      bestProjected = projectedTime;
      candidates.length = 0;
      candidates.push(building);
      continue;
    }
    if (Math.abs(projectedTime - bestProjected) <= epsilon) {
      candidates.push(building);
    }
  }
  if (!candidates.length) return actionableBuildings[0];
  if (preferredBuilding) {
    const preferredId = Number(preferredBuilding.id);
    const match = candidates.find((building) => Number(building.id) === preferredId);
    if (match) return match;
  }
  return candidates[0];
}


function getUnitStatsForPlayer(unitType, player) {
  const def = UNITS[unitType];
  if (!def) return null;
  const tier = getUnitUpgradeTierForPlayer(unitType, player);
  const upgrade = tier ? UNIT_UPGRADE_STATS[unitType]?.[tier] : null;
  return {
    ...def,
    ...upgrade,
    bonus: upgrade?.bonus ?? def.bonus ?? [],
  };
}

function getUnitDisplayName(unitType, player) {
  const def = UNITS[unitType];
  if (!def) return unitType;
  const path = UNIT_UPGRADE_PATHS[unitType];
  if (!path || !player) return def.name;
  const tier = getUnitUpgradeTierForPlayer(unitType, player);
  if (tier === null) return def.name;
  const normalTier = path.normalTier ?? path.unlockTier ?? 0;
  if (tier < normalTier) {
    if (tier === normalTier - 2) return `Vanguard ${def.name}`;
    if (tier === normalTier - 1) return `Early ${def.name}`;
    return def.name;
  }
  if (tier === normalTier) return def.name;
  const prefix = (AGE_ORDER[tier] || "").replace(" Era", "");
  return prefix ? `${prefix} ${def.name}` : def.name;
}

function getBuildingAttackLines(building, def, player) {
  const lines = [];
  const formatValue = (value) =>
    Math.abs(value - Math.round(value)) < 0.01
      ? `${Math.round(value)}`
      : value.toFixed(1);
  const getSplashLine = (attackDef) => {
    if (!attackDef || (attackDef.splashRadius || 0) <= 0) return null;
    const tiers = Array.isArray(attackDef.splashFalloff) && attackDef.splashFalloff.length
      ? [...attackDef.splashFalloff].sort(
          (a, b) => (a?.radius || 0) - (b?.radius || 0)
        )
      : [{ radius: attackDef.splashRadius, scale: 1 }];
    const scales = tiers
      .map((tier) => `${Math.round((tier?.scale || 0) * 100)}%`)
      .join(" / ");
    return `Splash Radius: ${formatValue(attackDef.splashRadius)} tiles (${scales})`;
  };
  const rangedBonus =
    building.type === "DisruptorCannon" ? 0 : getRangedTechBonus(player);
  const addLine = (label, damage, range, cooldown, damageType = "ranged") => {
    lines.push(
      `${label}: ${formatValue(damage)} ${damageType} | Range: ${formatValue(
        range
      )} | Cooldown: ${cooldown}s`
    );
  };
  if (def.attack && def.attack.range > 0 && (def.attack.damage > 0 || def.attack.volley > 0)) {
    const attackDamageType = building.type === "DisruptorCannon" ? "siege" : "ranged";
    addLine(
      "Attack",
      (def.attack.damage || 0) + rangedBonus,
      def.attack.range,
      def.attack.cooldown || 1,
      attackDamageType
    );
  }
  if (building.type === "Outpost" && building.techs?.Arrowslits) {
    addLine("Arrowslits", 10 + rangedBonus, 7, 2);
  }
  if (
    (building.type === "Outpost" ||
      building.type === "Castle" ||
      building.type === "DominionSpire") &&
    building.techs?.SpringaldEmplacement
  ) {
    addLine("Springald", 40 + rangedBonus, 9, 4);
  }
  if (building.type === "StoneTower") {
    addLine("Springald", 60 + rangedBonus, 9, 4);
    addLine("Garrison Arrows", 9 + rangedBonus, 7, 2);
  }
  if (building.type === "DominionSpire") {
    const ageTier = getLandmarkAgeTierForBuilding(building, player) || 1;
    const arrows =
      LANDMARK_BONUSES?.DominionSpire?.arrowslitsByAge?.[ageTier - 1] || 2;
    const arrowslitDamage =
      LANDMARK_BONUSES?.DominionSpire?.arrowslitDamageByAge?.[ageTier - 1] || 10;
    addLine(`Arrowslits x${arrows}`, arrowslitDamage + rangedBonus, 8, 0.5);
    addLine("Garrison Arrows", 8 + rangedBonus, 8, 2);
  }
  if (building.type === "DisruptorCannon") {
    const splashLine = getSplashLine(def.attack);
    if (splashLine) lines.push(splashLine);
    lines.push("Bonus: +500 vs Buildings");
  }
  return lines;
}

function getBuildingTypeLabel(buildingType) {
  if (!buildingType) return "Building";
  const tag = (BUILDINGS[buildingType]?.tag || "").toLowerCase();
  let baseLabel = "Building";
  if (tag.includes("economic")) {
    baseLabel = "Economic";
  } else if (tag.includes("military")) {
    baseLabel = "Military";
  } else if (tag.includes("defensive")) {
    baseLabel = "Defensive";
  } else if (tag.includes("technology")) {
    baseLabel = "Technology";
  } else if (tag.includes("religious")) {
    baseLabel = "Religious";
  } else if (tag.includes("population")) {
    baseLabel = "Population";
  }
  if (
    buildingType === "Farm" ||
    buildingType === "Mill" ||
    buildingType === "LumberCamp" ||
    buildingType === "MiningCamp" ||
    buildingType === "Market" ||
    buildingType === "TownCenter" ||
    buildingType === "TradePost"
  ) {
    baseLabel = "Economic";
  } else if (buildingType === "House") {
    baseLabel = "Population";
  } else if (buildingType === "Monastery") {
    baseLabel = "Religious";
  } else if (
    buildingType === "Barracks" ||
    buildingType === "ArcheryRange" ||
    buildingType === "Stable" ||
    buildingType === "SiegeWorkshop"
  ) {
    baseLabel = "Military";
  } else if (buildingType === "Armory" || buildingType === "TechLab") {
    baseLabel = "Technology";
  } else if (
    buildingType === "Outpost" ||
    buildingType === "StoneTower" ||
    buildingType === "Castle" ||
    buildingType === "DisruptorCannon"
  ) {
    baseLabel = "Defensive";
  }
  const isLandmark = tag.includes("landmark");
  if (isLandmark && !baseLabel.toLowerCase().includes("landmark")) {
    return `${baseLabel} Landmark`;
  }
  return baseLabel;
}

function getUnitAttackLines(unit, def, player) {
  const lines = [];
  if ((def.damage || 0) <= 0 && (!def.attacks || !def.attacks.length)) {
    return ["No attack"];
  }
  const rangeBonus = getGunpowderSiegeRangeBonus(player, unit.type);
  const damageMultiplier = getUnitDamageMultiplierForDisplay(unit, player);
  const formatStat = (value) =>
    Math.abs(value - Math.round(value)) < 0.01
      ? `${Math.round(value)}`
      : value.toFixed(1);
  const isRanged = (def.range || 0.5) + rangeBonus > 0.5;
  const attackLabel = def.type?.includes("Siege")
    ? "siege"
    : isRanged
    ? "ranged"
    : "melee";
  const bonus = isRanged ? getRangedTechBonus(player, unit.type) : getMeleeTechBonus(player);
  const stats = getUnitStatsForPlayer(unit.type, player) || def;
  if (Array.isArray(def.attacks) && def.attacks.length > 0) {
    def.attacks.forEach((attack) => {
      const label = attack.label || "Attack";
      const damage = ((attack.damage || stats.damage || 0) + bonus) * damageMultiplier;
      const range = (attack.range ?? def.range ?? 0.5) + rangeBonus;
      const cooldown = attack.cooldown ?? def.attackCooldown ?? 1;
      lines.push(
        `${label}: ${formatStat(damage)} ${attackLabel} | Range: ${formatStat(range)} | Cooldown: ${cooldown}s`
      );
    });
  } else {
    const damage = ((stats.damage || def.damage || 0) + bonus) * damageMultiplier;
    const range = (def.range || 0.5) + rangeBonus;
    const cooldown = def.attackCooldown || 1;
    lines.push(
      `Attack: ${formatStat(damage)} ${attackLabel} | Range: ${formatStat(range)} | Cooldown: ${cooldown}s`
    );
  }
  if (stats.chargeDamage) {
    lines.push(`Charge Bonus: +${stats.chargeDamage} dmg`);
  }
  return lines;
}

function getPlayerColor(ownerId) {
  if (ownerId === null || ownerId === undefined) return "#ffffff";
  const player = players.find((p) => p.index === ownerId);
  return player?.color || PLAYER_COLORS[ownerId] || "#ffffff";
}

function getPlayerTeam(ownerId) {
  if (ownerId === null || ownerId === undefined) return null;
  const player = players.find((p) => p.index === ownerId);
  return player?.team ?? ownerId + 1;
}

function getUnitPopulationCost(unitType) {
  const pop = Number(UNITS[unitType]?.population ?? 1);
  if (!Number.isFinite(pop) || pop <= 0) return 1;
  return pop;
}

function getPopulationCapForPlayer(player) {
  if (!player) return 20;
  if (Number.isFinite(player.populationCap)) {
    return Math.max(0, Number(player.populationCap));
  }
  const houseCount = buildings.filter(
    (building) =>
      building.ownerId === player.index &&
      building.type === "House" &&
      !building.isUnderConstruction &&
      (building.hp ?? 0) > 0
  ).length;
  return Math.min(200, 20 + houseCount * 10);
}

function getPopulationUsedForPlayer(player) {
  if (!player) return 0;
  if (Number.isFinite(player.populationUsed)) {
    return Math.max(0, Number(player.populationUsed));
  }
  let used = 0;
  for (const unit of units) {
    if (unit.ownerId !== player.index) continue;
    used += getUnitPopulationCost(unit.type);
  }
  for (const building of buildings) {
    if (building.ownerId !== player.index) continue;
    const garrison = Array.isArray(building.garrison) ? building.garrison : [];
    for (const entry of garrison) {
      used += getUnitPopulationCost(entry.type);
    }
  }
  return used;
}

function arePlayersAllied(aOwnerId, bOwnerId) {
  if (
    aOwnerId === null ||
    aOwnerId === undefined ||
    bOwnerId === null ||
    bOwnerId === undefined
  ) {
    return false;
  }
  const aPlayer = players.find((p) => p.index === aOwnerId);
  const bPlayer = players.find((p) => p.index === bOwnerId);
  if (!aPlayer || !bPlayer) return false;
  return getPlayerTeam(aOwnerId) === getPlayerTeam(bOwnerId);
}

function isEnemyPlayer(ownerId) {
  if (playerIndex === null || ownerId === null || ownerId === undefined) return false;
  return !arePlayersAllied(ownerId, playerIndex);
}

function computeTradeGold(distance) {
  return 0.008 * distance * distance + 0.1 * distance;
}

function getGarrisonCapacityForBuilding(building) {
  if (!building) return 0;
  if (isDestroyedLandmarkClient(building)) return 0;
  if (building.type === "TownCenter" || building.type === "Castle") return 15;
  if (building.type === "Outpost") return 5;
  if (building.type === "StoneTower") return 8;
  if (building.type === "OldMarketPavilion") return 8;
  if (building.type === "DominionSpire") {
    const ageTier = getLandmarkAgeTierForBuilding(building) || 1;
    return (
      LANDMARK_BONUSES?.DominionSpire?.garrisonByAge?.[ageTier - 1] || 8
    );
  }
  return 0;
}

function isDestroyedLandmarkClient(building) {
  if (!building) return false;
  if (!isLandmarkType(building.type)) return false;
  return !!building.landmarkDestroyed;
}

function isUntargetableDestroyedLandmarkClient(building) {
  if (!isDestroyedLandmarkClient(building)) return false;
  return (building.hp ?? 0) <= 0;
}

function getBuildingMaxHp(building) {
  if (!building) return 1;
  const def = BUILDINGS[building.type];
  return building.maxHp || def?.health || building.hp || 1;
}

function isLandmarkType(buildingType) {
  return (LANDMARK_POOL || []).includes(buildingType);
}

function getLandmarkAgeCostForPlayer(player) {
  const nextTier = Math.max(1, Math.min(4, (player?.ageTier ?? 0) + 1));
  return AGE_UP_COSTS[nextTier] || AGE_UP_COSTS[4] || null;
}

function getBuildingCostForPlayer(buildingType, player) {
  if (isLandmarkType(buildingType)) {
    return normalizeCost(getLandmarkAgeCostForPlayer(player));
  }
  return normalizeCost(BUILDINGS[buildingType]?.cost || null);
}

function hasOwnedLandmarkUnderConstruction(ownerId) {
  return buildings.some(
    (building) =>
      building.ownerId === ownerId &&
      isLandmarkType(building.type) &&
      building.isUnderConstruction
  );
}

function hasOwnedBuildingType(ownerId, buildingType) {
  return buildings.some(
    (building) => building.ownerId === ownerId && building.type === buildingType
  );
}

function hasOwnedCompletedLandmarkType(ownerId, buildingType, playerOverride = null) {
  if (!isLandmarkType(buildingType)) return false;
  const owner = playerOverride || players.find((p) => p.index === ownerId);
  const builtTier = Number(owner?.landmarkBuiltAges?.[buildingType] || 0);
  if (builtTier >= 1) return true;
  return buildings.some(
    (building) =>
      building.ownerId === ownerId &&
      building.type === buildingType &&
      !building.isUnderConstruction
  );
}

function isRelicBuildingType(buildingType) {
  const def = BUILDINGS[buildingType];
  if (!def) return false;
  if (Number.isFinite(def.relicCapacity) && def.relicCapacity > 0) return true;
  return buildingType === "Monastery";
}

function getLandmarkAgeTierForBuilding(building, ownerOverride = null) {
  if (!building) return null;
  const fromBuilding = Number(building.landmarkAgeTier || 0);
  if (fromBuilding >= 1) return Math.min(4, Math.floor(fromBuilding));
  const owner =
    ownerOverride ||
    players.find((p) => p.index === building.ownerId);
  const fromOwner = Number(owner?.landmarkBuiltAges?.[building.type] || 0);
  if (fromOwner >= 1) return Math.min(4, Math.floor(fromOwner));
  return null;
}

function getGroveAgeTierForPlayer(player) {
  const tier = Number(player?.landmarkBuiltAges?.GroveUniversity || 0);
  return tier >= 1 ? Math.min(4, Math.floor(tier)) : null;
}

function getTechCostForPlayer(techId, player) {
  const tech = TECHNOLOGIES[techId];
  if (!tech) return null;
  let cost = tech.cost ? { ...tech.cost } : null;
  const groveTier = getGroveAgeTierForPlayer(player);
  if (tech.groveDynamicCost && groveTier) {
    const byAge =
      LANDMARK_BONUSES?.GroveUniversity?.techCostByAge?.[groveTier - 1] || null;
    if (byAge) {
      cost = { ...byAge };
    }
  }
  const reduction =
    groveTier
      ? LANDMARK_BONUSES?.GroveUniversity?.techCostReductionByAge?.[groveTier - 1] || 0
      : 0;
  if (cost && reduction > 0) {
    return scaleCost(cost, Math.max(0, 1 - reduction));
  }
  return normalizeCost(cost);
}

function getBuildingDescriptionForUI(buildingType, options = {}) {
  const { building = null, owner = null, player = null } = options;
  if (building && isDestroyedLandmarkClient(building)) {
    return "Destroyed landmark. This landmark is inactive until repaired to full health.";
  }
  if (!isLandmarkType(buildingType)) {
    return BUILDING_DESCRIPTIONS[buildingType] || "Structure for your settlement.";
  }
  let ageTier = 1;
  if (building) {
    ageTier = getLandmarkAgeTierForBuilding(building, owner) || 1;
  } else if (player) {
    ageTier = clamp((player.ageTier ?? 0) + 1, 1, 4);
  }
  return getDynamicLandmarkDescription(buildingType, ageTier);
}

function getTechnologyDescriptionForUI(techId, player) {
  const groveTier = getGroveAgeTierForPlayer(player) || 1;
  return getDynamicTechnologyDescription(techId, groveTier);
}

function isBuildingDamaged(building) {
  if (!building) return false;
  return (building.hp || 0) < getBuildingMaxHp(building) - 0.01;
}

function isRepairableSiegeUnit(unit) {
  if (!unit) return false;
  if (!UNITS[unit.type]?.type?.includes("Siege")) return false;
  const maxHp = unit.maxHp || UNITS[unit.type]?.health || unit.hp || 1;
  return (unit.hp || 0) < maxHp - 0.01;
}

function hasGarrisonSpace(building) {
  if (!building) return false;
  const cap = getGarrisonCapacityForBuilding(building);
  if (cap <= 0) return false;
  const count = Number(building.garrisonCount || 0);
  return count < cap;
}

function refreshSelectionDetails() {
  if (!selectedUnits.length && !selectedBuildings.length && !selectedResource && !selectedRelic) return;

  if (selectedBuildings.length) {
    if (selectedBuildings.length === 1) {
      const building = selectedBuildings[0];
      const def = BUILDINGS[building.type];
      const queue = building.productionQueue || [];
      const ownerLabel =
        building.ownerId !== undefined && building.ownerId !== null
          ? `Owner: Player ${building.ownerId + 1}`
          : "Owner: Neutral";
      const buildingTypeLabel = getBuildingTypeLabel(building.type);
      const destroyedLandmark = isDestroyedLandmarkClient(building);
      const queueInfo =
        queue.length > 0
          ? ` | Queue: ${queue.length} (Next: ${Math.max(
              0,
              queue[0].remaining
            ).toFixed(1)}s)`
          : "";
      const garrisonCapacity = getGarrisonCapacityForBuilding(building);
      const garrisonCount = building.garrisonCount || 0;
      const garrisonInfo =
        garrisonCapacity > 0
          ? `Garrisoned: ${garrisonCount}/${garrisonCapacity}`
          : "";
      const owner = players.find((p) => p.index === building.ownerId);
      const description = getBuildingDescriptionForUI(building.type, {
        building,
        owner,
        player: owner,
      });
      const relicCount = (building.relicIds || []).length;
      let relicInfo = "";
      if (isRelicBuildingType(building.type)) {
        const relicCap = Number(BUILDINGS[building.type]?.relicCapacity || 3);
        if (building.type === "EvermistGardens") {
          const ageTier = getLandmarkAgeTierForBuilding(building, owner) || 1;
          const income =
            LANDMARK_BONUSES?.EvermistGardens?.incomePerMinuteByAge?.[
              ageTier - 1
            ] || {};
          relicInfo = `Relics: ${relicCount}/${relicCap} | Income/Relic: ${Math.floor(
            income.gold || 0
          )}G ${Math.floor(income.wood || 0)}W ${Math.floor(
            income.food || 0
          )}F ${Math.floor(income.stone || 0)}S /min`;
        } else {
          relicInfo = `Relics: ${relicCount}/${relicCap} | Gold: ${relicCount * 80}/min`;
        }
      }
      const attackLines = destroyedLandmark
        ? ["Inactive: Repair to full health to reactivate."]
        : getBuildingAttackLines(building, def, owner);
      selectionTitle.textContent = def.name;
      const tagLabel =
        def.tag &&
        !def.tag.toLowerCase().includes(buildingTypeLabel.toLowerCase()) &&
        !buildingTypeLabel.toLowerCase().includes(def.tag.toLowerCase())
          ? ` (${def.tag})`
          : "";
      const buildingMaxHp = building.maxHp || def.health || building.hp || 1;
      const fountainInfo =
        building.type === "GoldenFountainSquare"
          ? ` | Converts To: ${String(
              building.convertResourceKind || "food"
            ).replace(/^./, (c) => c.toUpperCase())}`
          : "";
      const hpLine = def.isNeutral
        ? `Invulnerable${queueInfo ? ` | ${queueInfo.slice(3)}` : ""}`
        : `HP: ${Math.round(building.hp)}/${Math.round(buildingMaxHp)}${queueInfo}${
            garrisonInfo ? ` | ${garrisonInfo}` : ""
          }${relicInfo ? ` | ${relicInfo}` : ""}${fountainInfo}${
            destroyedLandmark ? " | Destroyed (inactive)" : ""
          }`;
      setSelectionDetailsLines([
        `${buildingTypeLabel}${tagLabel} | ${ownerLabel}`,
        description,
        hpLine,
        ...attackLines,
      ]);
      renderProductionQueue(selectedBuildings);
    } else {
      const typeCounts = selectedBuildings.reduce((acc, building) => {
        acc[building.type] = (acc[building.type] || 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(typeCounts)
        .map(([type, count]) => `${count} ${BUILDINGS[type]?.name || type}`)
        .join(", ");
      selectionTitle.textContent = `${selectedBuildings.length} Buildings Selected`;
      setSelectionDetailsLines([summary, "", ""]);
      renderProductionQueue(selectedBuildings);
    }
    return;
  }

  if (selectedResource) {
    const def = RESOURCE_DEFS[selectedResource.type];
    const nameMap = {
      BERRY: "Berry Bush",
      TREE: "Tree",
      GOLD: "Gold Mine",
      STONE: "Stone Mine",
    };
    const sourceMap = {
      food: "Food Source",
      wood: "Wood Source",
      gold: "Gold Source",
      stone: "Stone Source",
    };
    selectionTitle.textContent = nameMap[selectedResource.type] || "Resource";
    setSelectionDetailsLines([
      sourceMap[def.kind] || "Resource Source",
      "Resource node.",
      `Remaining: ${Math.max(0, Math.floor(selectedResource.amount))}`,
    ]);
    return;
  }

  if (selectedRelic) {
    selectionTitle.textContent = "Relic";
    setSelectionDetailsLines([
      "Religious Artifact",
      "Use a religious unit to pick up this Relic and place it in a religious building to generate resources.",
      "",
      "",
    ]);
    return;
  }

  if (selectedUnits.length === 1) {
    const unit = selectedUnits[0];
    const def = UNITS[unit.type];
    const ownerLabel =
      unit.ownerId !== undefined ? `Owner: Player ${unit.ownerId + 1}` : "";
    const description = UNIT_DESCRIPTIONS[unit.type] || "Unit.";
    let carryLabel = "";
    if (unit.type === "Villager" && unit.carry && unit.carry.amount > 0) {
      const kindLabel = {
        food: "Food",
        wood: "Wood",
        gold: "Gold",
        stone: "Stone",
      }[unit.carry.kind] || "Resource";
      carryLabel = ` | Carrying: ${Math.floor(unit.carry.amount)} ${kindLabel}`;
    }
    if (unit.type === "Monk" && unit.relicId) {
      carryLabel = `${carryLabel} | Carrying Relic`;
    }
    const owner = players.find((p) => p.index === unit.ownerId);
    const stats = getUnitStatsForPlayer(unit.type, owner) || def;
    const displayName = getUnitDisplayName(unit.type, owner);
    const bonusLabel =
      stats.bonus && stats.bonus.length
        ? stats.bonus
            .map((bonus) => `+${bonus.damage} vs ${bonus.target}`)
            .join(", ")
        : "None";
    let speedValue = def.speed;
    if (unit.type === "Villager") {
      if (owner?.techs?.CarryingFrame) {
        speedValue = def.speed + (TECHNOLOGIES.CarryingFrame?.speedBonus || 0);
      }
    } else if (unit.type === "Monk" && unit.relicId) {
      speedValue = 0.875;
    }
    const attackLines = getUnitAttackLines(unit, def, owner);
    let meleeArmor = stats.meleeArmor || 0;
    let rangedArmor = stats.rangedArmor || 0;
    if (owner && !def.type.includes("Siege")) {
      if (owner.techs?.ChainmailArmor) meleeArmor += 1;
      if (owner.techs?.DiamondArmor) meleeArmor += 1;
      if (owner.techs?.EmeraldArmor) meleeArmor += 1;
      if (owner.techs?.EnlightenedArmor) meleeArmor += 1;
      if (owner.techs?.LeatherPadding) rangedArmor += 1;
      if (owner.techs?.ImprovedShields) rangedArmor += 1;
      if (owner.techs?.DeflectiveScales) rangedArmor += 1;
      if (owner.techs?.GildedFittings) rangedArmor += 1;
    }
    const armorText = `Armor: ${meleeArmor}M / ${rangedArmor}R`;
    const rangedResistance = stats.rangedResistance || 0;
    const resistanceText =
      rangedResistance > 0
        ? ` | Ranged Resist: ${Math.round(rangedResistance * 100)}%`
        : "";
    selectionTitle.textContent = displayName;
    const tradeLine = (() => {
      if (unit.type !== "Trader") return null;
      const trade = unit.trade;
      if (!trade || !trade.homeId || !trade.destId) {
        return "Trade: Assign a home market and trade post.";
      }
      const home = buildings.find((b) => b.id === trade.homeId);
      const dest = buildings.find((b) => b.id === trade.destId);
      if (!home || !dest) return "Trade: Missing route.";
      const distance = Math.hypot(
        home.x + BUILDINGS[home.type].size / 2 - (dest.x + BUILDINGS[dest.type].size / 2),
        home.y + BUILDINGS[home.type].size / 2 - (dest.y + BUILDINGS[dest.type].size / 2)
      );
      const gold = trade.nextGold && trade.nextGold > 0 ? trade.nextGold : computeTradeGold(distance);
      if (trade.paused) {
        return `Trade: Paused | Gold per stop: ${gold.toFixed(1)}`;
      }
      return `Trade Gold per stop: ${gold.toFixed(1)}`;
    })();
    const areaBonusLines = [];
    const damageAuraBonus = getNearbyBasilicaDamageBonusForUnit(unit, owner);
    if (damageAuraBonus > 0) {
      areaBonusLines.push(
        `+${Math.round(
          damageAuraBonus * 100
        )}% damage bonus from Basilica of Eternal Light`
      );
    }
    const gatherAuraBonus =
      unit.type === "Villager"
        ? getNearbyGoldenFountainGatherBonusForUnit(unit, owner)
        : 0;
    if (gatherAuraBonus > 0) {
      areaBonusLines.push(
        `+${Math.round(
          gatherAuraBonus * 100
        )}% gather rate bonus from Golden Fountain Square`
      );
    }
    const unitMaxHp =
      unit.maxHp || stats.health || def.health || unit.hp || 1;
    setSelectionDetailsLines([
      `${def.type} | ${ownerLabel}`,
      description,
      `HP: ${Math.round(unit.hp)}/${Math.round(unitMaxHp)} | Speed: ${speedValue} | ${armorText}${resistanceText}${carryLabel}`,
      ...areaBonusLines,
      ...attackLines,
      `Bonuses: ${bonusLabel}`,
      ...(tradeLine ? [tradeLine] : []),
    ]);
    renderProductionQueue(null);
    return;
  }

  const typeCounts = selectedUnits.reduce((acc, unit) => {
    const owner = players.find((p) => p.index === unit.ownerId);
    const name = getUnitDisplayName(unit.type, owner) || unit.type;
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(typeCounts)
    .map(([name, count]) => `${count} ${name}`)
    .join(", ");
  selectionTitle.textContent = `${selectedUnits.length} Units Selected`;
  setSelectionDetailsLines([summary, "", ""]);
  renderProductionQueue(null);
}

function renderProductionQueue(buildingsList) {
  if (!productionQueueEl) return;
  if (!buildingsList || buildingsList.length === 0) {
    productionQueueEl.innerHTML = "";
    return;
  }
  if (buildingsList.length !== 1) {
    productionQueueEl.innerHTML = `
      <div class="queue-title">Queue</div>
      <div>Multiple buildings selected.</div>
    `;
    return;
  }
  const building = buildingsList[0];
  const owner = players.find((p) => p.index === building.ownerId);
  const queue = building.productionQueue || [];
  if (!queue.length) {
    productionQueueEl.innerHTML = `
      <div class="queue-title">Queue</div>
      <div>Empty</div>
    `;
    return;
  }
  const grouped = [];
  for (let i = 0; i < queue.length; i++) {
    const job = queue[i];
    const key = job.techId ? `tech:${job.techId}` : `unit:${job.unitType}`;
    const last = grouped[grouped.length - 1];
    if (last && last.key === key) {
      last.count += 1;
      last.remaining = job.remaining ?? last.remaining;
    } else {
      grouped.push({
        key,
        unitType: job.unitType,
        techId: job.techId,
        count: 1,
        remaining: job.remaining ?? 0,
        firstIndex: i,
      });
    }
  }
  const items = grouped
    .map((entry) => {
      const name = entry.techId
        ? TECHNOLOGIES[entry.techId]?.name || entry.techId
        : getUnitDisplayName(entry.unitType, owner) || entry.unitType;
      const countLabel = entry.count > 1 ? ` x${entry.count}` : "";
      const remaining = Math.max(0, entry.remaining ?? 0).toFixed(1);
      return `<button class="queue-item" data-index="${entry.firstIndex}" data-building-id="${building.id}">
        <span>${name}${countLabel}</span><span>${remaining}s</span>
      </button>`;
    })
    .join("");
  productionQueueEl.innerHTML = `<div class="queue-title">Queue</div>${items}`;
}

function setSelectionDetailsLines(lines) {
  const safeLines = lines.map((line) => line || "");
  selectionDetails.innerHTML = safeLines
    .map((line) => `<div>${line}</div>`)
    .join("");
}

function hideGarrisonPanel() {
  if (!garrisonPanel) return;
  garrisonPanel.classList.remove("visible");
  if (garrisonList) garrisonList.innerHTML = "";
}

function renderGarrisonPanel(building) {
  if (!garrisonPanel || !garrisonList || !ungarrisonAllButton) return;
  if (!building.garrison || building.garrison.length === 0) {
    hideGarrisonPanel();
    return;
  }
  const counts = building.garrison.reduce((acc, unit) => {
    acc[unit.type] = (acc[unit.type] || 0) + 1;
    return acc;
  }, {});
  const owner = players.find((p) => p.index === building.ownerId);
  const lines = Object.entries(counts).map(
    ([type, count]) => `${count} ${getUnitDisplayName(type, owner) || type}`
  );
  garrisonList.innerHTML = lines.map((line) => `<div>${line}</div>`).join("");
  garrisonPanel.classList.add("visible");
  ungarrisonAllButton.onclick = () => {
    if (building.ownerId !== playerIndex) return;
    sendCommand(
      { type: "ungarrison", buildingId: building.id },
      { expectAck: false }
    );
  };
}

function clearBuildButtons() {
  if (!buildButtons) return;
  buildButtons
    .querySelectorAll(".build-row")
    .forEach((row) => (row.innerHTML = ""));
}

function canArmRepairModeFromSelection() {
  if (!selectedUnits.length) return false;
  const ownedUnits = selectedUnits.filter((u) => u.ownerId === playerIndex);
  if (!ownedUnits.length || ownedUnits.length !== selectedUnits.length) return false;
  return ownedUnits.every((u) => u.type === "Villager");
}

function armRepairMode() {
  if (!canArmRepairModeFromSelection()) return false;
  attackMoveArmed = false;
  dropRelicArmed = false;
  healArmed = false;
  repairArmed = true;
  showBanner(
    "Click a damaged friendly building or siege unit to repair.",
    "info",
    2200
  );
  return true;
}

function renderUnitActionButtons() {
  if (!productionButtons) return;
  productionButtons.innerHTML = "";
  if (!selectedUnits.length) return;
  const ownedUnits = selectedUnits.filter((u) => u.ownerId === playerIndex);
  if (!ownedUnits.length) return;
  const row = document.createElement("div");
  row.className = "prod-row";

  const onlyVillagers =
    ownedUnits.length === selectedUnits.length &&
    ownedUnits.every((u) => u.type === "Villager");
  if (onlyVillagers) {
    const button = document.createElement("button");
    button.className = "prod-btn";
    button.textContent = `Repair (${REPAIR_COMMAND_HOTKEY.toUpperCase()})`;
    button.addEventListener("click", () => {
      armRepairMode();
    });
    row.appendChild(button);
    productionButtons.appendChild(row);
    return;
  }

  if (selectedUnits.length !== 1) return;
  const unit = ownedUnits[0];
  if (!unit) return;

  if (unit.type === "Trader") {
    const canRestart = !!(unit.trade?.homeId && unit.trade?.destId);
    const button = document.createElement("button");
    button.className = "prod-btn";
    button.textContent = "Restart Trading";
    button.disabled = !canRestart;
    button.addEventListener("click", () => {
      sendCommand(
        {
          type: "restartTrading",
          unitIds: [unit.id],
        },
        {
          onError: (response) => {
            if (response?.reason === "no_route") {
              showBanner("Assign a home market and trade post first.", "error");
              return;
            }
            showBanner("Unable to restart trading.", "error");
          },
          onOk: () => {
            showBanner("Trading restarted.", "ok", 1200);
          },
        }
      );
    });
    row.appendChild(button);
  } else if (unit.type === "Monk") {
    const button = document.createElement("button");
    button.className = "prod-btn";
    if (unit.relicId) {
      button.textContent = "Drop Relic";
      button.addEventListener("click", () => {
        healArmed = false;
        repairArmed = false;
        dropRelicArmed = true;
        showBanner("Click a location to drop or store the relic.", "info", 2200);
      });
    } else {
      button.textContent = "Heal";
      button.addEventListener("click", () => {
        dropRelicArmed = false;
        repairArmed = false;
        healArmed = true;
        showBanner("Click a friendly unit to heal.", "info", 2200);
      });
    }
    row.appendChild(button);
  } else {
    return;
  }

  productionButtons.appendChild(row);
}

function renderBuildButtons() {
  if (!buildButtons) return;
  if (selectedBuildings.length || selectedResource) {
    buildButtons.classList.add("build-hidden");
    buildButtons.style.display = "none";
    clearBuildButtons();
    return;
  }
  const hasVillager = selectedUnits.some(
    (unit) => unit.type === "Villager" && unit.ownerId === playerIndex
  );
  if (!hasVillager) {
    buildButtons.classList.add("build-hidden");
    buildButtons.style.display = "none";
    clearBuildButtons();
    return;
  }
  buildButtons.classList.remove("build-hidden");
  buildButtons.style.display = "flex";
  const player = players.find((p) => p.index === playerIndex);
  const currentAgeTier = player?.ageTier ?? 0;
  const landmarkChoices = player?.landmarkChoices || [];
  const landmarkUnderConstruction = hasOwnedLandmarkUnderConstruction(playerIndex);
  const getBuildingTier = (def) =>
    typeof def.minAgeTier === "number" ? def.minAgeTier : 0;

  const appendBuildButton = (row, type, isLandmark = false) => {
    const def = BUILDINGS[type];
    if (!def) return false;
    const buildCost = getBuildingCostForPlayer(type, player);
    const ageLocked =
      typeof def.minAgeTier === "number" &&
      currentAgeTier < def.minAgeTier;
    const techLocked = !!(def.requiresTech && !player?.techs?.[def.requiresTech]);
    const landmarkAlreadyBuilt =
      isLandmark &&
      hasOwnedCompletedLandmarkType(playerIndex, type, player);
    const landmarkAgeMaxed = isLandmark && currentAgeTier >= 4;
    const landmarkBusy =
      isLandmark &&
      !landmarkAlreadyBuilt &&
      landmarkUnderConstruction;

    const button = document.createElement("button");
    button.className = "build-btn";
    const img = document.createElement("img");
    img.src = def.image || "";
    img.alt = def.name;
    button.appendChild(img);
    button.disabled =
      !player ||
      ageLocked ||
      techLocked ||
      landmarkAlreadyBuilt ||
      landmarkAgeMaxed ||
      landmarkBusy;

    button.addEventListener("click", () => {
      if (!player) {
        showBanner("Player data not ready.", "error");
        return;
      }
      if (isLandmark) {
        if (landmarkAgeMaxed) {
          showBanner("Maximum age reached.", "error");
          return;
        }
        if (landmarkAlreadyBuilt) {
          showBanner("This landmark has already been built.", "error");
          return;
        }
        if (landmarkBusy) {
          showBanner("Only one landmark can be under construction at a time.", "error");
          return;
        }
      }
      if (
        typeof def.minAgeTier === "number" &&
        currentAgeTier < def.minAgeTier
      ) {
        const eraName = AGE_ORDER[def.minAgeTier] || "Required Era";
        showBanner(`Requires ${eraName}.`, "error");
        return;
      }
      if (def.requiresTech && !player.techs?.[def.requiresTech]) {
        showBanner(getTechRequirementText(def.requiresTech), "error");
        return;
      }
      if (!canAfford(player.resources, buildCost)) {
        showBanner("Not enough resources.", "error");
        return;
      }
      buildMode = type;
      showBanner(`Place ${def.name}`, "info", 2000);
    });

    button.addEventListener("mouseenter", () => {
      if (!buildTooltip) return;
      const description = getBuildingDescriptionForUI(type, { player });
      const cost = formatCost(buildCost) || "Free";
      const buildTime = getBuildingBuildTimeForPlayer(type, player);
      const time = buildTime ? `${buildTime}s` : "Instant";
      let requirement = "";
      if (
        typeof def.minAgeTier === "number" &&
        currentAgeTier < def.minAgeTier
      ) {
        const eraName = AGE_ORDER[def.minAgeTier] || "Required Era";
        requirement += `<br /><span class="tooltip-requirement">Requires ${eraName}</span>`;
      }
      if (def.requiresTech && !player?.techs?.[def.requiresTech]) {
        requirement += `<br /><span class="tooltip-requirement">${getTechRequirementText(
          def.requiresTech
        )}</span>`;
      }
      if (isLandmark) {
        if (landmarkAgeMaxed) {
          requirement +=
            `<br /><span class="tooltip-requirement">Maximum age reached</span>`;
        } else if (landmarkAlreadyBuilt) {
          requirement +=
            `<br /><span class="tooltip-requirement">Already built</span>`;
        } else if (landmarkBusy) {
          requirement +=
            `<br /><span class="tooltip-requirement">Another landmark is under construction</span>`;
        }
      }
      buildTooltip.innerHTML = `
        <strong>${def.name}</strong><br />
        ${description}<br />
        Cost: ${cost} | Build: ${time}${requirement}
      `;
      buildTooltip.classList.add("visible");
    });
    button.addEventListener("mousemove", (event) => {
      if (!buildTooltip) return;
      const offset = 12;
      const rawX = event.clientX + offset;
      const rawY = event.clientY + offset;
      const tooltipRect = buildTooltip.getBoundingClientRect();
      const maxX = window.innerWidth - tooltipRect.width - 8;
      const maxY = window.innerHeight - tooltipRect.height - 8;
      const x = Math.max(8, Math.min(rawX, maxX));
      const y = Math.max(8, Math.min(rawY, maxY));
      buildTooltip.style.left = `${x}px`;
      buildTooltip.style.top = `${y}px`;
    });
    button.addEventListener("mouseleave", () => {
      if (!buildTooltip) return;
      buildTooltip.classList.remove("visible");
      buildTooltip.textContent = "";
    });
    row.appendChild(button);
    return true;
  };

  buildButtons.querySelectorAll(".build-column").forEach((column) => {
    const isLandmarkColumn = column.dataset.landmarks === "1";
    if (isLandmarkColumn) {
      const row = column.querySelector(".build-row");
      if (!row) return;
      row.innerHTML = "";
      let added = false;
      landmarkChoices.forEach((type) => {
        if (hasOwnedCompletedLandmarkType(playerIndex, type, player)) {
          return;
        }
        if (appendBuildButton(row, type, true)) {
          added = true;
        }
      });
      if (!added) {
        const spacer = document.createElement("div");
        spacer.className = "build-spacer";
        row.appendChild(spacer);
      }
      return;
    }
    const eraTier = Number.parseInt(column.dataset.era, 10) || 0;
    column.querySelectorAll(".build-row").forEach((row) => {
      const category = row.dataset.category;
      const types = BUILDING_CATEGORIES[category] || [];
      row.innerHTML = "";
      let added = false;
      types.forEach((type) => {
        const def = BUILDINGS[type];
        if (getBuildingTier(def) !== eraTier) {
          return;
        }
        if (appendBuildButton(row, type, false)) {
          added = true;
        }
      });
      if (!added) {
        const spacer = document.createElement("div");
        spacer.className = "build-spacer";
        row.appendChild(spacer);
      }
    });
  });
}

function showBanner(message, tone = "error", duration = 3000) {
  if (!errorBanner) return;
  errorBanner.dataset.tone = tone;
  errorBanner.textContent = message;
  errorBanner.style.visibility = "visible";
  if (errorTimeout) {
    clearTimeout(errorTimeout);
  }
  errorTimeout = setTimeout(() => {
    errorBanner.textContent = "";
    errorBanner.style.visibility = "hidden";
  }, duration);
}

function sendCommand(payload, options = {}) {
  const { onError, onOk, expectAck = true, timeoutMs = 800 } = options;
  if (!socket.connected) {
    showBanner("Not connected to server.", "error");
    return;
  }
  if (!expectAck) {
    socket.emit("command", payload);
    return;
  }
  let responded = false;
  const timer = setTimeout(() => {
    if (!responded) {
      showBanner("No response from server. Try restarting it.", "error", 4000);
    }
  }, timeoutMs);
  socket.emit("command", payload, (response) => {
    responded = true;
    clearTimeout(timer);
    if (response && response.ok === false) {
      if (onError) {
        onError(response);
      } else {
        showBanner("Command rejected.", "error");
      }
      return;
    }
    if (onOk) onOk(response);
  });
}

function findEntityAt(worldX, worldY) {
  for (const unit of units) {
    if (
      playerIndex !== null &&
      unit.ownerId !== playerIndex &&
      !isVisible(unit.x, unit.y)
    ) {
      continue;
    }
    const renderState = unitRenderState.get(unit.id);
    const posX = renderState ? renderState.renderX : unit.x;
    const posY = renderState ? renderState.renderY : unit.y;
    const d = Math.hypot(posX - worldX, posY - worldY);
    if (d <= 0.4) {
      return { ...unit, kind: "unit" };
    }
  }

  for (const building of buildings) {
    const def = BUILDINGS[building.type];
    if (
      playerIndex !== null &&
      building.ownerId !== playerIndex &&
      !def?.isNeutral &&
      !isVisible(building.x + def.size / 2, building.y + def.size / 2)
    ) {
      continue;
    }
    if (
      worldX >= building.x &&
      worldX <= building.x + def.size &&
      worldY >= building.y &&
      worldY <= building.y + def.size
    ) {
      return { ...building, kind: "building" };
    }
  }

  return null;
}

function findUnitAt(worldX, worldY, predicate = () => true) {
  let best = null;
  let bestDist = Infinity;
  for (const unit of units) {
    if (!predicate(unit)) continue;
    if (
      playerIndex !== null &&
      unit.ownerId !== playerIndex &&
      !isVisible(unit.x, unit.y)
    ) {
      continue;
    }
    const renderState = unitRenderState.get(unit.id);
    const posX = renderState ? renderState.renderX : unit.x;
    const posY = renderState ? renderState.renderY : unit.y;
    const isSiege = !!UNITS[unit.type]?.type?.includes("Siege");
    const hitRadius = isSiege ? 1.0 : 0.75;
    const d = Math.hypot(posX - worldX, posY - worldY);
    if (d <= hitRadius && d < bestDist) {
      best = unit;
      bestDist = d;
    }
  }
  return best ? { ...best, kind: "unit" } : null;
}

function findBuildingAt(worldX, worldY, predicate = () => true) {
  for (const building of buildings) {
    const def = BUILDINGS[building.type];
    if (!def) continue;
    if (!predicate(building, def)) continue;
    if (
      playerIndex !== null &&
      building.ownerId !== playerIndex &&
      !def.isNeutral &&
      !isVisible(building.x + def.size / 2, building.y + def.size / 2)
    ) {
      continue;
    }
    if (
      worldX >= building.x &&
      worldX <= building.x + def.size &&
      worldY >= building.y &&
      worldY <= building.y + def.size
    ) {
      return { ...building, kind: "building" };
    }
  }
  return null;
}

function findResourceAt(worldX, worldY) {
  for (const node of resources) {
    const centerX = node.x + node.size / 2;
    const centerY = node.y + node.size / 2;
    const radius = node.size / 2;
    if (playerIndex !== null && !isExplored(centerX, centerY)) {
      continue;
    }
    const d = Math.hypot(centerX - worldX, centerY - worldY);
    if (d <= radius) {
      return { ...node, kind: "resource" };
    }
  }
  return null;
}

function findRelicAt(worldX, worldY) {
  for (const relic of relics) {
    if (relic.carrierId || relic.storedInBuildingId) continue;
    if (playerIndex !== null && !isExplored(relic.x, relic.y)) continue;
    const radius = (relic.size || 0.9) * 0.5;
    const d = Math.hypot(relic.x - worldX, relic.y - worldY);
    if (d <= radius) {
      return { ...relic, kind: "relic" };
    }
  }
  return null;
}

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("mousedown", (event) => {
  if (playerIndex === null) return;
  const world = screenToWorld(event.clientX, event.clientY);

  if (event.button === 0) {
    if (attackMoveArmed) {
      if (selectedUnits.length) {
        const ownedUnits = selectedUnits.filter((u) => u.ownerId === playerIndex);
        if (ownedUnits.length) {
          sendCommand(
            {
              type: "attackMove",
              unitIds: ownedUnits.map((u) => u.id),
              target: { x: world.x, y: world.y },
              queue: !!event.shiftKey,
            },
            { expectAck: false }
          );
        }
      }
      attackMoveArmed = false;
      return;
    }
    if (dropRelicArmed) {
      const monksWithRelic = selectedUnits.filter(
        (u) => u.ownerId === playerIndex && u.type === "Monk" && u.relicId
      );
      if (monksWithRelic.length) {
        sendCommand(
          {
            type: "dropRelicAt",
            unitIds: monksWithRelic.map((u) => u.id),
            target: { x: world.x, y: world.y },
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
      }
      dropRelicArmed = false;
      return;
    }
    if (healArmed) {
      const healerMonks = selectedUnits.filter(
        (u) => u.ownerId === playerIndex && u.type === "Monk" && !u.relicId
      );
      const target = findEntityAt(world.x, world.y);
      const isSiegeTarget =
        target &&
        target.kind === "unit" &&
        !!UNITS[target.type]?.type?.includes("Siege");
      if (
        healerMonks.length &&
        target &&
        target.kind === "unit" &&
        target.ownerId === playerIndex &&
        !isSiegeTarget
      ) {
        sendCommand(
          {
            type: "healTarget",
            unitIds: healerMonks.map((u) => u.id),
            targetId: target.id,
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
      } else {
        showBanner(
          isSiegeTarget
            ? "Siege units cannot be healed."
            : "Select a friendly unit to heal.",
          "error",
          1500
        );
      }
      healArmed = false;
      return;
    }
    if (repairArmed) {
      const villagers = selectedUnits.filter(
        (u) => u.ownerId === playerIndex && u.type === "Villager"
      );
      const targetBuilding = findBuildingAt(
        world.x,
        world.y,
        (b, def) =>
          b.ownerId === playerIndex &&
          !def.isNeutral &&
          !def.isInvulnerable &&
          !b.isUnderConstruction &&
          isBuildingDamaged(b)
      );
      const targetSiege = findUnitAt(
        world.x,
        world.y,
        (unit) =>
          unit.ownerId === playerIndex &&
          isRepairableSiegeUnit(unit)
      );
      if (villagers.length && targetBuilding) {
        sendCommand(
          {
            type: "repair",
            buildingId: targetBuilding.id,
            builderIds: villagers.map((u) => u.id),
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
      } else if (villagers.length && targetSiege) {
        sendCommand(
          {
            type: "repair",
            unitId: targetSiege.id,
            builderIds: villagers.map((u) => u.id),
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
      } else {
        showBanner(
          "Select a damaged friendly building or siege unit to repair.",
          "error",
          1500
        );
      }
      repairArmed = false;
      return;
    }
    if (pendingCheat) {
      if (pendingCheat === "enemy_attack_move") {
        sendCommand(
          {
            type: "cheat",
            action: "enemy_attack_move",
            target: { x: world.x, y: world.y },
          },
          { expectAck: false }
        );
      } else {
        const unitTypeMap = {
          spawn_spearman: "Spearman",
          spawn_horseman: "Horseman",
          spawn_archer: "Archer",
          spawn_knight: "Knight",
          spawn_manatarms: "ManAtArms",
          spawn_crossbowman: "Crossbowman",
        };
        if (pendingCheat === "spawn_castle") {
          sendCommand(
            {
              type: "cheat",
              action: "spawn_castle",
              x: world.x,
              y: world.y,
            },
            { expectAck: false }
          );
        } else if (pendingCheat === "spawn_disruptor_cannon") {
          sendCommand(
            {
              type: "cheat",
              action: "spawn_disruptor_cannon",
              x: world.x,
              y: world.y,
            },
            { expectAck: false }
          );
        } else {
          const unitType = unitTypeMap[pendingCheat];
          if (unitType) {
            sendCommand(
              {
                type: "cheat",
                action: "spawn_enemy",
                unitType,
                x: world.x,
                y: world.y,
              },
              { expectAck: false }
            );
          }
        }
      }
      pendingCheat = null;
      return;
    }
    if (buildMode) {
      const topLeftX = Math.floor(world.x);
      const topLeftY = Math.floor(world.y);
      const buildType = buildMode;
      const builders = selectedUnits.filter(
        (u) => u.ownerId === playerIndex && u.type === "Villager"
      );
      if (!builders.length) {
        showBanner("No villagers selected.", "error");
        buildMode = null;
        return;
      }
      sendCommand(
        {
          type: "build",
          buildingType: buildType,
          x: topLeftX,
          y: topLeftY,
          builderIds: builders.map((u) => u.id),
        },
        {
          onError: (response) => {
            const reason = response.reason || "unknown";
            const friendly = {
              invalid_building: "Cannot place that building.",
              insufficient_resources: "Not enough resources.",
              invalid_location: "Invalid placement.",
              no_builders: "No villagers selected.",
              age_required: (() => {
                const minTier = BUILDINGS[buildType]?.minAgeTier;
                const eraName =
                  typeof minTier === "number"
                    ? AGE_ORDER[minTier] || "Required Era"
                    : "Required Era";
                return `Requires ${eraName}.`;
              })(),
              tech_required: getTechRequirementText(
                BUILDINGS[buildType]?.requiresTech
              ),
              age_max: "Maximum age reached.",
              invalid_landmark: "This landmark is not in your available landmark set.",
              landmark_already_built: "This landmark has already been built.",
              landmark_under_construction:
                "Another landmark is already under construction.",
            }[reason] || "Unable to build there.";
            showBanner(friendly, "error");
          },
          onOk: () => {
            showBanner("Construction started.", "ok", 1500);
          },
        }
      );
      buildMode = null;
      return;
    }
    selectionBox = {
      startX: event.clientX,
      startY: event.clientY,
      endX: event.clientX,
      endY: event.clientY,
    };
    isDraggingSelection = false;
  } else if (event.button === 2) {
    if (buildMode) {
      buildMode = null;
      showBanner("Construction canceled.", "info", 1500);
      return;
    }
    if (attackMoveArmed) {
      attackMoveArmed = false;
      return;
    }
    if (dropRelicArmed) {
      dropRelicArmed = false;
      return;
    }
    if (healArmed) {
      healArmed = false;
      return;
    }
    if (repairArmed) {
      repairArmed = false;
      return;
    }
    const targetEnemyUnit = findUnitAt(
      world.x,
      world.y,
      (u) => u.ownerId !== undefined && u.ownerId !== null && isEnemyPlayer(u.ownerId)
    );
    const targetFriendlyUnit = findUnitAt(
      world.x,
      world.y,
      (u) => u.ownerId === playerIndex
    );
    const targetEnemyBuilding = findBuildingAt(
      world.x,
      world.y,
      (b, def) =>
        b.ownerId !== undefined &&
        b.ownerId !== null &&
        isEnemyPlayer(b.ownerId) &&
        !def.isNeutral &&
        !def.isInvulnerable &&
        !isUntargetableDestroyedLandmarkClient(b)
    );
    const targetResource = findResourceAt(world.x, world.y);
    const targetRelic = findRelicAt(world.x, world.y);
    const targetBuilding = findEntityAt(world.x, world.y);
    if (selectedUnits.length) {
      const ownedUnits = selectedUnits.filter((u) => u.ownerId === playerIndex);
      if (!ownedUnits.length) return;
      if (targetEnemyUnit) {
        sendCommand(
          {
            type: "attackTarget",
            unitIds: ownedUnits.map((u) => u.id),
            targetId: targetEnemyUnit.id,
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      if (targetEnemyBuilding) {
        sendCommand(
          {
            type: "attackTarget",
            unitIds: ownedUnits.map((u) => u.id),
            targetId: targetEnemyBuilding.id,
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      if (
        targetBuilding &&
        targetBuilding.kind === "unit" &&
        targetBuilding.ownerId !== undefined &&
        targetBuilding.ownerId !== null &&
        isEnemyPlayer(targetBuilding.ownerId)
      ) {
        sendCommand(
          {
            type: "attackTarget",
            unitIds: ownedUnits.map((u) => u.id),
            targetId: targetBuilding.id,
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      const player = players.find((p) => p.index === playerIndex);
      const monks = ownedUnits.filter((u) => u.type === "Monk");
      if (targetRelic && monks.length) {
        if ((player?.ageTier ?? 0) < 2) {
          showBanner("Requires Diamond Era.", "error");
          return;
        }
        sendCommand(
          {
            type: "pickupRelic",
            relicId: targetRelic.id,
            unitIds: monks.map((u) => u.id),
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      if (
        targetBuilding &&
        targetBuilding.kind === "building" &&
        isRelicBuildingType(targetBuilding.type) &&
        targetBuilding.ownerId === playerIndex &&
        monks.length
      ) {
        const carryingMonks = monks.filter((u) => u.relicId);
        if (carryingMonks.length) {
          sendCommand(
            {
              type: "depositRelic",
              buildingId: targetBuilding.id,
              unitIds: carryingMonks.map((u) => u.id),
              queue: !!event.shiftKey,
            },
            { expectAck: false }
          );
          attackMoveArmed = false;
          return;
        }
        const freeMonks = monks.filter((u) => !u.relicId);
        if (freeMonks.length && (targetBuilding.relicIds || []).length > 0) {
          if ((player?.ageTier ?? 0) < 2) {
            showBanner("Requires Diamond Era.", "error");
            return;
          }
          sendCommand(
            {
              type: "takeRelic",
              buildingId: targetBuilding.id,
              unitIds: freeMonks.map((u) => u.id),
              queue: !!event.shiftKey,
            },
            { expectAck: false }
          );
          attackMoveArmed = false;
          return;
        }
      }
      if (targetFriendlyUnit) {
        const repairers = ownedUnits.filter((u) => u.type === "Villager");
        if (
          repairers.length &&
          isRepairableSiegeUnit(targetFriendlyUnit)
        ) {
          sendCommand(
            {
              type: "repair",
              unitId: targetFriendlyUnit.id,
              builderIds: repairers.map((u) => u.id),
              queue: !!event.shiftKey,
            },
            { expectAck: false }
          );
          attackMoveArmed = false;
          return;
        }
        const monks = ownedUnits.filter((u) => u.type === "Monk");
        if (monks.length && !UNITS[targetFriendlyUnit.type]?.type?.includes("Siege")) {
          sendCommand(
            {
              type: "healTarget",
              unitIds: monks.map((u) => u.id),
              targetId: targetFriendlyUnit.id,
              queue: !!event.shiftKey,
            },
            { expectAck: false }
          );
          attackMoveArmed = false;
          return;
        }
      }
      const traders = ownedUnits.filter((u) => u.type === "Trader");
      if (
        traders.length &&
        targetBuilding &&
        targetBuilding.kind === "building" &&
        targetBuilding.type === "Market" &&
        targetBuilding.ownerId === playerIndex &&
        !targetBuilding.isUnderConstruction
      ) {
        sendCommand(
          {
            type: "setTradeHome",
            buildingId: targetBuilding.id,
            unitIds: traders.map((u) => u.id),
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      if (
        traders.length &&
        targetBuilding &&
        targetBuilding.kind === "building" &&
        targetBuilding.type === "TradePost"
      ) {
        sendCommand(
          {
            type: "setTradeDestination",
            buildingId: targetBuilding.id,
            unitIds: traders.map((u) => u.id),
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      if (
        targetBuilding &&
        targetBuilding.kind === "building" &&
        targetBuilding.type === "Farm" &&
        targetBuilding.ownerId === playerIndex &&
        !targetBuilding.isUnderConstruction
      ) {
        const villagers = ownedUnits.filter((u) => u.type === "Villager");
        if (!villagers.length) return;
        sendCommand(
          {
            type: "farmAssign",
            buildingId: targetBuilding.id,
            builderIds: villagers.map((u) => u.id),
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      if (
        targetBuilding &&
        targetBuilding.kind === "building" &&
        targetBuilding.isUnderConstruction &&
        targetBuilding.ownerId === playerIndex
      ) {
        const builders = ownedUnits.filter((u) => u.type === "Villager");
        if (!builders.length) return;
        sendCommand(
          {
            type: "assignBuild",
            buildingId: targetBuilding.id,
            builderIds: builders.map((u) => u.id),
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      if (
        targetBuilding &&
        targetBuilding.kind === "building" &&
        targetBuilding.ownerId === playerIndex &&
        [
          "TownCenter",
          "Outpost",
          "StoneTower",
          "Castle",
          "DominionSpire",
          "OldMarketPavilion",
        ].includes(targetBuilding.type) &&
        hasGarrisonSpace(targetBuilding)
      ) {
        sendCommand(
          {
            type: "garrison",
            buildingId: targetBuilding.id,
            unitIds: ownedUnits.map((u) => u.id),
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      if (
        targetBuilding &&
        targetBuilding.kind === "building" &&
        targetBuilding.ownerId === playerIndex &&
        !targetBuilding.isUnderConstruction &&
        isBuildingDamaged(targetBuilding)
      ) {
        const repairers = ownedUnits.filter((u) => u.type === "Villager");
        if (repairers.length) {
          sendCommand(
            {
              type: "repair",
              buildingId: targetBuilding.id,
              builderIds: repairers.map((u) => u.id),
              queue: !!event.shiftKey,
            },
            { expectAck: false }
          );
          attackMoveArmed = false;
          return;
        }
      }
      if (
        targetBuilding &&
        targetBuilding.ownerId !== undefined &&
        targetBuilding.ownerId !== null &&
        isEnemyPlayer(targetBuilding.ownerId)
      ) {
        sendCommand(
          {
            type: "attackTarget",
            unitIds: ownedUnits.map((u) => u.id),
            targetId: targetBuilding.id,
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      if (targetResource) {
        const villagers = ownedUnits.filter((u) => u.type === "Villager");
        if (!villagers.length) return;
        sendCommand({
          type: "gather",
          unitIds: villagers.map((u) => u.id),
          resourceId: targetResource.id,
          queue: !!event.shiftKey,
        }, { expectAck: false });
        attackMoveArmed = false;
        return;
      }
      sendCommand(
        {
          type: "move",
          unitIds: ownedUnits.map((u) => u.id),
          target: { x: world.x, y: world.y },
          queue: !!event.shiftKey,
        },
        { expectAck: false }
      );
      return;
    }

    const rallyBuildings = (
      selectedBuildings.length ? selectedBuildings : selectedBuilding ? [selectedBuilding] : []
    ).filter(
      (building) =>
        building &&
        building.ownerId === playerIndex &&
        !isDestroyedLandmarkClient(building)
    );
    if (rallyBuildings.length) {
      const clickedOwnedBuilding =
        targetBuilding &&
        targetBuilding.kind === "building" &&
        targetBuilding.ownerId === playerIndex
          ? targetBuilding
          : null;
      if (
        clickedOwnedBuilding &&
        rallyBuildings.some((building) => building.id === clickedOwnedBuilding.id)
      ) {
        const clickedId = clickedOwnedBuilding.id;
        const otherBuildings = rallyBuildings.filter(
          (building) => building.id !== clickedId
        );
        sendCommand(
          {
            type: "clearRally",
            buildingId: clickedId,
          },
          { expectAck: false }
        );
        if (otherBuildings.length) {
          const clickedDef = BUILDINGS[clickedOwnedBuilding.type];
          const target = {
            x: clickedOwnedBuilding.x + (clickedDef?.size || 1) / 2,
            y: clickedOwnedBuilding.y + (clickedDef?.size || 1) / 2,
          };
          sendCommand(
            {
              type: "rally",
              buildingIds: otherBuildings.map((building) => building.id),
              target,
            },
            { expectAck: false }
          );
        }
        attackMoveArmed = false;
        return;
      }
      const enemyTarget =
        targetEnemyUnit ||
        targetEnemyBuilding ||
        (targetBuilding &&
        targetBuilding.ownerId !== undefined &&
        targetBuilding.ownerId !== null &&
        isEnemyPlayer(targetBuilding.ownerId) &&
        !(targetBuilding.kind === "building" && isUntargetableDestroyedLandmarkClient(targetBuilding))
          ? targetBuilding
          : null);
      if (enemyTarget) {
        sendCommand(
          {
            type: "buildingAttackTarget",
            buildingIds: rallyBuildings.map((building) => building.id),
            targetId: enemyTarget.id,
          },
          { expectAck: false }
        );
        attackMoveArmed = false;
        return;
      }
      sendCommand({
        type: "rally",
        buildingIds: rallyBuildings.map((building) => building.id),
        target: { x: world.x, y: world.y },
      });
      attackMoveArmed = false;
    }
  }
});

canvas.addEventListener("mousemove", (event) => {
  lastMouseWorld = screenToWorld(event.clientX, event.clientY);
  if (!selectionBox) return;
  selectionBox.endX = event.clientX;
  selectionBox.endY = event.clientY;
  const dragDistance = Math.hypot(
    selectionBox.endX - selectionBox.startX,
    selectionBox.endY - selectionBox.startY
  );
  if (dragDistance > 4) {
    isDraggingSelection = true;
  }
});

canvas.addEventListener("mouseup", (event) => {
  if (event.button !== 0 || !selectionBox) return;
  const now = performance.now();
  const clickWorld = screenToWorld(event.clientX, event.clientY);
  const dragWidth = Math.abs(selectionBox.endX - selectionBox.startX);
  const dragHeight = Math.abs(selectionBox.endY - selectionBox.startY);
  const treatAsClick = !isDraggingSelection || (dragWidth < 8 && dragHeight < 8);

  if (treatAsClick) {
    const entity = findEntityAt(clickWorld.x, clickWorld.y);
    const resourceEntity = findResourceAt(clickWorld.x, clickWorld.y);
    const relicEntity = findRelicAt(clickWorld.x, clickWorld.y);
    if (entity && entity.kind === "unit") {
      const addToSelection = !!event.shiftKey && selectedUnits.length > 0;
      if (addToSelection) {
        if (!selectedUnits.some((unit) => unit.id === entity.id)) {
          selectedUnits = [...selectedUnits, entity];
        }
      } else {
        if (now - lastClickTime < 300 && lastClickUnitType === entity.type) {
          const viewX = camera.x / map.tileSize;
          const viewY = camera.y / map.tileSize;
          const viewW = canvas.width / map.tileSize;
          const viewH = canvas.height / map.tileSize;
          selectedUnits = units.filter(
            (unit) =>
              unit.ownerId === playerIndex &&
              unit.type === entity.type &&
              unit.x >= viewX &&
              unit.x <= viewX + viewW &&
              unit.y >= viewY &&
              unit.y <= viewY + viewH
          );
        } else {
          selectedUnits = [entity];
        }
      }
      selectedBuilding = null;
      selectedBuildings = [];
      selectedResource = null;
      selectedRelic = null;
      lastClickTime = now;
      lastClickUnitType = entity.type;
    } else if (entity && entity.kind === "building") {
      if (
        now - lastClickTime < 300 &&
        lastClickBuildingType === entity.type &&
        lastClickBuildingOwner === entity.ownerId
      ) {
        const viewX = camera.x / map.tileSize;
        const viewY = camera.y / map.tileSize;
        const viewW = canvas.width / map.tileSize;
        const viewH = canvas.height / map.tileSize;
        selectedBuildings = buildings.filter(
          (building) =>
            building.type === entity.type &&
            building.ownerId === entity.ownerId &&
            building.x + BUILDINGS[building.type].size >= viewX &&
            building.x <= viewX + viewW &&
            building.y + BUILDINGS[building.type].size >= viewY &&
            building.y <= viewY + viewH &&
            (playerIndex === null ||
              building.ownerId === playerIndex ||
              isVisible(
                building.x + BUILDINGS[building.type].size / 2,
                building.y + BUILDINGS[building.type].size / 2
              ))
        );
      } else {
        selectedBuildings = [entity];
      }
      selectedBuilding = selectedBuildings[0] || null;
      selectedUnits = [];
      selectedResource = null;
      selectedRelic = null;
      lastClickTime = now;
      lastClickBuildingType = entity.type;
      lastClickBuildingOwner = entity.ownerId;
    } else if (resourceEntity) {
      selectedResource = resourceEntity;
      selectedUnits = [];
      selectedBuilding = null;
      selectedBuildings = [];
      selectedRelic = null;
    } else if (relicEntity) {
      selectedRelic = relicEntity;
      selectedUnits = [];
      selectedBuilding = null;
      selectedBuildings = [];
      selectedResource = null;
    } else {
      selectedUnits = [];
      selectedBuilding = null;
      selectedBuildings = [];
      selectedResource = null;
      selectedRelic = null;
    }
    updateSelectionUI();
    selectionBox = null;
    isDraggingSelection = false;
    return;
  }

  const x1 = Math.min(selectionBox.startX, selectionBox.endX);
  const y1 = Math.min(selectionBox.startY, selectionBox.endY);
  const x2 = Math.max(selectionBox.startX, selectionBox.endX);
  const y2 = Math.max(selectionBox.startY, selectionBox.endY);
  const topLeft = screenToWorld(x1, y1);
  const bottomRight = screenToWorld(x2, y2);
  selectedUnits = units.filter(
    (unit) =>
      unit.ownerId === playerIndex &&
      unit.x >= topLeft.x &&
      unit.x <= bottomRight.x &&
      unit.y >= topLeft.y &&
      unit.y <= bottomRight.y
  );
  selectedBuilding = null;
  selectedBuildings = [];
  selectedResource = null;
  selectedRelic = null;
  updateSelectionUI();
  selectionBox = null;
  isDraggingSelection = false;
});

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (!isTypingFieldActive()) {
    const key = event.key.toLowerCase();
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const hotkeyIndex = UNIT_PRODUCTION_HOTKEYS.indexOf(key);
      if (hotkeyIndex !== -1) {
        event.preventDefault();
        if (queueUnitProductionByIndex(hotkeyIndex)) {
          return;
        }
      }
      if (key === CANCEL_QUEUE_HOTKEY) {
        event.preventDefault();
        if (cancelLatestQueueItemForSelection()) {
          return;
        }
      }
      if (key === REPAIR_COMMAND_HOTKEY) {
        event.preventDefault();
        if (armRepairMode()) {
          return;
        }
      }
    }
    const groupNumber = Number.parseInt(event.key, 10);
    if (Number.isInteger(groupNumber) && groupNumber >= 1 && groupNumber <= 9) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const ownedUnits = selectedUnits.filter(
          (unit) => unit.ownerId === playerIndex
        );
        if (ownedUnits.length) {
          controlGroups.set(
            groupNumber,
            ownedUnits.map((unit) => unit.id)
          );
          showBanner(`Control group ${groupNumber} set.`, "ok", 1200);
        }
      } else {
        const ids = controlGroups.get(groupNumber) || [];
        if (ids.length) {
          const unitById = new Map(units.map((u) => [u.id, u]));
          const selected = ids
            .map((id) => unitById.get(id))
            .filter((u) => u && u.ownerId === playerIndex);
          selectedUnits = selected;
          selectedBuilding = null;
          selectedBuildings = [];
          selectedResource = null;
          selectedRelic = null;
          updateSelectionUI();
          const now = performance.now();
          const last = controlGroupLastSelect.get(groupNumber) || 0;
          if (now - last < 450 && selected.length) {
            const avgX =
              selected.reduce((sum, unit) => sum + unit.x, 0) / selected.length;
            const avgY =
              selected.reduce((sum, unit) => sum + unit.y, 0) / selected.length;
            camera.x = avgX * map.tileSize - canvas.width / 2;
            camera.y = avgY * map.tileSize - canvas.height / 2;
            clampCamera();
          }
          controlGroupLastSelect.set(groupNumber, now);
          showBanner(`Control group ${groupNumber} selected.`, "info", 1000);
        }
      }
      return;
    }
  }
  if (event.key.toLowerCase() === "c") {
    if (selectedBuilding && selectedBuilding.isUnderConstruction) {
      sendCommand(
        { type: "cancelBuild", buildingId: selectedBuilding.id },
        { expectAck: false }
      );
      return;
    }
  }
  if (event.key.toLowerCase() === "f") {
    if (selectedUnits.length > 0) {
      attackMoveArmed = true;
    }
  }
  if (event.key === "Escape") {
    if (dropRelicArmed) {
      dropRelicArmed = false;
      return;
    }
    if (healArmed) {
      healArmed = false;
      return;
    }
    if (playerIndex !== null && overlay && overlay.classList.contains("hidden")) {
      setResignModal(true);
    }
  }
  if (event.code === "Space") {
    event.preventDefault();
    if (lastAttackLocation) {
      camera.x = lastAttackLocation.x * map.tileSize - canvas.width / 2;
      camera.y = lastAttackLocation.y * map.tileSize - canvas.height / 2;
      clampCamera();
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

document.querySelectorAll(".ui-layer").forEach((layer) => {
  layer.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
});

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("mousemove", (event) => {
  lastMouseScreen.x = event.clientX;
  lastMouseScreen.y = event.clientY;
});

function updateCamera() {
  const speed = 9;
  const edgeSize = 24;
  const edgeSpeed = 7;
  if (keys.has("w") || keys.has("arrowup")) camera.y -= speed;
  if (keys.has("s") || keys.has("arrowdown")) camera.y += speed;
  if (keys.has("a") || keys.has("arrowleft")) camera.x -= speed;
  if (keys.has("d") || keys.has("arrowright")) camera.x += speed;

  const hasSelection =
    selectedUnits.length > 0 || selectedBuildings.length > 0;
  if (!hasSelection) {
    if (lastMouseScreen.y <= edgeSize) camera.y -= edgeSpeed;
    if (lastMouseScreen.y >= window.innerHeight - edgeSize) camera.y += edgeSpeed;
    if (lastMouseScreen.x <= edgeSize) camera.x -= edgeSpeed;
    if (lastMouseScreen.x >= window.innerWidth - edgeSize) camera.x += edgeSpeed;
  }

  clampCamera();
}

function panCameraToMinimap(event) {
  const rect = minimap.getBoundingClientRect();
  const localX = clamp(event.clientX - rect.left, 0, rect.width);
  const localY = clamp(event.clientY - rect.top, 0, rect.height);
  const worldX = (localX / rect.width) * map.width;
  const worldY = (localY / rect.height) * map.height;
  camera.x = worldX * map.tileSize - canvas.width / 2;
  camera.y = worldY * map.tileSize - canvas.height / 2;
  clampCamera();
}

function minimapToWorld(event) {
  const rect = minimap.getBoundingClientRect();
  const localX = clamp(event.clientX - rect.left, 0, rect.width);
  const localY = clamp(event.clientY - rect.top, 0, rect.height);
  return {
    x: (localX / rect.width) * map.width,
    y: (localY / rect.height) * map.height,
  };
}

function didPlayerResourcesChange(prevResources, nextResources) {
  if (!prevResources || !nextResources) return false;
  const keys = ["food", "wood", "gold", "stone"];
  return keys.some((key) => {
    const prev = Number(prevResources[key] || 0);
    const next = Number(nextResources[key] || 0);
    return Math.abs(next - prev) > 0.0001;
  });
}

function getQueueSignature(building) {
  if (!building?.productionQueue?.length) return "";
  return building.productionQueue
    .map((entry) => entry.unitType || entry.techId || "")
    .join("|");
}

function didSelectedBuildingUiChange(prevBuildings, selectedBuildingList) {
  if (!selectedBuildingList?.length) return false;
  return selectedBuildingList.some((building) => {
    const prev = prevBuildings.get(building.id);
    if (!prev) return true;
    if (!!prev.isUnderConstruction !== !!building.isUnderConstruction) {
      return true;
    }
    if (!!prev.landmarkDestroyed !== !!building.landmarkDestroyed) {
      return true;
    }
    return getQueueSignature(prev) !== getQueueSignature(building);
  });
}

function didSelectedUnitUiChange(prevUnits, selectedUnitList) {
  if (!selectedUnitList?.length) return false;
  return selectedUnitList.some((unit) => {
    const prev = prevUnits.get(unit.id);
    if (!prev) return true;
    if ((prev.relicId || null) !== (unit.relicId || null)) return true;
    if (unit.type === "Monk") {
      const prevOrderType = prev.order?.type || prev.orderType || null;
      const nextOrderType = unit.order?.type || unit.orderType || null;
      if (prevOrderType !== nextOrderType) return true;
    }
    return false;
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampCamera() {
  const maxX = map.width * map.tileSize - canvas.width;
  const maxY = map.height * map.tileSize - canvas.height;
  const pad = cameraOverpan;
  camera.x = clamp(camera.x, -pad, maxX + pad);
  camera.y = clamp(camera.y, -pad, maxY + pad);
}

function updateRenderPositions() {
  const now = performance.now();
  for (const state of unitRenderState.values()) {
    const t = state.duration > 0 ? (now - state.startTime) / state.duration : 1;
    const clamped = Math.max(0, Math.min(1, t));
    state.renderX = state.fromX + (state.toX - state.fromX) * clamped;
    state.renderY = state.fromY + (state.toY - state.fromY) * clamped;
  }
}

minimap.addEventListener("mousedown", (event) => {
  if (event.button === 0) {
    if (attackMoveArmed && selectedUnits.length) {
      const ownedUnits = selectedUnits.filter((u) => u.ownerId === playerIndex);
      if (ownedUnits.length) {
        const target = minimapToWorld(event);
        sendCommand(
          {
            type: "attackMove",
            unitIds: ownedUnits.map((u) => u.id),
            target,
            queue: !!event.shiftKey,
          },
          { expectAck: false }
        );
      }
      attackMoveArmed = false;
      return;
    }
    minimapDragging = true;
    panCameraToMinimap(event);
    return;
  }

  if (event.button === 2) {
    if (attackMoveArmed) {
      attackMoveArmed = false;
      return;
    }
    if (!selectedUnits.length) return;
    const ownedUnits = selectedUnits.filter((u) => u.ownerId === playerIndex);
    if (!ownedUnits.length) return;
    const target = minimapToWorld(event);
    sendCommand(
      {
        type: "move",
        unitIds: ownedUnits.map((u) => u.id),
        target,
        queue: !!event.shiftKey,
      },
      { expectAck: false }
    );
  }
});

window.addEventListener("mousemove", (event) => {
  if (!minimapDragging) return;
  panCameraToMinimap(event);
});

window.addEventListener("mouseup", () => {
  minimapDragging = false;
  if (selectionBox) {
    selectionBox = null;
    isDraggingSelection = false;
  }
});

minimap.addEventListener("mouseleave", () => {
  minimapDragging = false;
});

function canAfford(resourcesObj, cost) {
  const normalizedCost = normalizeCost(cost);
  if (!normalizedCost) return true;
  return Object.entries(normalizedCost).every(
    ([key, value]) => (resourcesObj[key] || 0) >= value
  );
}

function formatCost(cost) {
  const normalizedCost = normalizeCost(cost);
  if (!normalizedCost) return "";
  return Object.entries(normalizedCost)
    .map(([key, value]) => `${value} ${key[0].toUpperCase()}${key.slice(1)}`)
    .join(", ");
}

function getTechRequirementText(techId) {
  if (!techId) return "Required technology not researched.";
  const tech = TECHNOLOGIES[techId];
  const techName = tech?.name || techId;
  const sourceBuilding = tech?.building
    ? BUILDINGS[tech.building]?.name || tech.building
    : "";
  if (sourceBuilding) {
    return `Requires ${techName}, available from ${sourceBuilding}`;
  }
  return `Requires ${techName}`;
}

function queueUnitProductionByIndex(index) {
  if (index < 0) return false;
  const sourceBuildings = selectedBuildings.length
    ? selectedBuildings
    : selectedBuilding
    ? [selectedBuilding]
    : [];
  const ownedBuildings = sourceBuildings.filter(
    (building) => building && building.ownerId === playerIndex
  );
  if (!ownedBuildings.length) return false;
  const actionableBuildings = ownedBuildings.filter(
    (building) => !building.isUnderConstruction && !isDestroyedLandmarkClient(building)
  );

  const player = players.find((p) => p.index === playerIndex);
  if (!player) {
    showBanner("Player data not ready.", "error");
    return true;
  }

  const getProduceList = (def) => (def?.produce ? def.produce.slice() : []);
  const baseDef = BUILDINGS[(actionableBuildings[0] || ownedBuildings[0]).type];
  const baseProduce = getProduceList(baseDef);
  const commonProduce = baseProduce.filter((unitType) =>
    actionableBuildings.every((b) =>
      getProduceList(BUILDINGS[b.type]).includes(unitType)
    )
  );
  if (!commonProduce.length || index >= commonProduce.length) return false;

  const unitType = commonProduce[index];
  if (!actionableBuildings.length) {
    showBanner("Finish the building first.", "error");
    return true;
  }

  const minTier = getUnitMinAgeForPlayer(unitType, player);
  if (typeof minTier === "number" && (player.ageTier ?? 0) < minTier) {
    const eraName = AGE_ORDER[minTier] || "Required Era";
    showBanner(`Requires ${eraName}.`, "error");
    return true;
  }
  const unitDef = UNITS[unitType];
  if (unitDef?.requiresTech && !player.techs?.[unitDef.requiresTech]) {
    showBanner(getTechRequirementText(unitDef.requiresTech), "error");
    return true;
  }
  const building =
    pickBestProductionBuildingForUnit(
      actionableBuildings,
      unitType,
      player,
      selectedBuilding
    ) || actionableBuildings[0];
  const unitCost = getUnitCostForPlayer(unitType, player, building);
  if (!canAfford(player.resources, unitCost)) {
    showBanner("Not enough resources.", "error");
    return true;
  }
  sendCommand(
    {
      type: "produce",
      buildingId: building.id,
      unitType,
    },
    { expectAck: false }
  );
  showBanner("Training queued.", "ok", 1500);
  return true;
}

function cancelLatestQueueItemForSelection() {
  const sourceBuildings = selectedBuildings.length
    ? selectedBuildings
    : selectedBuilding
    ? [selectedBuilding]
    : [];
  const ownedBuildings = sourceBuildings.filter(
    (building) => building && building.ownerId === playerIndex
  );
  if (!ownedBuildings.length) return false;
  const actionableBuildings = ownedBuildings.filter(
    (building) => !building.isUnderConstruction && !isDestroyedLandmarkClient(building)
  );
  if (!actionableBuildings.length) {
    showBanner("Finish the building first.", "error");
    return true;
  }
  const queuedBuildings = actionableBuildings.filter(
    (building) =>
      Array.isArray(building.productionQueue) && building.productionQueue.length > 0
  );
  if (!queuedBuildings.length) {
    showBanner("Queue is empty.", "info", 1200);
    return true;
  }
  const preferredBuilding =
    queuedBuildings.find((building) => building.id === selectedBuilding?.id) ||
    queuedBuildings[0];
  const index = preferredBuilding.productionQueue.length - 1;
  sendCommand(
    {
      type: "cancelQueue",
      buildingId: preferredBuilding.id,
      index,
    },
    {
      expectAck: true,
      onError: (response) => {
        const reason = response?.reason || "cancel_failed";
        if (reason === "invalid_building") {
          showBanner("Building no longer available.", "error", 1800);
          return;
        }
        if (reason === "invalid_index") {
          showBanner("Queue item no longer available.", "error", 1800);
          return;
        }
        showBanner("Unable to cancel queue item.", "error", 1800);
      },
      onOk: () => {
        showBanner("Latest queue item removed.", "ok", 1200);
      },
    }
  );
  return true;
}

function renderProductionButtons(buildingList) {
  const buildingsToUse = (buildingList || []).filter(Boolean);
  if (!buildingsToUse.length) {
    productionButtons.innerHTML = "";
    return;
  }
  const ownedBuildings = buildingsToUse.filter(
    (b) => b.ownerId === playerIndex
  );
  if (!ownedBuildings.length) {
    productionButtons.innerHTML = "";
    return;
  }
  const actionableBuildings = ownedBuildings.filter(
    (b) => !b.isUnderConstruction && !isDestroyedLandmarkClient(b)
  );
  const hasReadyBuildings = actionableBuildings.length > 0;
  const player = players.find((p) => p.index === playerIndex);
  const getProduceList = (def) => (def?.produce ? def.produce.slice() : []);
  const getResearchList = (def) => (def?.research ? def.research.slice() : []);
  const baseDef = BUILDINGS[(actionableBuildings[0] || ownedBuildings[0]).type];
  const baseProduce = getProduceList(baseDef);
  const commonProduce =
    actionableBuildings.length > 0
      ? baseProduce.filter((unitType) =>
          actionableBuildings.every((b) =>
            getProduceList(BUILDINGS[b.type]).includes(unitType)
          )
        )
      : [];
  const baseResearch = getResearchList(baseDef);
  const commonResearch =
    actionableBuildings.length > 0
      ? baseResearch.filter((techId) =>
          actionableBuildings.every((b) =>
            getResearchList(BUILDINGS[b.type]).includes(techId)
          )
        )
      : [];

  if (!commonProduce.length && !commonResearch.length) {
    if (
      actionableBuildings.length === 1 &&
      actionableBuildings[0].type === "GoldenFountainSquare"
    ) {
      const building = actionableBuildings[0];
      const row = document.createElement("div");
      row.className = "prod-row";
      ["food", "wood", "gold"].forEach((kind) => {
        const button = document.createElement("button");
        button.className = "prod-btn";
        const label = kind[0].toUpperCase() + kind.slice(1);
        const active = (building.convertResourceKind || "food") === kind;
        button.textContent = active ? `${label} (Selected)` : label;
        button.disabled = active;
        button.addEventListener("click", () => {
          sendCommand(
            { type: "setFountainMode", buildingId: building.id, kind },
            { expectAck: false }
          );
        });
        row.appendChild(button);
      });
      productionButtons.innerHTML = "";
      productionButtons.appendChild(row);
      return;
    }
    productionButtons.innerHTML = "";
    return;
  }
  let techById = new Map();
  let nextById = new Map();
  let childIds = new Set();
  const isResearched = (techId) => {
    const tech = techById.get(techId);
    if (!tech) return false;
    if (
      tech.upgradeUnit &&
      typeof tech.upgradeTier === "number" &&
      getUnitUpgradeTierForPlayer(tech.upgradeUnit, player) >= tech.upgradeTier
    ) {
      return true;
    }
    if (tech.scope === "building") {
      return actionableBuildings.every((b) => b.techs && b.techs[techId]);
    }
    return player && player.techs && player.techs[techId];
  };
  const getDisplayTechIdForRoot = (rootId) => {
    let currentId = rootId;
    while (isResearched(currentId) && nextById.has(currentId)) {
      currentId = nextById.get(currentId);
    }
    return currentId;
  };
  const appendTechButton = (displayTechId, container = productionButtons) => {
    const displayTech = techById.get(displayTechId);
    if (!displayTech) return;
    const displayTechCost = getTechCostForPlayer(displayTechId, player);
    const buildingScope = displayTech.scope === "building";
    const displayResearched = isResearched(displayTechId);
    const displayResearching = actionableBuildings.some((b) =>
      (b.productionQueue || []).some((job) => job.techId === displayTechId)
    );
    if (typeof displayTech.ageTier === "number") {
      const currentTier = player?.ageTier ?? 0;
      if (displayTech.ageTier !== currentTier + 1) {
        return;
      }
    }
    const button = document.createElement("button");
    button.className = "prod-btn tech-btn";
    button.textContent = displayResearching
      ? `${displayTech.name} (Researching)`
      : `${displayTech.name}`;
    const ageBlocked =
      typeof displayTech.minAgeTier === "number" &&
      (player?.ageTier ?? 0) < displayTech.minAgeTier;
    const prereqBlocked =
      displayTech.requiresTech &&
      !(player?.techs?.[displayTech.requiresTech]);
    button.disabled =
      !player || displayResearching || displayResearched || ageBlocked || prereqBlocked;
    if (
      displayTech.upgradeUnit &&
      typeof displayTech.upgradeTier === "number" &&
      getUnitUpgradeTierForPlayer(displayTech.upgradeUnit, player) >=
        displayTech.upgradeTier
    ) {
      return;
    }

    if (typeof displayTech.minAgeTier === "number") {
      const currentTier = player?.ageTier ?? 0;
      const minTier = displayTech.minAgeTier;
      if (currentTier < minTier) {
        const eraName = AGE_ORDER[minTier] || "Required Era";
        const requirement = `<br /><span class="tooltip-requirement">Requires ${eraName}</span>`;
        button.dataset.requirement = requirement;
      }
    }
    if (
      displayTech.requiresTech &&
      !(player?.techs?.[displayTech.requiresTech])
    ) {
      const prereqName =
        TECHNOLOGIES[displayTech.requiresTech]?.name || displayTech.requiresTech;
      const requirement = `<br /><span class="tooltip-requirement">Requires ${prereqName}</span>`;
      button.dataset.requirement = (button.dataset.requirement || "") + requirement;
    }

    button.addEventListener("click", () => {
      if (!player) {
        showBanner("Player data not ready.", "error");
        return;
      }
      if (buildingScope && actionableBuildings.length > 1) {
        showBanner("Select a single building to research.", "info", 1500);
        return;
      }
      if (
        typeof displayTech.minAgeTier === "number" &&
        (player.ageTier ?? 0) < displayTech.minAgeTier
      ) {
        const eraName = AGE_ORDER[displayTech.minAgeTier] || "Required Era";
        showBanner(`Requires ${eraName}.`, "error");
        return;
      }
      if (displayResearching) {
        showBanner("Already researching.", "info", 1500);
        return;
      }
      if (displayResearched) {
        showBanner("Already researched.", "info", 1500);
        return;
      }
      if (!canAfford(player.resources, displayTechCost)) {
        showBanner("Not enough resources.", "error");
        return;
      }
      const building = actionableBuildings[0];
      sendCommand(
        {
          type: "research",
          buildingId: building.id,
          techId: displayTechId,
        },
        {
          onError: (response) => {
            const reason = response.reason || "unknown";
            const minTier = displayTech?.minAgeTier;
            const eraName =
              typeof minTier === "number"
                ? AGE_ORDER[minTier] || "Required Era"
                : "Required Era";
            const friendly = {
              invalid_building: "Cannot research there.",
              cannot_research_here: "This building cannot research that.",
              building_incomplete: "Finish the building first.",
              building_destroyed:
                "This destroyed landmark is inactive until fully repaired.",
              already_researched: "Already researched.",
              already_researching: "Already researching.",
              age_order: "Advance to the next age in order.",
              age_required: `Requires ${eraName}.`,
              tech_prereq: "Requires previous technology.",
              unknown_tech: "Technology is not recognized by the server. Restart the server.",
              insufficient_resources: "Not enough resources.",
            }[reason] || "Unable to research.";
            showBanner(friendly, "error");
          },
        }
      );
    });

    button.addEventListener("mouseenter", () => {
      if (!buildTooltip) return;
      const requirement = button.dataset.requirement || "";
      const description = getTechnologyDescriptionForUI(displayTechId, player);
      const cost = formatCost(displayTechCost) || "Free";
      const time = displayTech.researchTime ? `${displayTech.researchTime}s` : "Instant";
      buildTooltip.innerHTML = `
        <strong>${displayTech.name}</strong><br />
        ${description}<br />
        Cost: ${cost} | Research: ${time}${requirement}
      `;
      buildTooltip.classList.add("visible");
    });
    button.addEventListener("mousemove", (event) => {
      if (!buildTooltip) return;
      const offset = 12;
      const rawX = event.clientX + offset;
      const rawY = event.clientY + offset;
      const tooltipRect = buildTooltip.getBoundingClientRect();
      const maxX = window.innerWidth - tooltipRect.width - 8;
      const maxY = window.innerHeight - tooltipRect.height - 8;
      const x = Math.max(8, Math.min(rawX, maxX));
      const y = Math.max(8, Math.min(rawY, maxY));
      buildTooltip.style.left = `${x}px`;
      buildTooltip.style.top = `${y}px`;
    });
    button.addEventListener("mouseleave", () => {
      if (!buildTooltip) return;
      buildTooltip.classList.remove("visible");
      buildTooltip.textContent = "";
    });
    container.appendChild(button);
  };

  if (commonResearch.length) {
    techById = new Map(
      commonResearch.map((techId) => [techId, TECHNOLOGIES[techId]]).filter(([, tech]) => tech)
    );
    nextById = new Map();
    childIds = new Set();
    techById.forEach((tech, techId) => {
      if (tech.requiresTech && techById.has(tech.requiresTech)) {
        nextById.set(tech.requiresTech, techId);
        childIds.add(techId);
      }
    });
  }

  const upgradeByUnit = new Map();
  if (commonResearch.length) {
    commonResearch.forEach((techId) => {
      if (childIds.has(techId)) return;
      if (!techById.has(techId)) return;
      const displayId = getDisplayTechIdForRoot(techId);
      const displayTech = techById.get(displayId);
      if (!displayTech || !displayTech.upgradeUnit) return;
      upgradeByUnit.set(displayTech.upgradeUnit, displayId);
    });
  }
  productionButtons.innerHTML = "";
  const unitRow = document.createElement("div");
  unitRow.className = "prod-row";
  const upgradeRow = document.createElement("div");
  upgradeRow.className = "prod-row upgrade-row";
  const techRow = document.createElement("div");
  techRow.className = "prod-row tech-row";
  commonProduce.forEach((unitType, produceIndex) => {
    const unitDef = UNITS[unitType];
    const displayName = getUnitDisplayName(unitType, player);
    const slot = document.createElement("div");
    slot.className = "prod-slot";
    const button = document.createElement("button");
    button.className = "prod-btn";
    const hotkey = UNIT_PRODUCTION_HOTKEYS[produceIndex];
    button.textContent = hotkey
      ? `${displayName} (${hotkey.toUpperCase()})`
      : displayName;
    let disabledByAge = false;
    const minTier = getUnitMinAgeForPlayer(unitType, player);
    if (typeof minTier === "number" && (player?.ageTier ?? 0) < minTier) {
      disabledByAge = true;
      const eraName = AGE_ORDER[minTier] || "Required Era";
      button.title = `Requires ${eraName}`;
    }
    const techLocked =
      !!(unitDef.requiresTech && !player?.techs?.[unitDef.requiresTech]);
    button.disabled = !player || disabledByAge || techLocked || !hasReadyBuildings;
    button.addEventListener("click", () => {
      showBanner(`Clicked: Train ${displayName}`, "info", 1500);
      if (!player) {
        showBanner("Player data not ready.", "error");
        return;
      }
      if (!hasReadyBuildings) {
        showBanner("Finish the building first.", "error");
        return;
      }
      if (typeof minTier === "number" && (player?.ageTier ?? 0) < minTier) {
        const eraName = AGE_ORDER[minTier] || "Required Era";
        showBanner(`Requires ${eraName}.`, "error");
        return;
      }
      if (unitDef.requiresTech && !player.techs?.[unitDef.requiresTech]) {
        showBanner(getTechRequirementText(unitDef.requiresTech), "error");
        return;
      }
      showBanner("Training request sent...", "info", 2000);
      const building =
        pickBestProductionBuildingForUnit(
          actionableBuildings,
          unitType,
          player,
          selectedBuilding
        ) || actionableBuildings[0];
      const unitCost = getUnitCostForPlayer(unitType, player, building);
      if (!canAfford(player.resources, unitCost)) {
        showBanner("Not enough resources.", "error");
        return;
      }
      sendCommand(
        {
          type: "produce",
          buildingId: building.id,
          unitType,
        },
        { expectAck: false }
      );
      showBanner("Training queued.", "ok", 1500);
    });
    button.addEventListener("mouseenter", () => {
      if (!buildTooltip) return;
      const description = UNIT_DESCRIPTIONS[unitType] || "Unit.";
      const costBuilding = actionableBuildings[0] || ownedBuildings[0] || null;
      const unitCost = getUnitCostForPlayer(unitType, player, costBuilding);
      const cost = formatCost(unitCost) || "Free";
      const unitTypeLabel = unitDef.type || "Unit";
      const popCost = getUnitPopulationCost(unitType);
      const popLine = popCost > 1 ? `<br />Population: ${popCost}` : "";
      let requirement = "";
      if (!hasReadyBuildings) {
        requirement = `<br /><span class="tooltip-requirement">Finish the building first</span>`;
      }
      if (typeof minTier === "number" && (player?.ageTier ?? 0) < minTier) {
        const eraName = AGE_ORDER[minTier] || "Required Era";
        requirement += `<br /><span class="tooltip-requirement">Requires ${eraName}</span>`;
      }
      if (unitDef.requiresTech && !player?.techs?.[unitDef.requiresTech]) {
        requirement += `<br /><span class="tooltip-requirement">${getTechRequirementText(
          unitDef.requiresTech
        )}</span>`;
      }
      buildTooltip.innerHTML = `
        <strong>${displayName}</strong><br />
        ${unitTypeLabel}<br />
        ${description}<br />
        Cost: ${cost}${popLine}${requirement}
      `;
      buildTooltip.classList.add("visible");
    });
    button.addEventListener("mousemove", (event) => {
      if (!buildTooltip) return;
      const offset = 12;
      const rawX = event.clientX + offset;
      const rawY = event.clientY + offset;
      const tooltipRect = buildTooltip.getBoundingClientRect();
      const maxX = window.innerWidth - tooltipRect.width - 8;
      const maxY = window.innerHeight - tooltipRect.height - 8;
      const x = Math.max(8, Math.min(rawX, maxX));
      const y = Math.max(8, Math.min(rawY, maxY));
      buildTooltip.style.left = `${x}px`;
      buildTooltip.style.top = `${y}px`;
    });
    button.addEventListener("mouseleave", () => {
      if (!buildTooltip) return;
      buildTooltip.classList.remove("visible");
      buildTooltip.textContent = "";
    });
    slot.appendChild(button);
    unitRow.appendChild(slot);

    const upgradeSlot = document.createElement("div");
    upgradeSlot.className = "prod-slot";
    const upgradeTechId = upgradeByUnit.get(unitType);
    if (upgradeTechId) {
      appendTechButton(upgradeTechId, upgradeSlot);
    } else {
      const spacer = document.createElement("div");
      spacer.className = "prod-spacer";
      upgradeSlot.appendChild(spacer);
    }
    upgradeRow.appendChild(upgradeSlot);
  });

  if (commonResearch.length) {
    commonResearch.forEach((techId) => {
      if (childIds.has(techId)) {
        return;
      }
      if (!techById.has(techId)) return;
      const displayId = getDisplayTechIdForRoot(techId);
      const displayTech = techById.get(displayId);
      if (!displayTech || displayTech.upgradeUnit) return;
      appendTechButton(displayId, techRow);
    });
  }

  if (commonProduce.length) {
    productionButtons.appendChild(unitRow);
    productionButtons.appendChild(upgradeRow);
  }
  if (techRow.children.length) {
    productionButtons.appendChild(techRow);
  }
  if (commonProduce.length) {
    requestAnimationFrame(() => {
      const unitSlots = unitRow.querySelectorAll(".prod-slot");
      const upgradeSlots = upgradeRow.querySelectorAll(".prod-slot");
      unitSlots.forEach((slot, index) => {
      const button = slot.querySelector(".prod-btn");
      if (!button) return;
      const unitWidth = Math.ceil(button.getBoundingClientRect().width);
      const upgradeButton = upgradeSlots[index]?.querySelector(".prod-btn");
      const upgradeWidth = upgradeButton
        ? Math.ceil(upgradeButton.getBoundingClientRect().width)
        : 0;
      const targetWidth = Math.max(unitWidth, upgradeWidth);
      slot.style.width = `${targetWidth}px`;
      if (!upgradeSlots[index]) return;
      upgradeSlots[index].style.width = `${targetWidth}px`;
      const spacer = upgradeSlots[index].querySelector(".prod-spacer");
      if (spacer) {
        spacer.style.width = `${targetWidth}px`;
      }
    });
  });
  }
}

/**
 * Festival Bedrock Server add-on.
 * Rewrites the PocketMine Festival plugin into Bedrock scripting.
 */

let world;
let system;

const MAGIC_ITEM_ID = "minecraft:stick";
const DEFAULT_AREA_FLAGS = {
    edit: true,
    touch: false,
    flight: false,
    hurt: false,
    fall: false,
    explode: true,
    tnt: true,
    fire: false,
    shoot: false,
    pvp: false,
    effect: false,
    hunger: false,
    drop: false,
    mobs: false,
    animals: false,
    cmd: false,
    pass: false,
    msg: false,
    perms: false
};
const VALID_FLAGS = Object.keys(DEFAULT_AREA_FLAGS);

class FestivalArea {
    constructor(data) {
        this.name = data.name || "";
        this.desc = data.desc || "";
        this.priority = data.priority || 0;
        this.flags = data.flags || JSON.parse(JSON.stringify(DEFAULT_AREA_FLAGS));
        this.type = data.type || "cube";
        this.pos1 = data.pos1 || { x: 0, y: 0, z: 0 };
        this.pos2 = data.pos2 || { x: 0, y: 0, z: 0 };
        this.radius = data.radius || 0;
        this.top = data.top || 0;
        this.bottom = data.bottom || 0;
        this.dimension = data.dimension || "overworld";
        this.whitelist = data.whitelist || [];
        this.commands = data.commands || {};
        this.events = data.events || { enter: [], leave: [], center: [] };
    }

    contains(position, dimension) {
        if (!position) return false;
        if (dimension && this.dimension && dimension.toLowerCase() !== this.dimension.toLowerCase()) {
            return false;
        }
        if (this.type === "sphere" && this.radius > 0) {
            const dx = position.x - this.pos1.x;
            const dy = position.y - this.pos1.y;
            const dz = position.z - this.pos1.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz) <= this.radius;
        }
        const minX = Math.min(this.pos1.x, this.pos2.x);
        const maxX = Math.max(this.pos1.x, this.pos2.x);
        const minY = Math.min(this.pos1.y, this.pos2.y) - this.bottom;
        const maxY = Math.max(this.pos1.y, this.pos2.y) + this.top;
        const minZ = Math.min(this.pos1.z, this.pos2.z);
        const maxZ = Math.max(this.pos1.z, this.pos2.z);
        return position.x >= minX && position.x <= maxX &&
            position.y >= minY && position.y <= maxY &&
            position.z >= minZ && position.z <= maxZ;
    }

    centerContains(position, dimension) {
        if (!position) return false;
        if (dimension && this.dimension && dimension.toLowerCase() !== this.dimension.toLowerCase()) {
            return false;
        }
        if (this.type === "sphere") {
            const dx = position.x - this.pos1.x;
            const dy = position.y - this.pos1.y;
            const dz = position.z - this.pos1.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz) <= 2;
        }
        const centerX = (this.pos1.x + this.pos2.x) / 2;
        const centerZ = (this.pos1.z + this.pos2.z) / 2;
        return position.x >= centerX - 1 && position.x <= centerX + 1 &&
            position.z >= centerZ - 1 && position.z <= centerZ + 1 &&
            position.y >= Math.min(this.pos1.y, this.pos2.y) - this.bottom &&
            position.y <= Math.max(this.pos1.y, this.pos2.y) + this.top;
    }
}

const FestivalState = {
    areas: [],
    playerSelections: {},
    playerSelectionModes: {},
    playerMembership: {},
    areaMessagesEnabled: true
};

async function initialize() {
    try {
        await loadScriptingApi();
    } catch (error) {
        console.error("Festival add-on failed to initialize:", error);
        return;
    }

    system.beforeEvents.chatSend.subscribe((eventData) => {
        onChat(eventData);
    });

    system.runInterval(() => {
        onTick();
    }, 3);

    system.beforeEvents.itemUseOn.subscribe((eventData) => {
        onBlockPlace(eventData);
    });

    system.beforeEvents.playerBreakBlock.subscribe((eventData) => {
        onBlockDestroy(eventData);
    });

    system.beforeEvents.entityHurt.subscribe((eventData) => {
        onEntityHurt(eventData);
    });

    console.warn("Festival add-on initialized.");
}

async function loadScriptingApi() {
    try {
        const mod = await import("@minecraft/server");
        world = mod.world;
        system = mod.system;
        console.warn("Festival add-on using @minecraft/server API.");
        return;
    } catch (err) {
        console.warn("@minecraft/server unavailable:", err.message || err);
    }

    try {
        const mod = await import("mojang-minecraft");
        world = mod.world || mod.worlds?.getOverworld?.();
        system = mod.system || mod;
        console.warn("Festival add-on using mojang-minecraft API.");
        return;
    } catch (err) {
        console.warn("mojang-minecraft unavailable:", err.message || err);
    }

    throw new Error("No supported Bedrock scripting API found. Ensure the server supports script modules and that the pack is loaded as a script behavior pack.");
}

function onChat(eventData) {
    const message = eventData.message;
    const player = eventData.sender;
    const playerName = player.name;
    
    if (!message.startsWith("/")) return;

    const trimmed = message.trim();
    if (!trimmed.startsWith("/festival") && !trimmed.startsWith("/fe")) {
        return;
    }

    eventData.cancel = true;
    const parts = trimmed.replace(/^\//, "").split(/\s+/);
    parts.shift();
    handleCommand(playerName, parts, player);
}

function handleCommand(playerName, args, player) {
    if (!Array.isArray(args) || args.length === 0) {
        sendHelp(playerName, player);
        return;
    }

    const sub = args[0].toLowerCase();

    switch (sub) {
        case "help":
        case "menu":
            sendHelp(playerName, player);
            break;
        case "create":
            createAreaCommand(playerName, args.slice(1), player);
            break;
        case "delete":
        case "del":
            deleteArea(playerName, args[1], player);
            break;
        case "list":
            listAreas(playerName, player);
            break;
        case "info":
            sendAreaInfo(playerName, args[1], player);
            break;
        case "pos1":
            savePlayerPosition(playerName, "pos1", player);
            break;
        case "pos2":
            savePlayerPosition(playerName, "pos2", player);
            break;
        case "flag":
            areaFlagCommand(playerName, args.slice(1), player);
            break;
        case "whitelist":
            whitelistCommand(playerName, args.slice(1), player);
            break;
        case "tp":
            teleportToArea(playerName, args[1], player);
            break;
        default:
            sendHelp(playerName, player);
    }
}

function sendHelp(playerName, player) {
    const helpLines = [
        "§aFestival Bedrock Add-on commands:",
        "/festival help - show this menu",
        "/festival create <name> - create a cube area from pos1/pos2",
        "/festival delete <name> - remove an area",
        "/festival list - show all festival areas",
        "/festival info <name> - area details",
        "/festival pos1 - save your current position as first corner",
        "/festival pos2 - save your current position as second corner",
        "/festival flag <name> <flag> <on|off> - toggle area protection flags",
        "/festival whitelist <add|remove> <name> <player> - manage area whitelist",
        "/festival tp <name> - teleport to area center"
    ];
    helpLines.forEach(line => sendPlayerMessage(playerName, line, player));
}

function createAreaCommand(playerName, args, player) {
    const name = args[0];
    if (!name) {
        sendPlayerMessage(playerName, "Usage: /festival create <name>", player);
        return;
    }
    
    const lowerName = name.toLowerCase();
    if (FestivalState.areas.find(a => a.name.toLowerCase() === lowerName)) {
        sendPlayerMessage(playerName, `Area ${name} already exists.`, player);
        return;
    }

    const selection = FestivalState.playerSelections[playerName.toLowerCase()];
    if (!selection || !selection.pos1 || !selection.pos2) {
        sendPlayerMessage(playerName, "You must save both pos1 and pos2 before creating an area.", player);
        return;
    }

    const dimension = player.dimension.id;
    const areaData = {
        name: name,
        desc: "",
        priority: 0,
        flags: JSON.parse(JSON.stringify(DEFAULT_AREA_FLAGS)),
        type: "cube",
        pos1: selection.pos1,
        pos2: selection.pos2,
        radius: 0,
        top: 0,
        bottom: 0,
        dimension: dimension,
        whitelist: [playerName.toLowerCase()],
        commands: {},
        events: { enter: [], leave: [], center: [] }
    };
    
    FestivalState.areas.push(new FestivalArea(areaData));
    sendPlayerMessage(playerName, `Area ${name} created.`, player);
}

function deleteArea(playerName, name, player) {
    if (!name) {
        sendPlayerMessage(playerName, "Usage: /festival delete <name>", player);
        return;
    }
    
    const lowerName = name.toLowerCase();
    const index = FestivalState.areas.findIndex(a => a.name.toLowerCase() === lowerName);
    if (index === -1) {
        sendPlayerMessage(playerName, `Area ${name} not found.`, player);
        return;
    }

    FestivalState.areas.splice(index, 1);
    sendPlayerMessage(playerName, `Area ${name} deleted.`, player);
}

function listAreas(playerName, player) {
    if (FestivalState.areas.length === 0) {
        sendPlayerMessage(playerName, "No Festival areas are defined.", player);
        return;
    }
    sendPlayerMessage(playerName, `§bFestival areas (${FestivalState.areas.length}):`, player);
    FestivalState.areas.forEach(area => {
        sendPlayerMessage(playerName, `  - ${area.name} (${area.type})`, player);
    });
}

function sendAreaInfo(playerName, name, player) {
    if (!name) {
        sendPlayerMessage(playerName, "Usage: /festival info <name>", player);
        return;
    }
    
    const area = FestivalState.areas.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (!area) {
        sendPlayerMessage(playerName, `Area ${name} not found.`, player);
        return;
    }

    sendPlayerMessage(playerName, `§6Area ${area.name}:`, player);
    sendPlayerMessage(playerName, `  Type: ${area.type}`, player);
    sendPlayerMessage(playerName, `  Dimension: ${area.dimension}`, player);
    const enabledFlags = Object.entries(area.flags)
        .filter(([_, v]) => v)
        .map(([f]) => f)
        .join(", ");
    sendPlayerMessage(playerName, `  Flags: ${enabledFlags || "none"}`, player);
    sendPlayerMessage(playerName, `  Whitelist: ${area.whitelist.join(", ") || "none"}`, player);
}

function savePlayerPosition(playerName, key, player) {
    const pos = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
    };

    const normalized = playerName.toLowerCase();
    if (!FestivalState.playerSelections[normalized]) {
        FestivalState.playerSelections[normalized] = {};
    }

    FestivalState.playerSelections[normalized][key] = pos;
    sendPlayerMessage(playerName, `${key.toUpperCase()} set to (${pos.x}, ${pos.y}, ${pos.z}).`, player);
}

function areaFlagCommand(playerName, args, player) {
    const [areaName, flagName, value] = args;
    if (!areaName || !flagName || !value) {
        sendPlayerMessage(playerName, "Usage: /festival flag <area> <flag> <on|off>", player);
        return;
    }

    const area = FestivalState.areas.find(a => a.name.toLowerCase() === areaName.toLowerCase());
    if (!area) {
        sendPlayerMessage(playerName, `Area ${areaName} not found.`, player);
        return;
    }

    if (!VALID_FLAGS.includes(flagName.toLowerCase())) {
        sendPlayerMessage(playerName, `Unknown flag ${flagName}.`, player);
        return;
    }

    area.flags[flagName.toLowerCase()] = value.toLowerCase() === "on";
    sendPlayerMessage(playerName, `Flag ${flagName} for ${area.name} set to ${value.toLowerCase()}.`, player);
}

function whitelistCommand(playerName, args, player) {
    const [action, areaName, targetPlayer] = args;
    if (!action || !areaName || !targetPlayer) {
        sendPlayerMessage(playerName, "Usage: /festival whitelist <add|remove> <area> <player>", player);
        return;
    }

    const area = FestivalState.areas.find(a => a.name.toLowerCase() === areaName.toLowerCase());
    if (!area) {
        sendPlayerMessage(playerName, `Area ${areaName} not found.`, player);
        return;
    }

    const lowerTarget = targetPlayer.toLowerCase();
    if (action.toLowerCase() === "add") {
        if (!area.whitelist.includes(lowerTarget)) {
            area.whitelist.push(lowerTarget);
        }
        sendPlayerMessage(playerName, `${targetPlayer} added to whitelist.`, player);
    } else if (action.toLowerCase() === "remove") {
        area.whitelist = area.whitelist.filter(e => e !== lowerTarget);
        sendPlayerMessage(playerName, `${targetPlayer} removed from whitelist.`, player);
    }
}

function teleportToArea(playerName, name, player) {
    if (!name) {
        sendPlayerMessage(playerName, "Usage: /festival tp <area>", player);
        return;
    }

    const area = FestivalState.areas.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (!area) {
        sendPlayerMessage(playerName, `Area ${name} not found.`, player);
        return;
    }

    const targetPos = area.type === "sphere" ? area.pos1 : {
        x: Math.floor((area.pos1.x + area.pos2.x) / 2),
        y: Math.floor((area.pos1.y + area.pos2.y) / 2),
        z: Math.floor((area.pos1.z + area.pos2.z) / 2)
    };

    try {
        player.teleport({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, { dimension: player.dimension });
        sendPlayerMessage(playerName, `Teleported to ${area.name}.`, player);
    } catch (error) {
        sendPlayerMessage(playerName, `Teleport failed: ${error.message}`, player);
    }
}

function onTick() {
    const players = world.getAllPlayers();
    players.forEach(player => {
        const playerName = player.name;
        const normalized = playerName.toLowerCase();
        const position = {
            x: Math.floor(player.location.x),
            y: Math.floor(player.location.y),
            z: Math.floor(player.location.z),
            dimension: player.dimension.id
        };

        const membership = FestivalState.playerMembership[normalized] || { areas: [] };
        const currentAreas = [];

        FestivalState.areas.forEach(area => {
            if (area.dimension === position.dimension && area.contains(position, position.dimension)) {
                currentAreas.push(area.name);
                if (!membership.areas.includes(area.name)) {
                    if (FestivalState.areaMessagesEnabled && !area.flags.msg) {
                        sendPlayerMessage(playerName, `§bEntering area: ${area.name}`, player);
                    }
                }
            }
        });

        membership.areas = currentAreas;
        FestivalState.playerMembership[normalized] = membership;
    });
}

function onBlockPlace(eventData) {
    const player = eventData.player;
    const playerName = player.name;
    const dimension = player.dimension.id;
    const blockPos = {
        x: Math.floor(eventData.block.location.x),
        y: Math.floor(eventData.block.location.y),
        z: Math.floor(eventData.block.location.z),
        dimension: dimension
    };

    for (const area of FestivalState.areas) {
        if (!area.flags.edit || area.dimension !== dimension) continue;
        if (area.contains(blockPos, dimension)) {
            if (!area.whitelist.includes(playerName.toLowerCase())) {
                eventData.cancel = true;
                sendPlayerMessage(playerName, `§cYou may not place blocks in ${area.name}.`, player);
                return;
            }
        }
    }
}

function onBlockDestroy(eventData) {
    const player = eventData.player;
    const playerName = player.name;
    const dimension = player.dimension.id;
    const blockPos = {
        x: Math.floor(eventData.block.location.x),
        y: Math.floor(eventData.block.location.y),
        z: Math.floor(eventData.block.location.z),
        dimension: dimension
    };

    for (const area of FestivalState.areas) {
        if (!area.flags.edit || area.dimension !== dimension) continue;
        if (area.contains(blockPos, dimension)) {
            if (!area.whitelist.includes(playerName.toLowerCase())) {
                eventData.cancel = true;
                sendPlayerMessage(playerName, `§cYou may not break blocks in ${area.name}.`, player);
                return;
            }
        }
    }
}

function onEntityHurt(eventData) {
    const entity = eventData.hurtEntity;
    if (!entity.isValid() || entity.typeId !== "minecraft:player") return;

    const player = entity;
    const playerName = player.name;
    const dimension = player.dimension.id;
    const position = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z),
        dimension: dimension
    };

    for (const area of FestivalState.areas) {
        if (!area.contains(position, dimension)) continue;
        if (area.flags.hurt) {
            eventData.cancel = true;
            return;
        }
        if (area.flags.pvp && eventData.damageSource && eventData.damageSource.damagingEntity) {
            const attacker = eventData.damageSource.damagingEntity;
            if (attacker && attacker.typeId === "minecraft:player") {
                eventData.cancel = true;
                return;
            }
        }
    }
}

function sendPlayerMessage(playerName, message, player) {
    if (!player || !message) return;
    try {
        player.sendMessage(message);
    } catch (error) {
        console.warn(`Failed to send message to ${playerName}: ${error.message}`);
    }
}

// Start the system
initialize();

system.handleCommand = function (playerName, args, player) {
    if (!Array.isArray(args) || args.length === 0) {
        this.sendHelp(playerName, player);
        return;
    }

    const sub = args[0].toLowerCase();

    switch (sub) {
        case "help":
        case "menu":
            this.sendHelp(playerName, player);
            break;
        case "select":
            this.startSelection(playerName, args.slice(1), player);
            break;
        case "pos1":
        case "pos2":
            this.savePositionSelection(playerName, sub, player);
            break;
        case "create":
            this.createArea(playerName, args.slice(1), player);
            break;
        case "create-sphere":
        case "createsphere":
        case "rad":
        case "radius":
            this.createSphereArea(playerName, args.slice(1), player);
            break;
        case "create-diameter":
        case "creatediameter":
        case "dia":
        case "diameter":
            this.createDiameterArea(playerName, args.slice(1), player);
            break;
        case "delete":
        case "del":
            this.deleteArea(playerName, args[1], player);
            break;
        case "list":
            this.listAreas(playerName, player);
            break;
        case "here":
            this.showCurrentAreas(playerName, player);
            break;
        case "info":
            this.sendAreaInfo(playerName, args[1], player);
            break;
        case "rename":
            this.renameArea(playerName, args.slice(1), player);
            break;
        case "desc":
            this.describeArea(playerName, args.slice(1), player);
            break;
        case "priority":
            this.setAreaPriority(playerName, args.slice(1), player);
            break;
        case "scale":
            this.setAreaScale(playerName, args.slice(1), player);
            break;
        case "titles":
            this.toggleTitles(playerName, args[1], player);
            break;
        case "flag":
            this.areaFlagCommand(playerName, args.slice(1), player);
            break;
        case "whitelist":
            this.whitelistCommand(playerName, args.slice(1), player);
            break;
        case "tp":
            this.teleportToArea(playerName, args[1], player);
            break;
        case "command":
            this.areaCommandManager(playerName, args.slice(1), player);
            break;
        case "compass":
            this.sendPlayerMessage(playerName, "Compass support is not implemented in this Bedrock add-on.", player);
            break;
        default:
            this.sendHelp(playerName, player);
    }
};

system.sendHelp = function (playerName) {
    const helpLines = [
        "§aFestival Bedrock Add-on commands:",
        "/festival help - show this menu",
        "/festival select pos1|pos2|radius|diameter - start magic-item selection",
        "/festival pos1 - save your current position as first corner",
        "/festival pos2 - save your current position as second corner",
        "/festival create <name> - create a cube area from pos1/pos2",
        "/festival create-sphere <name> <radius> - create a sphere area around you",
        "/festival create-diameter <name> <diameter> - create a sphere from diameter selection",
        "/festival delete <name> - remove an area",
        "/festival list - show all festival areas",
        "/festival here - show areas you are currently inside",
        "/festival info <name> - area details",
        "/festival rename <name> <newname> - rename an area",
        "/festival desc <name> <text> - set area description",
        "/festival priority <name> <number> - set area priority",
        "/festival scale <name> <top|bottom> <value> - set vertical scaling",
        "/festival titles <on|off> - toggle area enter/leave notifications",
        "/festival flag <name> <flag> <on|off> - toggle area protection flags",
        "/festival whitelist <add|remove> <name> <player> - manage area whitelist",
        "/festival command <area> list - list area commands",
        "/festival command <area> add <enter|leave|center> <id> <cmd> - add area event commands",
        "/festival command <area> edit <id> <cmd> - edit existing area command",
        "/festival command <area> del <id> - delete area command",
        "/festival command <area> event <id> <enter|leave|center> - move command to event",
    ];
    helpLines.forEach(line => this.sendPlayerMessage(playerName, line));
};

system.savePositionSelection = function (playerName, key) {
    const entity = this.findPlayerEntityByName(playerName);
    const position = this.getPlayerPosition(entity);
    if (!position) {
        this.sendPlayerMessage(playerName, "Unable to read your position.");
        return;
    }
    if (!this.playerSelections[playerName.toLowerCase()]) {
        this.playerSelections[playerName.toLowerCase()] = {};
    }
    this.playerSelections[playerName.toLowerCase()][key] = position;
    this.sendPlayerMessage(playerName, `${key.toUpperCase()} set to (${position.x}, ${position.y}, ${position.z}).`);
};

system.createArea = function (playerName, args) {
    const name = args[0];
    if (!name) {
        this.sendPlayerMessage(playerName, "Usage: /festival create <name>");
        return;
    }
    const lowerName = name.toLowerCase();
    if (this.findAreaByName(lowerName)) {
        this.sendPlayerMessage(playerName, `Area ${name} already exists.`);
        return;
    }
    const selection = this.playerSelections[playerName.toLowerCase()];
    if (!selection || !selection.pos1 || !selection.pos2) {
        this.sendPlayerMessage(playerName, "You must save both pos1 and pos2 before creating an area.");
        return;
    }
    const entity = this.findPlayerEntityByName(playerName);
    const dimension = this.getPlayerDimension(entity);
    const areaData = {
        name: name,
        desc: "",
        priority: 0,
        flags: JSON.parse(JSON.stringify(DEFAULT_AREA_FLAGS)),
        type: "cube",
        pos1: selection.pos1,
        pos2: selection.pos2,
        radius: 0,
        top: 0,
        bottom: 0,
        dimension: dimension,
        whitelist: [playerName.toLowerCase()],
        commands: {},
        events: { enter: [], leave: [], center: [] }
    };
    this.areas.push(new FestivalArea(areaData));
    this.saveState();
    this.sendPlayerMessage(playerName, `Area ${name} created.`);
};

system.createSphereArea = function (playerName, args) {
    const name = args[0];
    const radius = parseInt(args[1], 10);
    if (!name || isNaN(radius) || radius <= 0) {
        this.sendPlayerMessage(playerName, "Usage: /festival create-sphere <name> <radius>");
        return;
    }
    const lowerName = name.toLowerCase();
    if (this.findAreaByName(lowerName)) {
        this.sendPlayerMessage(playerName, `Area ${name} already exists.`);
        return;
    }
    const entity = this.findPlayerEntityByName(playerName);
    const position = this.getPlayerPosition(entity);
    if (!position) {
        this.sendPlayerMessage(playerName, "Unable to read your position.");
        return;
    }
    const dimension = this.getPlayerDimension(entity);
    const areaData = {
        name: name,
        desc: "",
        priority: 0,
        flags: JSON.parse(JSON.stringify(DEFAULT_AREA_FLAGS)),
        type: "sphere",
        pos1: position,
        pos2: position,
        radius: radius,
        top: 0,
        bottom: 0,
        dimension: dimension,
        whitelist: [playerName.toLowerCase()],
        commands: {},
        events: { enter: [], leave: [], center: [] }
    };
    this.areas.push(new FestivalArea(areaData));
    this.saveState();
    this.sendPlayerMessage(playerName, `Sphere area ${name} created with radius ${radius}.`);
};

system.deleteArea = function (playerName, name) {
    if (!name) {
        this.sendPlayerMessage(playerName, "Usage: /festival delete <name>");
        return;
    }
    const lowerName = name.toLowerCase();
    const index = this.areas.findIndex(area => area.name.toLowerCase() === lowerName);
    if (index === -1) {
        this.sendPlayerMessage(playerName, `Area ${name} not found.`);
        return;
    }
    this.areas.splice(index, 1);
    this.saveState();
    this.sendPlayerMessage(playerName, `Area ${name} deleted.`);
};

system.listAreas = function (playerName) {
    if (this.areas.length === 0) {
        this.sendPlayerMessage(playerName, "No Festival areas are defined.");
        return;
    }
    this.sendPlayerMessage(playerName, `Festival areas (${this.areas.length}):`);
    this.areas.forEach(area => {
        this.sendPlayerMessage(playerName, `- ${area.name} (${area.type})`);
    });
};

system.sendAreaInfo = function (playerName, name) {
    if (!name) {
        this.sendPlayerMessage(playerName, "Usage: /festival info <name>");
        return;
    }
    const area = this.findAreaByName(name.toLowerCase());
    if (!area) {
        this.sendPlayerMessage(playerName, `Area ${name} not found.`);
        return;
    }
    this.sendPlayerMessage(playerName, `Area ${area.name}: type=${area.type}, dimension=${area.dimension}`);
    this.sendPlayerMessage(playerName, `Flags: ${Object.entries(area.flags).filter(([_,v]) => v).map(([f]) => f).join(", ") || "none"}`);
    this.sendPlayerMessage(playerName, `Whitelist: ${area.whitelist.join(", ") || "none"}`);
    this.sendPlayerMessage(playerName, `Commands: ${Object.keys(area.commands).join(", ") || "none"}`);
};

system.startSelection = function (playerName, args) {
    const mode = (args[0] || "").toLowerCase();
    const validModes = ["pos1", "pos2", "radius", "diameter"];
    if (!validModes.includes(mode)) {
        this.sendPlayerMessage(playerName, "Usage: /festival select <pos1|pos2|radius|diameter>");
        return;
    }
    const normalized = playerName.toLowerCase();
    this.playerSelectionModes[normalized] = { mode };
    this.sendPlayerMessage(playerName, `Selection mode ${mode} enabled. Use your magic item (${MAGIC_ITEM_ID}) on a block to set it.`);
};

system.createDiameterArea = function (playerName, args) {
    const name = args[0];
    if (!name) {
        this.sendPlayerMessage(playerName, "Usage: /festival create-diameter <name>");
        return;
    }
    const lowerName = name.toLowerCase();
    if (this.findAreaByName(lowerName)) {
        this.sendPlayerMessage(playerName, `Area ${name} already exists.`);
        return;
    }
    const selection = this.playerSelections[playerName.toLowerCase()];
    if (!selection || !selection.pos1 || typeof selection.radius !== "number" || selection.radius <= 0) {
        this.sendPlayerMessage(playerName, "You must select pos1 and diameter first using /festival select diameter.");
        return;
    }
    const entity = this.findPlayerEntityByName(playerName);
    const dimension = this.getPlayerDimension(entity);
    const areaData = {
        name: name,
        desc: "",
        priority: 0,
        flags: JSON.parse(JSON.stringify(DEFAULT_AREA_FLAGS)),
        type: "sphere",
        pos1: selection.pos1,
        pos2: selection.pos1,
        radius: selection.radius,
        top: 0,
        bottom: 0,
        dimension: dimension,
        whitelist: [playerName.toLowerCase()],
        commands: {},
        events: { enter: [], leave: [], center: [] }
    };
    this.areas.push(new FestivalArea(areaData));
    this.saveState();
    this.sendPlayerMessage(playerName, `Diameter area ${name} created with radius ${selection.radius}.`);
};

system.showCurrentAreas = function (playerName) {
    const entity = this.findPlayerEntityByName(playerName);
    const position = this.getPlayerPosition(entity);
    if (!position) {
        this.sendPlayerMessage(playerName, "Unable to determine your position.");
        return;
    }
    const areas = this.areas.filter(area => area.contains(position, position.dimension));
    if (areas.length === 0) {
        this.sendPlayerMessage(playerName, "You are not inside any Festival areas.");
        return;
    }
    this.sendPlayerMessage(playerName, `You are inside ${areas.length} area(s):`);
    areas.forEach(area => {
        this.sendPlayerMessage(playerName, `- ${area.name}`);
    });
};

system.renameArea = function (playerName, args) {
    const [oldName, ...rest] = args;
    const newName = rest.join(" ");
    if (!oldName || !newName) {
        this.sendPlayerMessage(playerName, "Usage: /festival rename <oldname> <newname>");
        return;
    }
    const area = this.findAreaByName(oldName.toLowerCase());
    if (!area) {
        this.sendPlayerMessage(playerName, `Area ${oldName} not found.`);
        return;
    }
    if (this.findAreaByName(newName.toLowerCase())) {
        this.sendPlayerMessage(playerName, `Area ${newName} already exists.`);
        return;
    }
    area.name = newName;
    this.saveState();
    this.sendPlayerMessage(playerName, `Area ${oldName} renamed to ${newName}.`);
};

system.describeArea = function (playerName, args) {
    const [areaName, ...descParts] = args;
    const description = descParts.join(" ");
    if (!areaName || !description) {
        this.sendPlayerMessage(playerName, "Usage: /festival desc <name> <description>");
        return;
    }
    const area = this.findAreaByName(areaName.toLowerCase());
    if (!area) {
        this.sendPlayerMessage(playerName, `Area ${areaName} not found.`);
        return;
    }
    area.desc = description;
    this.saveState();
    this.sendPlayerMessage(playerName, `Description for ${area.name} updated.`);
};

system.setAreaPriority = function (playerName, args) {
    const [areaName, priorityValue] = args;
    const priority = parseInt(priorityValue, 10);
    if (!areaName || isNaN(priority)) {
        this.sendPlayerMessage(playerName, "Usage: /festival priority <name> <number>");
        return;
    }
    const area = this.findAreaByName(areaName.toLowerCase());
    if (!area) {
        this.sendPlayerMessage(playerName, `Area ${areaName} not found.`);
        return;
    }
    area.priority = priority;
    this.saveState();
    this.sendPlayerMessage(playerName, `Priority for ${area.name} set to ${priority}.`);
};

system.setAreaScale = function (playerName, args) {
    const [areaName, scaleType, valueString] = args;
    const value = parseInt(valueString, 10);
    if (!areaName || !scaleType || isNaN(value)) {
        this.sendPlayerMessage(playerName, "Usage: /festival scale <name> <top|bottom> <value>");
        return;
    }
    const area = this.findAreaByName(areaName.toLowerCase());
    if (!area) {
        this.sendPlayerMessage(playerName, `Area ${areaName} not found.`);
        return;
    }
    if (scaleType.toLowerCase() === "top") {
        area.top = value;
    } else if (scaleType.toLowerCase() === "bottom") {
        area.bottom = value;
    } else {
        this.sendPlayerMessage(playerName, "Scale type must be top or bottom.");
        return;
    }
    this.saveState();
    this.sendPlayerMessage(playerName, `${scaleType} scale for ${area.name} set to ${value}.`);
};

system.toggleTitles = function (playerName, value) {
    if (!value || !["on", "off"].includes(value.toLowerCase())) {
        this.sendPlayerMessage(playerName, "Usage: /festival titles <on|off>");
        return;
    }
    this.areaMessagesEnabled = value.toLowerCase() === "on";
    this.sendPlayerMessage(playerName, `Festival area messages are now ${this.areaMessagesEnabled ? "enabled" : "disabled"}.`);
};

system.handleSelectionAttempt = function (playerName, eventData) {
    const normalized = playerName.toLowerCase();
    const selectionMode = this.playerSelectionModes[normalized];
    if (!selectionMode) {
        return false;
    }
    const itemId = this.getEventItemId(eventData) || this.getPlayerHeldItem(this.findPlayerEntityByName(playerName));
    if (!itemId || itemId.toLowerCase() !== MAGIC_ITEM_ID.toLowerCase()) {
        return false;
    }
    const position = this.getEventPosition(eventData);
    if (!position) {
        return false;
    }
    if (!this.playerSelections[normalized]) {
        this.playerSelections[normalized] = {};
    }
    const mode = selectionMode.mode;
    if (mode === "pos1") {
        this.playerSelections[normalized].pos1 = position;
        this.sendPlayerMessage(playerName, `Position 1 set to (${position.x}, ${position.y}, ${position.z}).`);
    } else if (mode === "pos2") {
        this.playerSelections[normalized].pos2 = position;
        this.sendPlayerMessage(playerName, `Position 2 set to (${position.x}, ${position.y}, ${position.z}).`);
    } else if (mode === "radius") {
        const pos1 = this.playerSelections[normalized].pos1;
        if (!pos1) {
            this.sendPlayerMessage(playerName, "Set pos1 first before selecting a radius.");
            return true;
        }
        const dx = position.x - pos1.x;
        const dy = position.y - pos1.y;
        const dz = position.z - pos1.z;
        const radius = Math.ceil(Math.sqrt(dx * dx + dy * dy + dz * dz));
        this.playerSelections[normalized].radius = radius;
        this.sendPlayerMessage(playerName, `Radius selected: ${radius}. Use /festival create-sphere <name> to create the area.`);
    } else if (mode === "diameter") {
        const pos1 = this.playerSelections[normalized].pos1;
        if (!pos1) {
            this.sendPlayerMessage(playerName, "Set pos1 first before selecting a diameter.");
            return true;
        }
        const dx = position.x - pos1.x;
        const dy = position.y - pos1.y;
        const dz = position.z - pos1.z;
        const diameter = Math.ceil(Math.sqrt(dx * dx + dy * dy + dz * dz));
        const center = {
            x: Math.floor((position.x + pos1.x) / 2),
            y: Math.floor((position.y + pos1.y) / 2),
            z: Math.floor((position.z + pos1.z) / 2)
        };
        this.playerSelections[normalized].pos1 = center;
        this.playerSelections[normalized].radius = Math.ceil(diameter / 2);
        this.sendPlayerMessage(playerName, `Diameter selected: ${diameter}. Area center set at (${center.x}, ${center.y}, ${center.z}). Use /festival create-diameter <name> to create the area.`);
    }
    delete this.playerSelectionModes[normalized];
    this.cancelEvent(eventData);
    return true;
};

system.getEventItemId = function (eventData) {
    if (!eventData) {
        return null;
    }
    if (eventData.item_stack) {
        return eventData.item_stack.item || eventData.item_stack.id || null;
    }
    if (eventData.item) {
        return eventData.item;
    }
    if (eventData.itemStack) {
        return eventData.itemStack.id || eventData.itemStack.item || null;
    }
    return null;
};

system.getPlayerHeldItem = function (player) {
    if (!player) {
        return null;
    }
    const hand = this.getComponent(player, "minecraft:hand_container");
    if (hand && hand.item) {
        return hand.item.id || hand.item;
    }
    return null;
};

system.areaFlagCommand = function (playerName, args) {
    const [areaName, flagName, value] = args;
    if (!areaName || !flagName || !value) {
        this.sendPlayerMessage(playerName, "Usage: /festival flag <area> <flag> <on|off>");
        return;
    }
    const area = this.findAreaByName(areaName.toLowerCase());
    if (!area) {
        this.sendPlayerMessage(playerName, `Area ${areaName} not found.`);
        return;
    }
    if (!VALID_FLAGS.includes(flagName.toLowerCase())) {
        this.sendPlayerMessage(playerName, `Unknown flag ${flagName}. Valid flags: ${VALID_FLAGS.join(", ")}`);
        return;
    }
    area.flags[flagName.toLowerCase()] = value.toLowerCase() === "on";
    this.saveState();
    this.sendPlayerMessage(playerName, `Flag ${flagName} for ${area.name} set to ${value.toLowerCase()}.`);
};

system.whitelistCommand = function (playerName, args) {
    const [action, areaName, targetPlayer] = args;
    if (!action || !areaName || !targetPlayer) {
        this.sendPlayerMessage(playerName, "Usage: /festival whitelist <add|remove> <area> <player>");
        return;
    }
    const area = this.findAreaByName(areaName.toLowerCase());
    if (!area) {
        this.sendPlayerMessage(playerName, `Area ${areaName} not found.`);
        return;
    }
    const lowerTarget = targetPlayer.toLowerCase();
    if (action.toLowerCase() === "add") {
        if (!area.whitelist.includes(lowerTarget)) {
            area.whitelist.push(lowerTarget);
            this.saveState();
        }
        this.sendPlayerMessage(playerName, `${targetPlayer} added to ${area.name} whitelist.`);
        return;
    }
    if (action.toLowerCase() === "remove") {
        area.whitelist = area.whitelist.filter(entry => entry !== lowerTarget);
        this.saveState();
        this.sendPlayerMessage(playerName, `${targetPlayer} removed from ${area.name} whitelist.`);
        return;
    }
    this.sendPlayerMessage(playerName, "Usage: /festival whitelist <add|remove> <area> <player>");
};

system.teleportToArea = function (playerName, name) {
    if (!name) {
        this.sendPlayerMessage(playerName, "Usage: /festival tp <area>");
        return;
    }
    const area = this.findAreaByName(name.toLowerCase());
    if (!area) {
        this.sendPlayerMessage(playerName, `Area ${name} not found.`);
        return;
    }
    const entity = this.findPlayerEntityByName(playerName);
    if (!entity) {
        this.sendPlayerMessage(playerName, "Unable to find your player entity.");
        return;
    }
    const targetPosition = area.type === "sphere" ? area.pos1 : {
        x: Math.floor((area.pos1.x + area.pos2.x) / 2),
        y: Math.floor((area.pos1.y + area.pos2.y) / 2),
        z: Math.floor((area.pos1.z + area.pos2.z) / 2)
    };
    this.executeBedrockCommand(`tp "${playerName}" ${targetPosition.x} ${targetPosition.y} ${targetPosition.z}`);
    this.sendPlayerMessage(playerName, `Teleported to ${area.name}.`);
};

system.areaCommandManager = function (playerName, args) {
    const [areaName, action] = args;
    if (!areaName || !action) {
        this.sendPlayerMessage(playerName, "Usage: /festival command <area> <add|edit|del|list|event> ...");
        return;
    }
    const area = this.findAreaByName(areaName.toLowerCase());
    if (!area) {
        this.sendPlayerMessage(playerName, `Area ${areaName} not found.`);
        return;
    }
    if (action.toLowerCase() === "list") {
        this.sendPlayerMessage(playerName, `Commands for ${area.name}:`);
        Object.entries(area.commands).forEach(([id, command]) => {
            this.sendPlayerMessage(playerName, `- ${id}: ${command}`);
        });
        return;
    }
    if (action.toLowerCase() === "add") {
        const eventName = args[2];
        const id = args[3];
        const command = args.slice(4).join(" ");
        if (!eventName || !id || !command) {
            this.sendPlayerMessage(playerName, "Usage: /festival command <area> add <enter|leave|center> <id> <command>");
            return;
        }
        if (!area.events[eventName]) {
            this.sendPlayerMessage(playerName, `Unknown event ${eventName}. Use enter, leave, or center.`);
            return;
        }
        area.commands[id] = command;
        if (!area.events[eventName].includes(id)) {
            area.events[eventName].push(id);
        }
        area.flags.cmd = true;
        this.saveState();
        this.sendPlayerMessage(playerName, `Command ${id} added to ${area.name} for ${eventName}.`);
        return;
    }
    if (action.toLowerCase() === "edit") {
        const id = args[2];
        const command = args.slice(3).join(" ");
        if (!id || !command || !area.commands[id]) {
            this.sendPlayerMessage(playerName, "Usage: /festival command <area> edit <id> <command>");
            return;
        }
        area.commands[id] = command;
        this.saveState();
        this.sendPlayerMessage(playerName, `Command ${id} updated for ${area.name}.`);
        return;
    }
    if (action.toLowerCase() === "event") {
        const id = args[2];
        const eventName = args[3];
        if (!id || !eventName || !area.commands[id] || !area.events[eventName]) {
            this.sendPlayerMessage(playerName, "Usage: /festival command <area> event <id> <enter|leave|center>");
            return;
        }
        Object.values(area.events).forEach(list => {
            const index = list.indexOf(id);
            if (index !== -1) {
                list.splice(index, 1);
            }
        });
        area.events[eventName].push(id);
        this.saveState();
        this.sendPlayerMessage(playerName, `Command ${id} moved to ${eventName} for ${area.name}.`);
        return;
    }
    if (action.toLowerCase() === "del") {
        const id = args[2];
        if (!id || !area.commands[id]) {
            this.sendPlayerMessage(playerName, "Usage: /festival command <area> del <id>");
            return;
        }
        delete area.commands[id];
        Object.values(area.events).forEach(list => {
            const index = list.indexOf(id);
            if (index !== -1) {
                list.splice(index, 1);
            }
        });
        this.saveState();
        this.sendPlayerMessage(playerName, `Command ${id} removed from ${area.name}.`);
        return;
    }
    this.sendPlayerMessage(playerName, "Usage: /festival command <area> <add|edit|del|list|event> ...");
};

system.onTick = function () {
    const players = this.getEntitiesFromQuery(this.playerQuery);
    if (!players || players.length === 0) {
        return;
    }
    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const playerName = this.getPlayerName(player);
        if (!playerName) {
            continue;
        }
        const normalized = playerName.toLowerCase();
        const position = this.getPlayerPosition(player);
        if (!position) {
            continue;
        }
        const membership = this.playerMembership[normalized] || { areas: [], centers: {} };
        const currentAreas = [];
        for (const area of this.areas) {
            if (area.contains(position, position.dimension)) {
                currentAreas.push(area.name);
                if (!membership.areas.includes(area.name)) {
                    this.enterArea(area, playerName);
                }
                if (area.centerContains(position, position.dimension)) {
                    if (!membership.centers[area.name]) {
                        membership.centers[area.name] = true;
                        this.enterAreaCenter(area, playerName);
                    }
                } else {
                    if (membership.centers[area.name]) {
                        delete membership.centers[area.name];
                        this.leaveAreaCenter(area, playerName);
                    }
                }
            }
        }
        membership.areas.forEach(name => {
            if (!currentAreas.includes(name)) {
                const area = this.findAreaByName(name.toLowerCase());
                if (area) {
                    this.leaveArea(area, playerName);
                }
            }
        });
        membership.areas = currentAreas;
        this.playerMembership[normalized] = membership;
    }
};

system.enterArea = function (area, playerName) {
    if (!area.flags.msg) {
        this.sendPlayerMessage(playerName, `Entering area ${area.name}.`);
    }
    this.runAreaEvent(area, playerName, "enter");
};

system.leaveArea = function (area, playerName) {
    if (!area.flags.msg) {
        this.sendPlayerMessage(playerName, `Leaving area ${area.name}.`);
    }
    this.runAreaEvent(area, playerName, "leave");
};

system.enterAreaCenter = function (area, playerName) {
    this.sendPlayerMessage(playerName, `Reached the center of ${area.name}.`);
    this.runAreaEvent(area, playerName, "center");
};

system.leaveAreaCenter = function (area, playerName) {
    this.sendPlayerMessage(playerName, `Left the center of ${area.name}.`);
};

system.runAreaEvent = function (area, playerName, eventType) {
    if (!area.flags.cmd || !area.events || !area.events[eventType]) {
        return;
    }
    for (const id of area.events[eventType]) {
        const commandText = area.commands[id];
        if (!commandText) {
            continue;
        }
        const resolved = commandText.replace(/{player}/gi, playerName);
        this.executeBedrockCommand(resolved);
    }
};

system.onBlockChange = function (eventData, type) {
    const playerEntity = eventData && (eventData.player || eventData.entity || eventData.sender);
    const playerName = this.getPlayerName(playerEntity);
    const position = this.getEventPosition(eventData);
    if (!playerName || !position) {
        return;
    }
    for (const area of this.areas) {
        if (!area.flags.edit) {
            continue;
        }
        if (area.contains(position, position.dimension)) {
            if (this.canBypass(playerName, area)) {
                return;
            }
            this.cancelEvent(eventData);
            this.sendPlayerMessage(playerName, `You may not ${type} blocks inside ${area.name}.`);
            return;
        }
    }
};

system.onEntityHurt = function (eventData) {
    if (!eventData || !eventData.entity) {
        return;
    }
    const hurtEntity = eventData.entity;
    const hurtPlayerName = this.getPlayerName(hurtEntity);
    if (!hurtPlayerName) {
        return;
    }
    const position = this.getPlayerPosition(hurtEntity);
    if (!position) {
        return;
    }
    for (const area of this.areas) {
        if (!area.contains(position, position.dimension)) {
            continue;
        }
        if (area.flags.hurt) {
            this.cancelEvent(eventData);
            return;
        }
        if (area.flags.pvp && eventData.damageSource && eventData.damageSource.damagingEntity) {
            const attackerName = this.getPlayerName(eventData.damageSource.damagingEntity);
            if (attackerName) {
                this.cancelEvent(eventData);
                return;
            }
        }
    }
};

system.findAreaByName = function (lowerName) {
    return this.areas.find(area => area.name.toLowerCase() === lowerName) || null;
};

system.findPlayerEntityByName = function (playerName) {
    const players = this.getEntitiesFromQuery(this.playerQuery);
    if (!players) {
        return null;
    }
    const normalized = playerName.toLowerCase();
    for (let i = 0; i < players.length; i++) {
        const entity = players[i];
        const name = this.getPlayerName(entity);
        if (name && name.toLowerCase() === normalized) {
            return entity;
        }
    }
    return null;
};

system.getPlayerName = function (entity) {
    if (!entity) {
        return null;
    }
    const nameable = this.getComponent(entity, "minecraft:nameable");
    if (nameable) {
        return nameable.name || nameable.display_name || nameable.nameTag || null;
    }
    return null;
};

system.getPlayerPosition = function (entity) {
    if (!entity) {
        return null;
    }
    const position = this.getComponent(entity, "minecraft:position");
    if (!position) {
        return null;
    }
    return {
        x: Math.floor(position.x),
        y: Math.floor(position.y),
        z: Math.floor(position.z),
        dimension: position.dimension || position.level || "default"
    };
};

system.getPlayerDimension = function (entity) {
    const position = this.getPlayerPosition(entity);
    return position ? position.dimension : "default";
};

system.getEventPosition = function (eventData) {
    if (!eventData) {
        return null;
    }
    const position = eventData.block_position || eventData.position || eventData.location || (eventData.tile && eventData.tile.pos);
    if (!position) {
        return null;
    }
    return {
        x: Math.floor(position.x),
        y: Math.floor(position.y),
        z: Math.floor(position.z),
        dimension: position.dimension || position.level || "default"
    };
};

system.canBypass = function (playerName, area) {
    return area.whitelist.includes(playerName.toLowerCase());
};

system.cancelEvent = function (eventData) {
    eventData.canceled = true;
    eventData.cancelEvent = true;
    eventData.cancel = true;
};

system.executeBedrockCommand = function (command) {
    if (!command) {
        return;
    }
    this.executeCommand(command, res => { });
};

system.sendPlayerMessage = function (playerName, message) {
    if (!playerName || !message) {
        return;
    }
    const escaped = message.replace(/\\/g, "\\\\").replace(/\"/g, '\\\"');
    this.executeBedrockCommand(`tellraw "${playerName}" {\"rawtext\":[{\"text\":\"${escaped}\"}]}`);
};

system.readData = function (path) {
    if (typeof this.readFile === "function") {
        return this.readFile(path);
    }
    if (typeof this.system === "object" && typeof this.system.readFile === "function") {
        return this.system.readFile(path);
    }
    return null;
};

system.writeData = function (path, contents) {
    if (typeof this.writeFile === "function") {
        return this.writeFile(path, contents);
    }
    if (typeof this.system === "object" && typeof this.system.writeFile === "function") {
        return this.system.writeFile(path, contents);
    }
    return false;
};

system.loadState = function () {
    const raw = this.readData(AREA_STORAGE_FILE);
    if (!raw) {
        return;
    }
    try {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.areas)) {
            this.areas = saved.areas.map(data => new FestivalArea(data));
        }
    } catch (error) {
        this.log(`Failed to load Festival state: ${error}`);
    }
};

system.saveState = function () {
    try {
        const data = JSON.stringify({ areas: this.areas }, null, 2);
        this.writeData(AREA_STORAGE_FILE, data);
    } catch (error) {
        this.log(`Failed to save Festival state: ${error}`);
    }
};

export const MAX_MERCHANTS = 8;
export const MIN_MERCHANTS_TO_START = 3;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createRoom(rooms, hostId, name) {
  const room = {
    code: createUnusedCode(rooms),
    hostId,
    phase: "LOBBY",
    round: 0,
    totalRounds: 5,
    phaseEndsAt: null,
    merchants: new Map(),
    spectators: new Map(),
  };

  room.merchants.set(hostId, { id: hostId, name, connected: true, socketId: null });
  rooms.set(room.code, room);
  return room;
}

export function addBotMerchants(room, count = 3) {
  const botNames = ["Mara the Fox", "Orrin Vale", "Tamsin Reed", "Bram Alder", "Nell Quill", "Sable Hart"];
  for (let index = 0; index < count && room.merchants.size < MAX_MERCHANTS; index += 1) {
    const id = `bot-${room.code}-${index + 1}`;
    room.merchants.set(id, {
      id,
      name: botNames[index],
      isBot: true,
      connected: true,
      socketId: null,
    });
  }
}

export function joinRoom(rooms, code, merchantId, name) {
  const room = rooms.get(code);

  if (!room) return { error: "That guildhall code was not found." };
  if (hasName(room, name)) return { error: "That merchant name is already taken in this guildhall." };
  if (room.phase !== "LOBBY") {
    room.spectators.set(merchantId, { id: merchantId, name, connected: true, socketId: null });
    return { room, role: "spectator" };
  }
  if (room.merchants.size >= MAX_MERCHANTS) return { error: "The guildhall is full." };

  room.merchants.set(merchantId, { id: merchantId, name, connected: true, socketId: null });
  return { room, role: "merchant" };
}

export function reconnectMerchant(rooms, code, merchantId) {
  const room = rooms.get(code);
  const merchant = room?.merchants.get(merchantId) ?? room?.spectators.get(merchantId);
  if (!merchant) return { error: "Your saved seat is no longer available." };

  merchant.connected = true;
  return { room, role: room.merchants.has(merchantId) ? "merchant" : "spectator" };
}

export function disconnectMerchant(room, merchantId) {
  const merchant = room.merchants.get(merchantId);
  if (merchant) {
    merchant.connected = false;
    merchant.socketId = null;
  }
  const spectator = room.spectators.get(merchantId);
  if (spectator) {
    spectator.connected = false;
    spectator.socketId = null;
  }
  if (room.hostId === merchantId) {
    const successor = [...room.merchants.values()].find((candidate) => candidate.id !== merchantId && candidate.connected)
      ?? [...room.merchants.values()].find((candidate) => candidate.id !== merchantId);
    if (successor) room.hostId = successor.id;
  }
}

export function promoteSpectators(room) {
  for (const [id, spectator] of room.spectators) {
    if (room.merchants.size >= MAX_MERCHANTS) break;
    room.spectators.delete(id);
    room.merchants.set(id, { ...spectator });
  }
}

export function setRoundCount(room, totalRounds) {
  if (totalRounds !== 3 && totalRounds !== 5) return { error: "Choose either 3 or 5 rounds." };
  room.totalRounds = totalRounds;
  return { room };
}

export function publicRoomState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    totalRounds: room.totalRounds,
    phaseEndsAt: room.phaseEndsAt,
    merchantCount: room.merchants.size,
    spectatorCount: room.spectators.size,
    merchants: [...room.merchants.values()].map(({ id, name, connected, isBot = false }) => ({ id, name, connected, isBot })),
    prices: room.prices,
    marketTurns: room.phase === "MARKET_TURNS" || room.phase === "LEDGER" || room.phase === "FINAL"
      ? room.marketTurns
      : null,
    // Truth and impact stats are revealed only after the market turns.
    rumors: room.phase === "MARKET_TURNS" || room.phase === "LEDGER" || room.phase === "FINAL"
      ? (room.scoredRumors ?? [])
      : (room.rumors ?? []).map(({ id, merchantId, authorName, good, direction, postedAt }) =>
          ({ id, merchantId, authorName, good, direction, postedAt })),
    finalStandings: room.phase === "FINAL" ? room.finalStandings : null,
  };
}

function hasName(room, name) {
  return [...room.merchants.values(), ...room.spectators.values()]
    .some((person) => person.name.toLowerCase() === name.toLowerCase());
}

function createUnusedCode(rooms) {
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
  } while (rooms.has(code));
  return code;
}

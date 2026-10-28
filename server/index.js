import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import {
  createRoom,
  addBotMerchants,
  joinRoom,
  reconnectMerchant,
  disconnectMerchant,
  promoteSpectators,
  setRoundCount,
  MIN_MERCHANTS_TO_START,
  publicRoomState,
} from "./rooms.js";
import { PHASES, advancePhase, privateLedger, privateWhisper, runBotsForTrade, startGame } from "./rounds.js";
import { validateOrderBatch } from "./orders.js";
import { GOOD_IDS, DIRECTIONS } from "./economy.js";

const app = express();
const server = createServer(app);
const io = new Server(server);
const rooms = new Map();

app.use(express.static("public"));

io.on("connection", (socket) => {
  socket.on("room:create", ({ name, playerId, withBots = false }, acknowledge) => {
    const merchantName = validateName(name);
    if (!merchantName) return acknowledge({ error: "Choose a name from 2 to 14 characters." });
    if (!validatePlayerId(playerId)) return acknowledge({ error: "Your browser identity could not be saved. Please try again." });

    const room = createRoom(rooms, playerId, merchantName);
    if (withBots) addBotMerchants(room);
    seatSocket(socket, room, playerId);
    acknowledge({ room: publicRoomState(room), role: "merchant" });
  });

  socket.on("room:join", ({ code, name, playerId }, acknowledge) => {
    const merchantName = validateName(name);
    if (!merchantName) return acknowledge({ error: "Choose a name from 2 to 14 characters." });
    if (!validatePlayerId(playerId)) return acknowledge({ error: "Your browser identity could not be saved. Please try again." });

    const result = joinRoom(rooms, String(code ?? "").toUpperCase(), playerId, merchantName);
    if (result.error) return acknowledge(result);

    seatSocket(socket, result.room, playerId);
    acknowledge({ room: publicRoomState(result.room), role: result.role });
    emitPrivateWhisper(result.room, playerId);
    broadcastRoom(result.room);
  });

  socket.on("room:resume", ({ code, playerId }, acknowledge) => {
    const result = reconnectMerchant(rooms, String(code ?? "").toUpperCase(), playerId);
    if (result.error) return acknowledge(result);

    seatSocket(socket, result.room, playerId);
    acknowledge({ room: publicRoomState(result.room), role: result.role });
    emitPrivateWhisper(result.room, playerId);
    emitPrivateLedger(result.room, playerId);
    broadcastRoom(result.room);
  });

  socket.on("room:rounds", ({ code, totalRounds }, acknowledge) => {
    const room = rooms.get(code);
    if (!room) return acknowledge({ error: "That guildhall no longer exists." });
    if (room.hostId !== socket.data.playerId) return acknowledge({ error: "Only the host may set the round count." });

    const result = setRoundCount(room, Number(totalRounds));
    if (result.error) return acknowledge(result);
    acknowledge({ room: publicRoomState(room) });
    broadcastRoom(room);
  });

  socket.on("game:start", ({ code }, acknowledge) => {
    const room = rooms.get(code);
    if (!room) return acknowledge({ error: "That guildhall no longer exists." });
    if (room.hostId !== socket.data.playerId) return acknowledge({ error: "Only the host may open the market." });
    if (room.merchants.size < MIN_MERCHANTS_TO_START) {
      return acknowledge({ error: "At least three merchants are needed." });
    }

    promoteSpectators(room);
    startGame(room, randomUUID());
    broadcastRoom(room);
    emitAllPrivateWhispers(room);
    emitAllPrivateLedgers(room);
    scheduleNextPhase(room);
    acknowledge({ room: publicRoomState(room) });
  });

  socket.on("orders:seal", ({ code, items }, acknowledge) => {
    const room = rooms.get(code);
    if (!room) return acknowledge({ error: "That guildhall no longer exists." });
    if (room.phase !== PHASES.TRADE) return acknowledge({ error: "Orders can only be sealed during the trade phase." });

    const playerId = socket.data.playerId;
    const merchant = room.merchants.get(playerId);
    if (!merchant) return acknowledge({ error: "You are not a merchant in this guildhall." });

    const validation = validateOrderBatch(items);
    if (validation.error) return acknowledge(validation);

    const batch = { items, sealedAt: Date.now() };
    merchant.orders = batch;

    acknowledge({ ok: true });
    socket.emit("orders:ack", batch);
  });

  socket.on("game:again", ({ code }, acknowledge) => {
    const room = rooms.get(code);
    if (!room) return acknowledge({ error: "That guildhall no longer exists." });
    if (room.hostId !== socket.data.playerId) return acknowledge({ error: "Only the host may begin another game." });
    if (room.phase !== PHASES.FINAL) return acknowledge({ error: "The current game is not finished." });

    promoteSpectators(room);
    startGame(room, randomUUID());
    broadcastRoom(room);
    emitAllPrivateWhispers(room);
    emitAllPrivateLedgers(room);
    scheduleNextPhase(room);
    acknowledge({ room: publicRoomState(room) });
  });

  socket.on("rumor:post", ({ code, good, direction }, acknowledge) => {
    const room = rooms.get(code);
    if (!room) return acknowledge({ error: "That guildhall no longer exists." });
    if (room.phase !== PHASES.TRADE) return acknowledge({ error: "Rumors may only be posted during the trade phase." });

    const playerId = socket.data.playerId;
    const merchant = room.merchants.get(playerId);
    if (!merchant) return acknowledge({ error: "You are not a merchant in this guildhall." });
    if (merchant.rumorPosted) return acknowledge({ error: "You have already posted a rumor this round." });
    if (!GOOD_IDS.includes(good)) return acknowledge({ error: "Unknown good." });
    if (!DIRECTIONS.includes(direction)) return acknowledge({ error: "Direction must be rise, fall or hold." });

    const rumor = {
      id: randomUUID(),
      merchantId: playerId,
      authorName: merchant.name,
      good,
      direction,
      postedAt: Date.now(),
      // isTrue, buyersAfter, sellersAfter filled in at market turns
      isTrue: null,
      buyersAfter: 0,
      sellersAfter: 0,
    };
    room.rumors.push(rumor);
    merchant.rumorPosted = true;

    acknowledge({ ok: true });
    // Broadcast the new rumor to all players (without isTrue).
    const publicRumor = { id: rumor.id, merchantId: rumor.merchantId, authorName: rumor.authorName, good: rumor.good, direction: rumor.direction, postedAt: rumor.postedAt };
    io.to(room.code).emit("rumor:new", publicRumor);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    disconnectMerchant(room, socket.data.playerId);
    broadcastRoom(room);
  });
});

function broadcastRoom(room) {
  io.to(room.code).emit("room:state", publicRoomState(room));
}

function emitAllPrivateWhispers(room) {
  for (const merchantId of room.merchants.keys()) emitPrivateWhisper(room, merchantId);
}

function emitAllPrivateLedgers(room) {
  for (const merchantId of room.merchants.keys()) emitPrivateLedger(room, merchantId);
}

function emitPrivateWhisper(room, merchantId) {
  if (room.phase !== PHASES.WHISPER && room.phase !== PHASES.TRADE) return;
  const socketId = room.merchants.get(merchantId)?.socketId;
  const whisper = privateWhisper(room, merchantId);
  if (socketId && whisper) io.to(socketId).emit("whisper:private", whisper);
}

function emitPrivateLedger(room, merchantId) {
  const merchant = room.merchants.get(merchantId);
  if (!merchant || !merchant.socketId) return;
  const ledger = privateLedger(room, merchantId);
  if (ledger) io.to(merchant.socketId).emit("ledger:private", ledger);
}

function scheduleNextPhase(room) {
  clearTimeout(room.phaseTimer);
  const phaseEndsAt = room.phaseEndsAt;
  room.phaseTimer = setTimeout(() => {
    if (room.phaseEndsAt !== phaseEndsAt) return;
    advancePhase(room);
    if (room.phase === PHASES.TRADE) runBotsForTrade(room);
    broadcastRoom(room);
    // After TRADE ends, advancePhase calls revealMarketTurn which settles orders.
    // Now emit private ledgers to all merchants.
    if (room.phase === PHASES.MARKET_TURNS) emitAllPrivateLedgers(room);
    if (room.phase === PHASES.WHISPER) emitAllPrivateWhispers(room);
    if (room.phase === PHASES.FINAL) emitAllPrivateLedgers(room);
    if (room.phase !== PHASES.FINAL) scheduleNextPhase(room);
  }, Math.max(0, phaseEndsAt - Date.now()));
}

function validateName(value) {
  const name = String(value ?? "").trim();
  return name.length >= 2 && name.length <= 14 ? name : null;
}

function validatePlayerId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{20,80}$/.test(value);
}

function seatSocket(socket, room, playerId) {
  socket.join(room.code);
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;
  const person = room.merchants.get(playerId) ?? room.spectators.get(playerId);
  person.socketId = socket.id;
  person.connected = true;
}

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`Guildhall Whispers is listening on ${port}`));

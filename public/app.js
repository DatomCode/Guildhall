const socket = io();
const landing = document.querySelector("#landing");
const lobby = document.querySelector("#lobby");
const joinForm = document.querySelector("#join-form");
const nameInput = document.querySelector("#name");
const codeInput = document.querySelector("#code");
const message = document.querySelector("#message");
const lobbyMessage = document.querySelector("#lobby-message");
const roomCode = document.querySelector("#room-code");
const lobbyCount = document.querySelector("#lobby-count");
const merchantList = document.querySelector("#merchant-list");
const hostNote = document.querySelector("#host-note");
const startButton = document.querySelector("#start-button");
const roundCount = document.querySelector("#round-count");
const game = document.querySelector("#game");
const gameRound = document.querySelector("#game-round");
const phaseTitle = document.querySelector("#phase-title");
const countdown = document.querySelector("#countdown");
const whisperNote = document.querySelector("#whisper-note");
const whisperText = document.querySelector("#whisper-text");
const whisperHelp = document.querySelector("#whisper-help");
const phaseCopy = document.querySelector("#phase-copy");
const marketResults = document.querySelector("#market-results");
const marketPanel = document.querySelector("#market-panel");
const marketRows = document.querySelector("#market-rows");
const sealButton = document.querySelector("#seal-button");
const orderMessage = document.querySelector("#order-message");
const rumorBoard = document.querySelector("#rumor-board");
const rumorFeed = document.querySelector("#rumor-feed");
const rumorGoodSelect = document.querySelector("#rumor-good");
const rumorDirectionSelect = document.querySelector("#rumor-direction");
const rumorPostBtn = document.querySelector("#rumor-post-btn");
const rumorMessage = document.querySelector("#rumor-message");
const ledgerCard = document.querySelector("#ledger-card");
const finalStandings = document.querySelector("#final-standings");
const playAgainButton = document.querySelector("#play-again");
const tutorial = document.querySelector("#tutorial");
const tutorialStep = document.querySelector("#tutorial-step");
const tutorialTitle = document.querySelector("#tutorial-title");
const tutorialCopy = document.querySelector("#tutorial-copy");
const tutorialNext = document.querySelector("#tutorial-next");
const tutorialSkip = document.querySelector("#tutorial-skip");
const practiceCard = document.querySelector("#practice-card");

let room = null;
let whisper = null;
let countdownTimer = null;
let myLedger = null;
let myRumorPosted = false;  // tracks whether we've posted this round
let myRole = null;
// stepperValues: { salt: number, wool: number, amber: number, indigo: number }
let stepperValues = { salt: 0, wool: 0, amber: 0, indigo: 0 };
let activePhase = null;
let activeRound = null;
const GOOD_IDS = ["salt", "wool", "amber", "indigo"];
const playerId = getPlayerId();
const tutorialCards = [
  ["A private whisper", "You get one private whisper, and it may be wrong."],
  ["The rumor board", "You can post a rumor, true or not."],
  ["The trading desk", "Buy and sell before the market turns."],
  ["The richest purse", "Richest purse after 5 rounds wins."],
  ["Practice round", "Try the ledger before you enter the hall. Nothing in this rehearsal is scored."],
];
let tutorialIndex = 0;

if (!localStorage.getItem("guildhall-tutorial-complete")) showTutorial();

socket.on("connect", () => {
  const savedRoom = readSavedRoom();
  if (savedRoom) socket.emit("room:resume", { ...savedRoom, playerId }, receiveRoom);
});

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
});

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendJoin();
});

document.querySelector("#host-button").addEventListener("click", () => {
  socket.emit("room:create", { name: nameInput.value, playerId }, receiveRoom);
});

document.querySelector("#bots-button").addEventListener("click", () => {
  socket.emit("room:create", { name: nameInput.value, playerId, withBots: true }, receiveRoom);
});

roundCount.addEventListener("change", () => {
  socket.emit("room:rounds", { code: room.code, totalRounds: roundCount.value }, receiveRoom);
});

startButton.addEventListener("click", () => {
  socket.emit("game:start", { code: room.code }, (response) => {
    lobbyMessage.textContent = response.error ?? "";
  });
});

sealButton.addEventListener("click", () => {
  const items = GOOD_IDS
    .map((good) => ({ good, value: stepperValues[good] }))
    .filter(({ value }) => value !== 0)
    .map(({ good, value }) => ({
      good,
      units: Math.abs(value),
      side: value > 0 ? "buy" : "sell",
    }));

  socket.emit("orders:seal", { code: room.code, items }, (response) => {
    if (response.error) {
      orderMessage.textContent = response.error;
    }
    // Success ack comes via orders:ack event.
  });
});

socket.on("room:state", receiveRoom);

socket.on("whisper:private", (receivedWhisper) => {
  whisper = receivedWhisper;
  if (room?.phase === "WHISPER" || room?.phase === "TRADE") renderGame();
});

socket.on("ledger:private", (ledger) => {
  myLedger = ledger;
  if (room?.phase === "TRADE") {
    renderMarketPanel();
  } else if (room?.phase === "LEDGER" || room?.phase === "MARKET_TURNS") {
    renderOrderResults();
  }
});

socket.on("orders:ack", (batch) => {
  orderMessage.textContent = "Orders sealed.";
  sealButton.textContent = "Amend Orders ⊛";
});

socket.on("rumor:new", (rumor) => {
  // Append to the live feed immediately.
  appendRumorToFeed(rumor);
});

whisperNote.addEventListener("click", () => {
  whisperNote.classList.add("unfolded");
  document.querySelector(".note-closed").hidden = true;
  whisperText.hidden = false;
});

rumorPostBtn.addEventListener("click", () => {
  if (myRumorPosted) return;
  const good = rumorGoodSelect.value;
  const direction = rumorDirectionSelect.value;
  socket.emit("rumor:post", { code: room.code, good, direction }, (response) => {
    if (response.error) {
      rumorMessage.textContent = response.error;
      return;
    }
    myRumorPosted = true;
    rumorMessage.textContent = "Your rumor has been posted.";
    rumorGoodSelect.disabled = true;
    rumorDirectionSelect.disabled = true;
    rumorPostBtn.disabled = true;
  });
});

playAgainButton.addEventListener("click", () => {
  socket.emit("game:again", { code: room.code }, (response) => {
    if (response.error) phaseCopy.textContent = response.error;
  });
});

tutorialNext.addEventListener("click", () => {
  if (tutorialIndex === tutorialCards.length - 1) return closeTutorial();
  tutorialIndex += 1;
  showTutorial();
});

tutorialSkip.addEventListener("click", closeTutorial);

function sendJoin() {
  if (codeInput.value.length !== 4) {
    message.textContent = "Enter the four-letter guildhall code.";
    return;
  }
  socket.emit("room:join", { code: codeInput.value, name: nameInput.value, playerId }, receiveRoom);
}

function receiveRoom(response) {
  if (response.error) {
    message.textContent = response.error;
    return;
  }
  room = response.room ?? response;
  myRole = response.role ?? (room.merchants.some((merchant) => merchant.id === playerId) ? "merchant" : "spectator");
  localStorage.setItem("guildhall-seat", JSON.stringify({ code: room.code }));
  message.textContent = "";
  if (room.phase === "LOBBY") renderLobby();
  else renderGame();
}

function renderLobby() {
  clearInterval(countdownTimer);
  game.hidden = true;
  landing.hidden = true;
  lobby.hidden = false;
  roomCode.textContent = room.code;
  lobbyCount.textContent = `${room.merchantCount} of 8 merchants are seated`;
  merchantList.replaceChildren(...room.merchants.map((merchant) => {
    const item = document.createElement("li");
    item.textContent = merchant.name + (merchant.isBot ? " · Bot" : "") + (merchant.id === room.hostId ? " · Host" : "") + (merchant.connected ? "" : " · reconnecting");
    return item;
  }));

  const isHost = room.hostId === playerId;
  startButton.hidden = !isHost;
  startButton.disabled = room.merchantCount < 3;
  roundCount.value = String(room.totalRounds);
  roundCount.disabled = !isHost;
  hostNote.textContent = isHost
    ? (room.merchantCount < 3 ? "Awaiting at least three merchants." : "The hall is ready to open.")
    : "The host will open the market when all are ready.";
}

function renderGame() {
  landing.hidden = true;
  lobby.hidden = true;
  game.hidden = false;
  gameRound.textContent = room.phase === "FINAL" ? "The ledger is complete" : `Round ${room.round} of ${room.totalRounds}`;
  phaseTitle.textContent = phaseHeading(room.phase);
  phaseCopy.textContent = phaseDescription(room.phase);
  whisperNote.hidden = room.phase !== "WHISPER" || !whisper;
  whisperHelp.hidden = room.phase !== "WHISPER" || !whisper;
  if (whisper) {
    whisperNote.classList.remove("unfolded");
    document.querySelector(".note-closed").hidden = false;
    whisperText.hidden = true;
    whisperText.textContent = `${titleCase(whisper.good)} will ${whisper.direction.toUpperCase()}.`;
  }

  const isTrade = room.phase === "TRADE";
  const isSpectator = myRole === "spectator";
  const phaseChanged = room.phase !== activePhase || room.round !== activeRound;
  activePhase = room.phase;
  activeRound = room.round;

  marketPanel.hidden = !isTrade;
  rumorBoard.hidden = !isTrade || isSpectator;

  if (isTrade) {
    if (phaseChanged) {
      sealButton.textContent = "Seal Orders ⊛";
      orderMessage.textContent = "";
      stepperValues = { salt: 0, wool: 0, amber: 0, indigo: 0 };
    }
    renderMarketPanel();
    if (isSpectator) {
      orderMessage.textContent = "You are spectating this game. You will take a merchant seat next game.";
      sealButton.hidden = true;
    } else {
      sealButton.hidden = false;
      renderRumorBoard();
    }
  }

  const hasMarketResults = Boolean(room.marketTurns);
  marketResults.hidden = !hasMarketResults;
  if (hasMarketResults) {
    const rows = Object.entries(room.marketTurns)
      .filter(([good]) => !good.startsWith("_"))
      .map(([good, turn]) => {
        const row = document.createElement("p");
        const change = turn.direction === "rise" ? "↑ Rose" : turn.direction === "fall" ? "↓ Fell" : "→ Held";
        row.textContent = `${titleCase(good)}  ${turn.oldPrice} → ${turn.newPrice}  ${change}`;
        row.className = turn.direction === "rise" ? "price-rose" : turn.direction === "fall" ? "price-fell" : "price-held";
        return row;
      });

    const scoredRumors = (room.rumors ?? []).filter((r) => r.isTrue !== undefined && r.isTrue !== null);
    if (scoredRumors.length > 0) {
      const rumorHeading = document.createElement("p");
      rumorHeading.style.fontWeight = "bold";
      rumorHeading.style.marginTop = "14px";
      rumorHeading.textContent = "Rumors of the Round:";
      rows.push(rumorHeading);

      for (const r of scoredRumors) {
        const p = document.createElement("p");
        const statusSpan = document.createElement("span");
        statusSpan.className = r.isTrue ? "rumor-result-true" : "rumor-result-false";
        statusSpan.textContent = r.isTrue ? "TRUE" : "FALSE";

        p.append(
          `${r.authorName}: "${titleCase(r.good)} will ${r.direction.toUpperCase()}" was `,
          statusSpan,
          ` (${r.buyersAfter} bought, ${r.sellersAfter} sold)`
        );
        rows.push(p);
      }
    }

    marketResults.replaceChildren(...rows);
  }

  // Show order results during LEDGER/MARKET_TURNS if we have them.
  if ((room.phase === "LEDGER" || room.phase === "MARKET_TURNS") && myLedger) {
    renderOrderResults();
  }

  renderLedgerRecap();
  renderFinalStandings();

  startCountdown();
}

function renderLedgerRecap() {
  const showRecap = (room.phase === "MARKET_TURNS" || room.phase === "LEDGER" || room.phase === "FINAL") && myLedger;
  ledgerCard.hidden = !showRecap;
  if (!showRecap) return;
  ledgerCard.replaceChildren(
    ledgerLine("Cash", `${myLedger.cash} crowns`),
    ledgerLine("Holdings value", `${myLedger.holdingsValue} crowns`),
    ledgerLine("Net worth", `${myLedger.netWorth} crowns`),
    ledgerLine("Rank", `${myLedger.rank} of ${myLedger.merchantCount}`),
  );
}

function renderFinalStandings() {
  const isFinal = room.phase === "FINAL";
  finalStandings.hidden = !isFinal;
  playAgainButton.hidden = !isFinal || room.hostId !== playerId;
  if (!isFinal) return;
  const heading = document.createElement("h3");
  heading.textContent = "Final standings";
  const list = document.createElement("ol");
  for (const merchant of room.finalStandings ?? []) {
    const item = document.createElement("li");
    const badges = merchant.badges.length ? ` · ${merchant.badges.join(" · ")}` : "";
    const victory = merchant.sharedWinner ? " · Shared victory" : "";
    item.textContent = `${merchant.name} — ${merchant.netWorth} crowns (cash ${merchant.cash})${victory}${badges}`;
    list.appendChild(item);
  }
  finalStandings.replaceChildren(heading, list);
}

function ledgerLine(label, value) {
  const line = document.createElement("p");
  line.innerHTML = `<strong>${label}</strong><span>${value}</span>`;
  return line;
}

function renderMarketPanel() {
  const holdings = myLedger?.holdings ?? {};
  const cash = myLedger?.cash ?? 0;
  const prices = room?.prices ?? {};

  // Calculate total buy cost of pending buy orders for affordability check.
  const pendingBuyCost = GOOD_IDS.reduce((total, good) => {
    const val = stepperValues[good];
    return val > 0 ? total + val * (prices[good] ?? 0) : total;
  }, 0);

  marketRows.replaceChildren(...GOOD_IDS.map((good) => {
    const owned = holdings[good] ?? 0;
    const price = prices[good] ?? 0;
    const stepVal = stepperValues[good] ?? 0;

    const tr = document.createElement("tr");

    // Good name
    const tdGood = document.createElement("td");
    tdGood.textContent = titleCase(good);
    tr.appendChild(tdGood);

    // Price
    const tdPrice = document.createElement("td");
    tdPrice.textContent = `${price}c`;
    tr.appendChild(tdPrice);

    // Own
    const tdOwn = document.createElement("td");
    tdOwn.textContent = owned;
    tr.appendChild(tdOwn);

    // Order stepper
    const tdOrder = document.createElement("td");

    const minVal = -owned;  // can't sell more than owned
    const maxVal = 15 - owned; // can't exceed 15 units

    // Check if adding one more buy is affordable.
    // The current stepVal > 0 means we have pending buys for this good; we compute
    // if adding one more unit of this good would exceed cash.
    const currentBuyCostThisGood = stepVal > 0 ? stepVal * price : 0;
    const otherBuyCost = pendingBuyCost - currentBuyCostThisGood;
    const cashAfterOthers = cash - otherBuyCost;
    const canBuyOneMore = (stepVal + 1) * price <= cashAfterOthers;

    const btnMinus = document.createElement("button");
    btnMinus.className = "stepper-btn";
    btnMinus.dataset.good = good;
    btnMinus.dataset.dir = "-1";
    btnMinus.textContent = "−";
    btnMinus.disabled = myRole === "spectator" || stepVal <= minVal;
    btnMinus.addEventListener("click", () => {
      stepperValues[good] = Math.max(minVal, (stepperValues[good] ?? 0) - 1);
      renderMarketPanel();
    });

    const valSpan = document.createElement("span");
    valSpan.className = "stepper-val";
    valSpan.textContent = stepVal > 0 ? `+${stepVal}` : String(stepVal);
    if (stepVal > 0) valSpan.classList.add("stepper-buy");
    else if (stepVal < 0) valSpan.classList.add("stepper-sell");

    const btnPlus = document.createElement("button");
    btnPlus.className = "stepper-btn";
    btnPlus.dataset.good = good;
    btnPlus.dataset.dir = "1";
    btnPlus.textContent = "+";
    btnPlus.disabled = myRole === "spectator" || stepVal >= maxVal || !canBuyOneMore;
    if (!canBuyOneMore && stepVal < maxVal) {
      btnPlus.title = "Your purse is light";
    }
    btnPlus.addEventListener("click", () => {
      if (stepperValues[good] < maxVal) {
        stepperValues[good] = (stepperValues[good] ?? 0) + 1;
        renderMarketPanel();
      }
    });

    tdOrder.appendChild(btnMinus);
    tdOrder.appendChild(valSpan);
    tdOrder.appendChild(btnPlus);
    tr.appendChild(tdOrder);

    return tr;
  }));
}

function renderOrderResults() {
  if (!myLedger?.orderResults?.length) return;
  const rejections = myLedger.orderResults.filter((r) => !r.ok);
  if (!rejections.length) return;

  // Append rejection notices to phaseCopy if not already shown.
  const existing = phaseCopy.querySelector(".order-rejected-list");
  if (existing) existing.remove();

  const list = document.createElement("ul");
  list.className = "order-rejected-list";
  for (const r of rejections) {
    const li = document.createElement("li");
    li.className = "order-rejected";
    li.textContent = `${titleCase(r.side)} ${r.units} ${titleCase(r.good)} rejected: ${r.reason}`;
    list.appendChild(li);
  }
  phaseCopy.appendChild(list);
}

function renderRumorBoard() {
  myRumorPosted = (room.rumors ?? []).some((r) => r.merchantId === playerId);

  rumorGoodSelect.disabled = myRumorPosted;
  rumorDirectionSelect.disabled = myRumorPosted;
  rumorPostBtn.disabled = myRumorPosted;
  rumorMessage.textContent = myRumorPosted ? "Your rumor has been posted." : "";

  renderRumorFeed();
}

function renderRumorFeed() {
  const rumors = room.rumors ?? [];
  if (rumors.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-rumors";
    empty.textContent = "No rumors posted yet this round.";
    rumorFeed.replaceChildren(empty);
  } else {
    rumorFeed.replaceChildren(...rumors.map(createRumorItem));
  }
}

function createRumorItem(rumor) {
  const li = document.createElement("li");
  li.textContent = `${rumor.authorName}: ${titleCase(rumor.good)} will ${rumor.direction.toUpperCase()}`;
  return li;
}

function appendRumorToFeed(rumor) {
  if (!room.rumors) room.rumors = [];
  if (!room.rumors.some((r) => r.id === rumor.id)) {
    room.rumors.push(rumor);
  }
  const empty = rumorFeed.querySelector(".empty-rumors");
  if (empty) empty.remove();
  rumorFeed.appendChild(createRumorItem(rumor));
}

function startCountdown() {
  clearInterval(countdownTimer);
  const update = () => {
    if (!room.phaseEndsAt) {
      countdown.textContent = "";
      return;
    }
    const seconds = Math.max(0, Math.ceil((room.phaseEndsAt - Date.now()) / 1000));
    if (room.phase === "TRADE") {
      countdown.textContent = `Time to trade: ${seconds}s`;
    } else {
      countdown.textContent = `The ledger turns in ${seconds}s`;
    }
  };
  update();
  countdownTimer = setInterval(update, 250);
}

function phaseHeading(phase) {
  return ({ WHISPER: "A private whisper", TRADE: "Trade", MARKET_TURNS: "The market turns", LEDGER: "Ledger recap", FINAL: "Final ledger" })[phase] ?? phase;
}

function phaseDescription(phase) {
  return ({ WHISPER: "Hush. A whisper has reached you.", LEDGER: "The clerk records this round before the next whisper.", FINAL: "All rounds have concluded." })[phase] ?? "";
}

function showTutorial() {
  const [title, copy] = tutorialCards[tutorialIndex];
  tutorial.hidden = false;
  tutorialStep.textContent = tutorialIndex < 4 ? `Clerk's briefing · ${tutorialIndex + 1} of 4` : "Optional rehearsal";
  tutorialTitle.textContent = title;
  tutorialCopy.textContent = copy;
  practiceCard.hidden = tutorialIndex !== 4;
  tutorialNext.textContent = tutorialIndex === 4 ? "Enter the hall" : "Next";
  tutorialSkip.textContent = tutorialIndex === 4 ? "Skip practice" : "Skip briefing";
}

function closeTutorial() {
  localStorage.setItem("guildhall-tutorial-complete", "true");
  tutorial.hidden = true;
}

function titleCase(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function getPlayerId() {
  const key = "guildhall-player-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function readSavedRoom() {
  try {
    return JSON.parse(localStorage.getItem("guildhall-seat"));
  } catch {
    localStorage.removeItem("guildhall-seat");
    return null;
  }
}

# Guildhall Whispers

**A game of rumors and trade.** Four goods. One secret each. Trust no one, trade anyway.

**Play now:** https://guildhall-wyta.onrender.com/

Guildhall Whispers is a real-time multiplayer trading game for 3 to 8 players, set in a medieval guildhall. Every round each merchant gets one private whisper about where a price is headed, but whispers are only right about 70% of the time. Merchants can post rumors to a public board, honestly or not, then buy and sell before the prices turn. The richest merchant wins.

Join from any phone or laptop with a four-letter code. No login, no install. Want to try it alone? Tap **Play with bots** on the landing page.

## How to play

1. **Take your seat.** Enter a merchant name and a guildhall code, or open a new hall as host and share the code with friends.
2. **Read your whisper.** Each round, tap your folded note. It names one good and a direction (rise, fall or hold). Only you can see it, and it may not be true.
3. **Rumor and trade.** Post at most one rumor to the board using the pickers (good and direction, no free text). Stage buy and sell orders with the steppers, then seal them before the timer ends.
4. **The market turns.** Each price rises, falls or holds, and the true change is revealed along with which rumors were false.
5. **Read the ledger.** See your cash, holdings, net worth and rank, then move on to the next round.
6. **Richest merchant wins** after the final round.

## Rules

| Rule | Value |
| --- | --- |
| Players | 3 to 8 |
| Rounds | 3 or 5, chosen by the host |
| Starting funds | 1,000 crowns per merchant |
| Goods and starting prices | Salt 50, Wool 40, Amber 80, Indigo 120 |
| Hidden truth | Each round, each good secretly rises 25%, falls 25% or holds, with chances 35 / 35 / 30 |
| Whisper | One per merchant per round. True 70% of the time, otherwise a different direction |
| Rumor board | One rumor per merchant per round, picked from a good and a direction |
| Trading | Whole units at the current price, up to 15 units per good. No debt, no short selling |
| Price floor | A price never drops below 5 crowns |
| Net worth | Cash plus units times current price |
| Winner | Highest net worth after the last round. Ties are broken by cash |

Crowns are fictional. There is no real money and there are no real tickers.

## Features

- Join with a four-letter code, no login or install
- Play with bots for solo practice
- Private whispers delivered only to the receiving player
- Public rumor board with picker-only posts, so no free text
- Staged orders sealed as a batch, with resealing allowed until the timer ends
- Market reveal and ledger recap that explain why prices moved
- Final standings with badges for the most honest broker and the smoothest liar
- First-run tutorial
- Automatic rejoin after a dropped connection

## How it works

- Node.js server with WebSockets and in-memory rooms
- The server is authoritative. All randomness (the hidden truth and whisper accuracy) and all arithmetic run on the server
- Whispers are sent only to the receiving player's socket, and the true outcomes are never sent before the market turns
- Orders are validated on the server and rejected if they would overspend, break the 15-unit cap, or sell units the merchant does not own
- Rooms are held in memory, so a server restart ends any game in progress

## Run it locally

You need Node.js installed.

```bash
git clone https://github.com/DatomCode/Guildhall.git
cd Guildhall
npm install
npm start
```

Then open the local address printed in the terminal. Open it in several browser windows or on several devices to play with more than one merchant.

## Deployment

The live game runs as a web service on Render's free tier. If the service has been idle, the first visit can take a little while to wake up.

## About

Built for the Handshake AI Skills Studio and OpenAI Multiplayer Game Challenge.

Source: https://github.com/DatomCode/Guildhall
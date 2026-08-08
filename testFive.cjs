// Test: does the 5-escape penalty chain correctly?
// Setup: 4 players [You(0), P1(1), P2(2), P3(3)]
// P1 plays a 5 -> P2 must respond
// P2 plays a 5 to escape -> P3 must respond (serve penalty)
const { playCard, drawCard } = require("./dist/gameLogic.js");

function card(id, shape, value) {
  return { id, shape, value };
}

function makeState() {
  return {
    mode: "elimination",
    players: [
      {
        name: "You",
        hand: [card("h0a", "circle", 7), card("h0b", "cross", 3)],
        isHuman: true,
        active: true,
      },
      {
        name: "P1",
        hand: [card("h1a", "circle", 5), card("h1b", "star", 4)],
        isHuman: false,
        active: true,
      },
      {
        name: "P2",
        hand: [card("h2a", "triangle", 5), card("h2b", "square", 2)],
        isHuman: false,
        active: true,
      },
      {
        name: "P3",
        hand: [card("h3a", "square", 7), card("h3b", "cross", 8)],
        isHuman: false,
        active: true,
      },
    ],
    currentPlayerIndex: 1,
    topCard: card("t", "circle", 7),
    direction: 1,
    deck: [],
    log: [],
    gameOver: false,
    winnerIndex: null,
    roundOver: false,
    roundWinnerIndex: null,
    roundNumber: 1,
    lastElimination: null,
    pendingShapeSelection: false,
    jumpCount: 0,
    holdAll: false,
    fiveResponse: false,
    discardPile: [],
  };
}

console.log("=== Scenario: P1 plays 5, P2 escapes with 5 ===");
let s = makeState();

// Step 1: P1 plays a 5
s = playCard(s, 1, s.players[1].hand[0]);
console.log(
  `After P1 plays 5: fiveResponse=${s.fiveResponse}, current=${s.currentPlayerIndex} (${s.players[s.currentPlayerIndex].name})`,
);
if (!s.fiveResponse || s.currentPlayerIndex !== 2) {
  console.log("FAIL: P2 should be challenged");
  process.exit(1);
}

// Step 2: P2 (current) plays a 5 to escape
s = playCard(s, 2, s.players[2].hand[0]);
console.log(
  `After P2 plays 5 to escape: fiveResponse=${s.fiveResponse}, current=${s.currentPlayerIndex} (${s.players[s.currentPlayerIndex].name})`,
);
if (!s.fiveResponse) {
  console.log("FAIL: fiveResponse should still be true (P3 must serve)");
  process.exit(1);
}
if (s.currentPlayerIndex !== 3) {
  console.log(
    `FAIL: P3 should be challenged, but current is ${s.players[s.currentPlayerIndex].name}`,
  );
  process.exit(1);
}
console.log(
  `PASS: P3 (${s.players[3].name}) must now serve the penalty (fiveResponse=true)`,
);

// Step 3: P3 has no 5, so draws 3 penalty cards
s = drawCard(s, 3);
console.log(
  `After P3 draws: fiveResponse=${s.fiveResponse}, current=${s.currentPlayerIndex} (${s.players[s.currentPlayerIndex].name}), P3 hand size=${s.players[3].hand.length}`,
);
if (s.fiveResponse) {
  console.log("FAIL: fiveResponse should be false after P3 draws 3");
  process.exit(1);
}
if (s.currentPlayerIndex !== 0) {
  console.log(
    `FAIL: Turn should pass to You(0), got ${s.players[s.currentPlayerIndex].name}`,
  );
  process.exit(1);
}

console.log("\nALL TESTS PASSED \u2705");

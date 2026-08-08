# Whot Game - Mode Selection (1v1 & Elimination)

## Steps

- [x] 1. Update `lib/types.ts`: add `mode: "1v1" | "elimination"` to `GameState`
- [x] 2. Update `lib/gameLogic.ts`: `initGame(numPlayers, mode)`, thread `mode` through `dealRound`, handle 1v1 in `nextRound()`
- [x] 3. Update `components/PlayerSetup.tsx`: add mode selection (1v1 vs Elimination) before player count
- [x] 4. Update `components/WhotGame.tsx`: pass mode into `initGame`, update round/game-over text for 1v1, "5 challenge" response support
- [x] 5. Verify with `npm run build`


---
id: ENG-03
title: The emitters-off order, and every other engineering order, goes to whichever engineer is first in sight or on the PDA list, a player or a dead one included, not to the one that lit the engine
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:133, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:371, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:212, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:45
fix: Have the Chief Engineer remember which engineer took the engine (and each door job) and give later orders to that one, and fall back to another only after the first has not answered twice, preferring one that has spoken the crew's set words before
---

## What is wrong

See also: HOLE-13 (a player in a crew job is handed work like an NPC) and HOLE-08 (the dead are counted on). This is the engineering case of both, and it is the one where it is dangerous.

The Chief Engineer does not keep who its engineer is. Each time it has an order to give it works it out again with `engineer(brain)`: an engineer in sight if there is one, and failing that `names[0]`, the first engineer its PDA lists. The PDA list (`people_on_pda` in `crew_npc_cargo.dm`) is every PDA on the station's level, in the order the PDAs were made, with the job saved on it. That includes:

- a player who joined as a Station Engineer;
- an engineer who is dead, or whose PDA is lying on the floor;
- another owner's NPC engineer. That one does no harm: it runs the same code, takes "Emitters off, now" said to its first name, and switches the emitters off. The failing cases are a player and a dead or lost PDA.

So with a player engineer aboard, the order that matters most, "Emitters off, now", can be sent by PDA to the player. The NPC engineer that lit the engine, which is the only one that will act on the set words, never hears it. The Chief Engineer then waits 90 seconds for `OFF_WORDS` ("the emitters are off"), which a player will not say in those words, and sends it again to whoever `engineer()` now gives. Nothing ever counts the tries.

The light, relight and shut orders all go through `giveStep`, which calls `engineer(brain)` afresh each time; nothing ties them to the one that has the engine. The door-forcing order picks `engineersAboard(brain)[0]`. That does prefer one in sight, because `engineersAboard` lists `peopleInView` before `pdaPeople`, so it picks the same engineer `engineer()` would.

One case: a round with a player as Station Engineer, whose PDA was made before the NPC's. The first meeting goes well: `lightStep` gives the engine to an engineer present at the meeting, the NPC, which lights it. Forty minutes later integrity falls to 94. `syncTasks` sets `chief.order = { what: 'shut' }`. The Chief Engineer is in its office; no engineer in sight. `engineer(brain)` returns `names[0]`, the player. `giveStep` sends the player "Jo, the engine is losing integrity. Emitters off, now." by PDA. `afterActing` sees the message sent and sets `shutGivenAt`. The NPC engineer, in Engineering, is told nothing. Ninety seconds later the same message goes to the player again. If the player is away, or does not read PDAs, or answers "on it", the emitters stay on.

The same for a door: security asks the Chief Engineer to force the Bar. `forcingReads` gives it to `engineersAboard(brain)[0]`, the player, and tells security "I am sending Jo to open the Bar". No NPC goes, nobody ever reports back (`forcing.sent` waits with no time limit: see ENG-04), and security waits.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:133`:

    /** Its engineer: one in sight if there is one, and failing that the first its PDA lists. Null if it has none. */
    function engineer(brain: NpcBrain): string | null {
      const names = engineersAboard(brain);
      return (
        names.find((name) =>
          brain.peopleInView.some((person) => person.name === name),
        ) ??
        names[0] ??
        null
      );
    }

`jobs/chiefengineer.ts:371`, `giveStep`: worked out again for every order.

    const order = chief.order;
    const name = engineer(brain);

`jobs/forcing.ts:212`, `forcingReads`:

    const engineer = isChiefEngineer(brain.job)
      ? engineersAboard(brain)[0]
      : undefined;

`jobs/engineering.ts:45`, `engineersAboard`: everyone in view and on the PDA whose job says engineer, in that order, nobody left out.

    return [
      ...new Set(
        [...brain.peopleInView, ...brain.pdaPeople]
          .filter((person) => isEngineer(person.job))
          .map((person) => person.name),
      ),
    ];

## How it was found

Read from the code, with `people_on_pda` read on the server side. Not seen in a round: every round so far has had the Captain as the only player and one NPC engineer.

## How to fix it

1. In `ChiefWork` (in `types.ts`) keep `engineer: string | null`: the name of the engineer that answered "The engine, right away." or "the engine is lit" (set it in `hearEngineer` from `from`). That is the one that has the engine.
2. In `giveStep`, use `chief.engineer` when it is set and still aboard (in view or on the PDA). Use `engineer(brain)` only when it is not set.
3. When an order to that engineer has gone twice with no word back (the shut order already re-arms on `SHUT_AGAIN_DS`: count those), try the next engineer in `engineersAboard`, and tell the Captain "I cannot reach <name>" so a person knows. For the shut order this matters most.
4. In `engineer()`, prefer an engineer that has said one of the set lines before (keep a small set of names heard saying `ENGINE_TAKEN_WORDS`, `LIT_WORDS`, `OFF_WORDS` or a forcing `DONE_WORDS`/`FAILED_WORDS`). That tells a crew NPC from a player without any hidden channel: it is what the Chief Engineer has heard.
5. In `forcingReads`, pick the engineer the same way, not `engineersAboard(brain)[0]`.

Owner's question: should a player engineer be given orders at all? The rules say a crew member knows only what it senses, so the Chief Engineer cannot know who is a player. Step 4 is the honest way to prefer the one that has answered before.

## How to test the fix

- `tools/llm_crew/engine.ts`: a Chief Engineer brain whose `pdaPeople` lists two engineers, the first never answering. After the engine was taken by the second, the shut order's `act.person` must be the second.
- Simulator: add a second engineer to the `engine` scenario that never speaks, put first in the PDA list. The engine must still be shut off when the toy crystal's integrity falls.
- In a round with a player engineer, grep `pda.log` for "Emitters off, now" and check whom it was sent to.

## Check

Checked by Opus 5.5. Confirmed. Severity lowered to medium.

- Every quote matches the code today: `engineer()` at `chiefengineer.ts:133`, `giveStep` at `chiefengineer.ts:371`, `forcingReads` at `forcing.ts:212`, `engineersAboard` at `engineering.ts:45`.
- `people_on_pda` (`crew_npc_cargo.dm:666`) lists every messenger in `GLOB.pda_messengers` that has a `saved_identification` and lies on a station level. It does not check who holds it, or whether they are alive or a player. The order follows the list's order, which our code does not control.
- `giveStep` with the engineer out of sight and a PDA to hand sends the order by message. On a send that goes through, `afterActing` sets `shutGivenAt` and clears the order, and 90 seconds later `syncTasks` makes it again for whoever `engineer()` gives then. The Chief Engineer never walks to look for the engineer that has the engine. The NPC engineer takes the order only when its own first name leads the line (`saidTo`), so a PDA to someone else never reaches it.
- Ran a throwaway script (bun, outside the repo). A Chief Engineer had "Jo Player" then "Sam Rees" (both Station Engineer) on its PDA, was told "the engine is lit" by Sam, then read integrity 90. Its shut-order step was `{"tool":"message","person":"Jo Player","text":"Jo, the engine is losing integrity. Emitters off, now."}`.
- Two mends to the write-up: `forcingReads` does prefer an engineer in sight (see What is wrong), and another owner's NPC engineer is not a failing case.
- Not a duplicate. HOLE-08 and HOLE-13 describe the general pattern and do not mention engineering. This file adds the engineering case and its fix.
- Nothing in the change log or `LLM_CREW_PLAN_ENGINEERING.md` decides who among several engineers is ordered. The plan assumes one.
- Severity medium, not high. It needs a second engineer aboard who is not a working NPC (a player, or a dead or lost PDA), listed first or in the Chief Engineer's sight. Every round so far has had one engineer. Where it does happen it is the safety order that goes astray, so it should be fixed with ENG-01. Effort medium stands: window only, in `chiefengineer.ts`, `forcing.ts` and `types.ts`.
- The fix is sound and keeps the senses-only rule: step 1 takes the name from who said the set words. One addition for step 1: the meeting's `lightStep` gives the engine to the first engineer present, who may be the player. The NPC then starts by itself after `STANDING_DS` and says "the engine is lit", so take the name from `LIT_WORDS` over `ENGINE_TAKEN_WORDS` when the two differ.

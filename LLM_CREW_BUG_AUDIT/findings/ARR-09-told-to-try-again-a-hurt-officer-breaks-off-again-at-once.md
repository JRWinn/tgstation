---
id: ARR-09
title: Told to try again, security that is still under half its health breaks off again the same second, and says so again
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:359, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:253, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:442, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:806
fix: Remember the health it was told to try again at, and break off again only when it has lost a good deal more since
---

## What is wrong

See also: SEC-03 (on the server, the arrest it breaks off from goes on running). Fixing this one sends a hurt officer back into fights, so SEC-03 matters more once it is done.

Under half its health security breaks off and uses no more force. The Head of Security tells the Captain, in fixed words: "I am hurt, and will use no more force. Say "try again" and I will." The plan (`LLM_CREW_PLAN_SECURITY.md:269`) says the same: no force again that round "unless the Captain tells it to: try again. It has no way to heal."

The Captain's "try again" does nothing that lasts. `arrestAgain` sets `beat.hurt = false`. The very next time the server sends its state, `syncBeat` looks at its health, finds it still under 50 and `beat.hurt` false, and breaks off all over again: `beat.hurt = true`, and a new "hurt" outcome is pushed. Nothing aboard heals a crew member, so its health is the same as it was. No try is made in between: `serveStep` reads `beat.hurt` when the driver next asks for a step, and by then it is true again.

One case, with a Head of Security and one officer:

1. Pun Pun beats the officer to 40. `syncBeat` sets `hurt`, and the officer sends "Joan, I could not take Pun Pun. I am hurt."
2. The Head of Security sets `officerOut = 'hurt'`, tells the Captain "Hale could not take Pun Pun and is hurt. I am serving the warrants myself", and takes the warrant.
3. The Captain sends "try again". `deskTakes` clears `officerOut`, calls `arrestAgain` on the Head of Security, answers "Captain, we will try again", and tells the officer "Hale, you are to make arrests again."
4. With `officerOut` cleared, `syncDesk` hands the warrant back to the officer (`handBack`, then the give task).
5. The officer reads "make arrests again": `arrestAgain` sets `hurt = false`. At the end of the same pass `syncTasks` runs `syncBeat`: health 40, `hurt` false, so `hurt = true` and a second "hurt" outcome. It sends "Joan, I could not take Pun Pun. I am hurt." again.
6. The Head of Security sets `officerOut = 'hurt'` again and tells the Captain the same thing again.

Where the Head of Security serves the warrants itself and is the one under half health, it is shorter and plainer: the Captain says "try again", it answers "Captain, we will try again", and on its next pass sends "Captain, I could not take Pun Pun. I am hurt, and will use no more force. Say "try again" and I will." For the rest of the round the Captain can say it as often as they like.

So the one order the crew tell the Captain to give is the one order that cannot be obeyed.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:359`, in `syncBeat`:

    if (security && security.health < HURT_BELOW && !beat.hurt) {
      beat.hurt = true;
      beat.hurtAt = brain.now;
      const about =
        beat.warrants.find((it) => target(brain, it) || holds(brain, it)) ??
        beat.warrants[0];
      beat.outcomes.push({ what: 'hurt', name: about?.name ?? '' });
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:253`:

    export function arrestAgain(brain: NpcBrain): void {
      const beat = beatOf(brain);
      beat.hurt = false;
      for (const warrant of beat.warrants) {
        warrant.tries = 0;
        warrant.restUntil = 0;
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:442`, in `deskTakes` (the Captain's order), and `:806` (the promise):

    if (captain && TRY_AGAIN_WORDS.test(text)) {
      desk.officerOut = null;
      arrestAgain(brain);

    `Captain, ${outcome.name ? `I could not take ${outcome.name}. ` : ''}I am hurt, and will use no more force. Say "try again" and I will.`,

The order of work in one pass is in `brain.ts`: the events are read first (`readsMessage` and `overhears`, which reach `arrestAgain`), then `syncTasks(brain)` (which runs `syncBeat`), then `drive`. So `hurt` is true again before any step is planned.

`security.health` is the body's own health as a percentage (`security_state` in `crew_npc_security.dm:1657`). Nothing in `code/modules/llm_crew/` heals a body.

## How it was found

Read from the code. Not seen in a round: no round log has a "try again" after an officer was hurt. The simulator's `hurt` scenario (`tools/llm_crew/sim.ts:1988`) stops at "breaks off and tells the Head of Security" and never sends "try again", so nothing has run this path.

## How to fix it

1. In `BeatWork` (`types.ts`) add `againAt?: number`, the health it had when it was last told to try again.
2. In `arrestAgain`, set `beat.againAt = brain.security?.health ?? HURT_BELOW` as well as clearing `hurt`. Not `?? 0`: with no security state yet, 0 would let it fight on down to the floor. `arrestAgain` is the one place both the officer (`officer.ts:363`, "make arrests again") and the Head of Security (`deskTakes`, "try again") come through, so this covers both.
3. In `syncBeat`, change the test to break off when `health < HURT_BELOW` and either `againAt` is undefined, or the health has fallen a good way below it (say 15 points, a named constant), or it is under a floor (say 20). Clear `againAt` whenever the health is back at or above `HURT_BELOW`, so that a healed officer breaks off at half health again as it does now.
4. Keep the rest as it is: on breaking off the second time it reports "hurt" once more, which is right, because it is a new breaking off.
5. The question for the owner: how much more hurt may it get, after being told to try again, before it refuses outright. The plan's question 7 chose "breaks off and tells the Captain" and did not say what "try again" buys. 15 points and a floor of 20 is a guess.

KNA-08 (a hurt officer does not defend itself) and KNA-09 (`officerOut` is never cleared) touch the same lines: do them in one sitting.

## How to test the fix

- Add to the `hurt` scenario in `tools/llm_crew/sim.ts`: after the officer has broken off at 40, have the Captain send "try again", and check that the officer's next step for the warrant is an `arrest` with `how: 'force'`, that no second "I am hurt" is sent while its health stays at 40, and that one is sent when its health is dropped to 20.
- A case in `tools/llm_crew/security.ts` is not enough: the fault is in `syncBeat`, which the table does not run.
- In a round: `pda.log` should show "we will try again" followed by an arrest in `game.log` ("hit X with its baton"), not by a second "is hurt. I am serving the warrants myself".

## Check

Checked by Opus 5.5. Confirmed.

- Read `arrestAgain` (`arrests.ts:253`) and `syncBeat` (`:359`): `arrestAgain` clears `hurt`, and `syncBeat`'s test is only `health < HURT_BELOW && !beat.hurt`, with nothing to say it was told to try again. Both job files call `syncBeat` from their `syncTasks` (`officer.ts:143`, `headofsecurity.ts:124`). In `brain.ts` the PDA events (`readsMessage`, about line 592) are read before `syncTasks(brain)` (line 746) in the same pass, and `brain.security` is already set from the same state, so `hurt` is true again before `drive` runs. `security_state` (`crew_npc_security.dm:1657`) sends `body.health / maxHealth * 100`; nothing in `code/modules/llm_crew/` heals.
- Ran a throwaway script (scratchpad `arr09.ts`, bun from `tools/bootstrap/.cache`, importing `tools/llm_crew/fixtures` and `jobs/arrests`): an officer at health 40 with a force warrant. `syncBeat` gave `hurt` true and a "hurt" outcome; `arrestAgain` set `hurt` false; the next `syncBeat` set it true again with a second "hurt" outcome, and the warrant's plan was "You are hurt, and use no force until you are told to try again." (not ready).
- The change log (`LLM_CREW_CHANGELOG.md:585`, "The Captain saying "try again" ... sets both making arrests again") says the order was meant to work. Nothing later fixes it.
- Severity lowered to medium: the order only goes wrong when a Captain says "try again" to a hurt officer, which is less common than the break-off itself, and nothing loops unless the Captain says it again. The fix is sound and small; the threshold is the owner's call, as step 5 says.

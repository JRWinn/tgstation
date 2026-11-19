---
id: ARR-10
title: Short of cuffs, or of a working baton once force is called for, with the person in sight it neither goes for its kit nor tells anyone
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:337, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:762, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:395, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1127
fix: Let wantsKit send it for its kit while on lead when the kit is what stops the arrest, and tell whoever keeps the list at once that it is short
---

## What is wrong

Three rules meet and leave security standing still, silent, for as long as the person it is after stays in sight.

1. `wantsKit` will not send it for its kit while `onLead` is true: the person is in sight, held, or was seen by it in the last two minutes (change log 14:15 entry, H2: "The officer does not go to the lockers while it is after someone").
2. `serveStep` will not try the arrest without what it needs: with no cuffs it returns "you have no cuffs to hand", and with `warrant.force` set and no charged baton "you have no baton to hand". Both are `ready: false` with no `wait`.
3. The only word that it is short is `cannot(name, 'no baton')`, and that needs `beat.kitTries >= 1`: a trip to the lockers that came to nothing. With no trip made, `kitTries` is 0. And any trip that got something sets it back to 0. There is no word at all for "no cuffs", other than the `lacks` line in a staff meeting report, which waits for the next meeting.

So with the person in sight it does not fetch, does not try, and does not say. The driver finds nothing ready, the job keeps its post (`keepsPost`), and `nextStep` gives null. It stands and watches. Two minutes after they leave its sight `onLead` goes false and it sets off for the lockers, but someone who stays put (Pun Pun on a bar stool, a player arguing in the office, someone across a counter) keeps it there for good.

The comment on the arrest's own `no_baton` and `no_cuffs` answers says "its kit comes next", and resets `kitTries` to 0. While they are in sight it does not come next, and the reset also clears the one count that the "no baton" word waits on.

How it comes to be short with someone in sight, in an ordinary round:

- **The baton goes flat.** `has_baton` is `baton_carried(TRUE)`: a baton with charge for one more hit. Each hit that lands costs charge, a force arrest is up to three hits, and nothing aboard recharges a crew member's baton. Pun Pun is arrested again and again in the test rounds. Once the baton is flat, the next time the monkey will not stand still (`reason: 'moved'` sets `warrant.force`), the plan is "no baton to hand" with the monkey in front of it.
- **The cuffs stay on the last prisoner.** `put_in_cell` leaves anyone who is not a crew NPC in the officer's cuffs ("Anyone else is left in them"). With a second warrant on someone in sight at that moment (they followed it to the brig, or it meets them on the way back), it has no cuffs and will not go for more.
- **The Head of Security serving a warrant itself.** It calls `syncBeat(brain, false)`, so it carries no kit until it has a warrant. Given one with the person in sight (the Captain declaring it in the office with a trespasser standing there), it never goes for the cuffs while they stay.

One concrete case: the officer has jailed Pun Pun twice; its baton has charge for no more hits. A new warrant for Pun Pun comes in. It finds the monkey in the Bar, says the line, and the quiet arrest fails with `moved`, so `warrant.force = true`. Next plan: "Pun Pun is here and will not stand still, and you have no baton to hand." `wantsKit` is false because the monkey is in sight. `kitTries` is 0, so no "no baton" word. The Head of Security's list reads "still wanted". The officer stands in the Bar Lounge until the monkey wanders out of sight and two more minutes go by.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:337`, `wantsKit`:

    return (
      !!security &&
      (!security.has_baton || !security.has_cuffs) &&
      !security.holding &&
      // Not while it is after someone: a trip to the lockers is a minute with its back to them.
      !onLead(brain) &&
      (beat.kitTries < KIT_TRIES || brain.now - beat.kitAt > KIT_AGAIN_DS)
    );

`jobs/arrests.ts:762`, in `serveStep`:

    if (force && !security?.has_baton) {
      return {
        ready: false,
        step: `${seen.name} is here and will not stand still, and you have no baton to hand.`,
      };
    }
    if (!security?.has_cuffs) {
      return {
        ready: false,
        step: `${seen.name} is here, and you have no cuffs to hand.`,
      };
    }

`jobs/arrests.ts:395`, in `syncBeat`, the only word that it is short:

    if (
      security &&
      !security.has_baton &&
      warrant.force &&
      beat.kitTries >= 1
    ) {
      cannot(warrant.name, 'no baton');
    }

`jobs/arrests.ts:1127`, in `beatAfterActing`:

    // Short of its kit: that is not a try at them, and its kit comes next.
    if (reason === 'no_baton' || reason === 'no_cuffs') {
      beat.kitTries = 0;
      return;
    }

`code/modules/llm_crew/crew_npc_security.dm:434`, what counts as having a baton:

    /datum/ai_controller/crew_npc/proc/is_live_baton(obj/item/thing)
    	var/obj/item/melee/baton/security/baton = thing
    	return istype(baton) && !isnull(baton.cell) && baton.cell.charge >= baton.cell_hit_cost

## How it was found

Read from the code, the window and the server. Not seen in a round: the rounds read by the change log did not run long enough for the baton to go flat.

## How to fix it

1. In `wantsKit`, let the kit trip go ahead while `onLead` when the kit is what stops the arrest: no cuffs, or no baton with a warrant in sight whose `force` is set. Keep H2 for the rest (cuffs on and a baton short, with someone who has stood still so far: the quiet arrest needs no baton). Do not send it while it holds someone (`security.holding`), as now.
2. In `syncBeat`, tell whoever keeps the list once, at the moment it is short and the person is in sight: `cannot(warrant.name, 'no cuffs')` when `!security.has_cuffs`, and `cannot(warrant.name, 'no baton')` when `warrant.force && !security.has_baton`, without the `kitTries >= 1` condition in that case. The desk already passes "cannot" on to the Captain (`deskOutcome`).
3. In `beatAfterActing`, keep the reset of `kitTries` for `no_baton` and `no_cuffs`, but only once the kit trip it is meant to lead to can happen (step 1 makes it true).
4. If the owner wants the suspect watched rather than left, the question is: should security stand and call the Head of Security for cuffs, or go for them? The plan's H2 answer was "do not leave them". It did not foresee having nothing to arrest them with.

## How to test the fix

- `tools/llm_crew/security.ts`: add cases where `security.has_cuffs` is false and a warrant's person is in view, and where `has_baton` is false and `force` is set. `syncBeat` should open the `security_kit` task and push one `cannot` outcome; `planBeat` on the serve task should still say why it is not arresting.
- A simulator scenario: the officer starts with a flat baton and Pun Pun in the Bar who will not stand still. It should go to the lockers, come back, and arrest; the Head of Security should hear "I cannot bring in Pun Pun: no baton" once.
- In the next round, grep `game.log` for `found no baton` and `has its baton and cuffs` after an arrest, and `pda.log` for "no baton" or "no cuffs".

## Check

Checked by Opus 5.5, from the code. Nothing was run.

- The quotes are what the code says: `wantsKit` (`arrests.ts:337`), the two `ready: false` branches in `serveStep` (about 762), the `kitTries >= 1` condition in `syncBeat` (about 395), the `kitTries = 0` reset in `beatAfterActing` (about 1127), `is_live_baton` and the `has_baton`/`has_cuffs` snapshot (`crew_npc_security.dm:434`, `:1654`).
- Traced: with the person in sight, `target()` is true, so `onLead` is true and `wantsKit` false; `keep(KIT, false)` closes the kit task. The serve task is an emergency whose plan is not ready and has no `wait`, so `nextStep` skips it, finds nothing ready, and the officer's `keepsPost: true` (`officer.ts:407`) returns null. `serveStep` never sends an arrest in either case, so the server's own `no_baton`/`no_cuffs` answers do not come either.
- The only other word that it is short is the officer's `lacks` line ("a stun baton and a pair of cuffs"), and that goes out only in a staff meeting report (`meetings.ts`). It is not sent when it happens.
- `put_in_cell` leaves the cuffs on anyone who is not a crew NPC (`crew_npc_security.dm:1140`, `cuffs_left`), so being short of cuffs right after a jailing is ordinary.
- Change log, 14:15 entry: H2 built `onLead` against trips to the lockers that came to nothing; its plan (`LLM_CREW_PLAN_ROUND_1428_SECURITY.md`, H2) says "Mostly moot once C1 is fixed". It did not weigh having nothing to make the arrest with. The same entry's "Known and not fixed" says the officer with no baton "tries the cuffs once and then stands by the suspect. It now says so, and stays." It no longer says so: the word waits on `kitTries >= 1`, and any trip that got something, or the arrest's own `no_baton` answer, sets `kitTries` to 0. The finding adds the cause and the fix to that known fault, as FORMAT.md rule 4 allows.
- The fix keeps the rules: the kit comes from the security lockers by the body's own `get_kit`. A recharger in the Security Office would be the other honest way to mend a flat baton; nothing uses one today, so the lockers are the way. Severity medium and effort small stand.

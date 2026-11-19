---
id: MULTI-08
title: A janitor being seen out after the job it was sent for is reported as one who would not go, and gets a trespass warrant, whenever the walk out fails for any reason of the technician's own
kind: bug
severity: high
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:332, code/modules/llm_crew/crew_npc_guarding.dm:204, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:370, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:128
fix: Report would_not_go from the server only when the person broke the hold themselves, and never push someone who was sent for (stranger.sent) onto couldNot
---

## What is wrong

See also: API-01, which is the same report made when the technician never reached the person. That fix (a field from `put_out` in place of the English) does not cover this case, because here it is `put_out` itself that says the wrong thing.

When a technician's walk out with someone ends and they are not out, `put_out` answers "You could not get [name] out of [post]: [reason]", and with no reason it says "they got away from you". The window (`wantedAfterActing`) takes any `throw_out` that failed with "could not get" in its words as the person refusing to go, pushes them onto `known.couldNot`, and the technician tells its head "I could not put [name] out of the Cargo Bay." The head (`readWanted` / `wantedOverhears`) declares a warrant for trespass by PDA to security (`declareTrespass`). Security arrests them.

Nothing on either side asks why the walk ended. A walk can fail for reasons that are all the technician's: it is knocked down or stunned on the way (the walk leaf is closed with no reason, so `put_out` gets `reason = null` and says "they got away from you"), it takes longer than `CREW_NPC_EVICT_HOLD` (40 seconds), or there is no way to the spot outside. And nothing asks who was being walked out. The person most often walked out of a cargo room is not a trespasser at all. It is the janitor a technician sent for: once the mess is cleaned, `syncGuarding` sets `seenOut` and verdict `go`, says "Thank you, Ysabel, that is all that was wanted in here. ... I will see you to the door", and calls `throw_out`.

One concrete case, the standing test crew:

1. Maria sends for Ysabel to clean oil in the Cargo Bay and lets her in. Ysabel mops it. The floor where she mopped is wet.
2. The mess is gone. `welcomeStands` is false; after `WELCOME_GRACE_DS` Maria's record for Ysabel has `seenOut` and verdict `go`. Maria thanks her and calls `throw_out`. `take_hold_of` takes Ysabel by the arm and starts the walk to the lobby.
3. The walk fails: Maria slips on the floor Ysabel has just mopped and is knocked down, or the way to the spot past the door is held up for 40 seconds by the crates of a shuttle being unloaded. The walk ends without reaching the lobby. `put_out(FALSE, null)`: "You could not get Ysabel ... out of Cargo Bay: they got away from you."
4. `wantedAfterActing`: `act.tool === 'throw_out'`, not ok, Maria is not security, `WOULD_NOT_GO` (/could not get/) matches. Ysabel goes onto `couldNot`.
5. `syncWanted`: Maria is not a head, so she tells hers: "Quinn, I could not put Ysabel ... out of the Cargo Bay." The Quartermaster is a head: `declareTrespass(brain, "Ysabel ...", "Cargo Bay")`, a warrant line to the Head of Security.
6. The Head of Security gives it to the officer, who finds Ysabel, says "Ysabel, you are under arrest, for trespass in the Cargo Bay. Stand still.", cuffs her and puts her in a cell for five minutes, for cleaning the floor she was sent to clean.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:332`, `wantedAfterActing`, which asks neither why nor who:

    if (
      act.tool !== 'throw_out' ||
      ok ||
      isSecurity(brain.job) ||
      !WOULD_NOT_GO.test(text)
    ) {
      return;
    }
    ...
    known.couldNot.push({ name, place, at: brain.now, done: false });

`code/modules/llm_crew/crew_npc_guarding.dm:204`, `put_out`, which blames the person for any failure:

    	else
    		action_result(CREW_TOOL_EVICT, FALSE, "You could not get [person.name] out of [post_place]: [reason || "they got away from you"].")

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:370`, where a janitor who was sent for is set to be walked out once the mess is gone:

    if (stranger.verdict === 'stay' && stranger.sent) {
      if (welcomeStands(brain, name)) {
        stranger.overAt = undefined;
      } else {
        stranger.overAt ??= brain.now;
        ...
          stranger.seenOut = true;
          settle(brain, name, stranger, 'go');

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:128`, `declareTrespass`, which turns it into a warrant with no further check.

## How it was found

Read from the code. Not seen in a round: no round log yet has a seen-out walk that failed. Not checked: exactly which of slipping, a timeout or a shut way is commonest; any of them is enough, hence `likely`. The slip case depends on whether a knockdown on a wet floor breaks the pull and the walk in this build, which was not tested.

## How to fix it

1. Server, `put_out`: say why the walk ended in the details, not only in words: `"would_not_go" = TRUE` only when the walk leaf failed because the hold was broken (`fail_reason == "they got away from you"` from the motor's `isnull(puller.pulling)` check) and the person is not down, not cuffed and not lying in a chair. For a timeout, no way, or the body itself being knocked down, `would_not_go = FALSE` and the words say so ("You could not get Ysabel out: you slipped").
2. Window, `wantedAfterActing`: test `details.would_not_go`, as API-01 proposes, in place of the English.
3. Window, `wantedAfterActing`: never push onto `couldNot` someone whose stranger record has `sent` (or `seenOut`) set. Someone who was sent for and is slow to leave is seen out again, not reported. If they really will not go, the owner can decide whether that is a matter for the head; it should not be a warrant on the strength of one failed walk.
4. Owner's question: should a single failed walk out ever be enough for a trespass warrant, or should it take the person being asked to leave, refusing, and breaking the hold?

## How to test the fix

- `tools/llm_crew/security.ts` table: `wantedAfterActing` with a throw_out failure for a stranger whose record has `sent: true` adds nothing to `couldNot`; one with `would_not_go: false` adds nothing.
- Simulator: technician, janitor sent for, mess cleaned, the sim answers the seeing-out `throw_out` with failure and no `would_not_go`. No "I could not put" line, no warrant.
- In a round, grep `pda.log` for "warrant" lines naming a janitor, and `game.log` for "could not put" next to a janitor's name.

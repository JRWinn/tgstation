---
id: MULTI-08
title: A janitor being seen out after the job it was sent for is reported as one who would not go, and gets a trespass warrant, whenever the walk out fails for any reason of the technician's own
kind: bug
severity: high
effort: small
confidence: likely
status: fixed
fixed_in: bd93759d5eb
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:332, code/modules/llm_crew/crew_npc_guarding.dm:204, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:370, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:128
fix: Never push someone being seen out (stranger.seenOut, not ordered out) onto couldNot, and have put_out say would_not_go only when the hold was lost with the technician still on its feet
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
3. Window, `wantedAfterActing`: never push onto `couldNot` someone whose stranger record (`brain.strangers[name]`) has `seenOut` set and no `orderedBy`. Test `seenOut`, not `sent`: when a superior orders a sent-for person out (`PUT_OUT_WORDS` in `guarding.ts`), the record keeps `sent: true` but gets `orderedBy` and `seenOut = false`, and that walk failing should still be reported. This step alone settles the janitor case and is a few lines in one file. Someone who was sent for and is slow to leave is seen out again, not reported. If they really will not go, the owner can decide whether that is a matter for the head; it should not be a warrant on the strength of one failed walk.
4. Owner's question: should a single failed walk out ever be enough for a trespass warrant, or should it take the person being asked to leave, refusing, and breaking the hold?

## How to test the fix

- `tools/llm_crew/security.ts` already calls `wantedAfterActing` (line 211). Add beside it: a throw_out failure for a stranger whose record has `seenOut: true` adds nothing to `couldNot`; one whose record has `sent: true, orderedBy: 'Quinn ...'` still adds them; one with `would_not_go: false` adds nothing.
- Simulator: technician, janitor sent for, mess cleaned, the sim answers the seeing-out `throw_out` with failure and no `would_not_go`. No "I could not put" line, no warrant.
- In a round, grep `pda.log` for "warrant" lines naming a janitor, and `game.log` for "could not put" next to a janitor's name.

## Check

Checked by Opus 5.5, from the code. Not run, not seen in a round.

- The quotes are what the code says today: `wantedAfterActing` (`wanted.ts:332`, `WOULD_NOT_GO = /\bcould not get\b|\bcannot get a hold\b/i` at line 58), `put_out` (`crew_npc_guarding.dm:205`), the seen-out branch of `syncGuarding` (`guarding.ts:370`), and `planGuarding`, which for a `seenOut` stranger says "Thank you ... I will see you to the door" and then sends `throw_out` (`guarding.ts:535-555`). `driver.ts:972` passes the result text of every action to `wantedAfterActing`.
- Every way the walk can fail gives words that match `WOULD_NOT_GO`. The walk leaf (`crew_npc_motor.dm:100-140`) fails with "it was taking too long" after `CREW_NPC_EVICT_HOLD` (40 s), "they got away from you" when `puller.pulling` is null, or `CREW_NPC_NO_WAY`; a leaf ended with no reason also comes to `put_out` as null, which prints "they got away from you". `clear_the_way` is skipped for an evict walk (`crew_npc_grip.dm:430`). `put_out` then says "You could not get X out of Y: ..." for all of them.
- The janitor cannot be the one at fault if it is a crew NPC: `taken_hold_of` stands it still, and `handle_tool_call` refuses every tool but say and hold while `in_hand_until` runs (`crew_npc_tools.dm:20`). So for a crew NPC being walked out, a failed walk is always the technician's own.
- A janitor does not "belong" in the Cargo Bay (`belongs_in_post` is door access), so `why_not_put_out` does not stop the walk. Nothing in `syncWanted` or `declareTrespass` asks whether the person was sent for. After the failed walk the stranger stays at verdict `go` and the technician tries again, but `couldNot` already holds the name, so the head is told and the warrant declared even if the second walk succeeds.
- Not checked: whether a slip on a wet floor ends the pull or the walk leaf in this build (`on_pull_blocked_trait_gain` in `code/modules/mob/living/init_signals.dm` stops pulling when `TRAIT_PULL_BLOCKED` is added; whether a knockdown adds it was not traced). The timeout and no-way cases do not depend on it.
- Not in the change log or plans as known; the change log's trespass section (`LLM_CREW_CHANGELOG.md` near line 601) describes the report as meant for someone who would not go.
- Severity kept high: the wrong person is arrested. How often a seeing-out walk fails is not known, which is why confidence stays `likely`. Effort small for step 3, which is enough on its own; step 1 shares the details field with API-01 (confirmed). Changed the fix to test `seenOut` without `orderedBy` instead of `sent`, since an order from a superior leaves `sent` set.

Round A1 (a-secsrv, compile only), the server step for the owner's answer B (told to leave, refused, broke the hold): `put_out` (`crew_npc_guarding.dm`) adds `would_not_go` and `person` to a failed `throw_out`'s details. `would_not_go` is TRUE only when the walk leaf lost the pull ("they got away from you", not a null reason), the body itself was not down, and the person was not down, cuffed or strapped to a seat. The window's part (told to leave and refused, and the warrant only on `would_not_go`) is a-secwin's and a-cargo's.

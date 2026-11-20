---
id: PLAY-12
title: A collector who gives up hauling a crate tells nobody, not its head and not the Quartermaster, where the crate lies
kind: gap
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:298, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:740, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:200, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:649, code/modules/llm_crew/crew_npc_held.dm:436, code/modules/llm_crew/crew_npc_grip.dm:334, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:300
fix: When a collect_crate haul is given up, have pickupsAfterActing PDA the head who sent it with the crate number and where it lies, and have the head send the next of its staff for it
---

## What is wrong

A crew member sent by its head to collect a crate (the `collect` task in `jobs/pickups.ts`) can lose its grip on the crate too often on the way. The server then gives the haul up, tries to put the crate clear of the doors, and reports the haul as failed with `gave_up` in the details. The window stores this in `brain.gaveUp`. Only cargo technicians ever act on `brain.gaveUp`, and only for four tools (`unload`, `recycle`, `release`, `stow_crate`). For a collector, nothing reads it. The collector does not PDA its head and does not tell the Quartermaster. It goes on to its next job. The crate lies in a hallway, still counted as "out" for collection, and nobody who could decide what to do about it is told.

It should tell whoever sent it: which crate, that it could not get it there, and where it is lying. That is what a player would do, and it is what the brain's own comment says is the job's to do.

The case from round-15.44.36:

1. Sunshine Langston (Head of Personnel) sends Dortha Matthews (Janitor) for crate #2, to take to the Custodial Closet.
2. Dortha collects it at the Cargo Lobby and sets off (`collect_crate`).
3. In the Central Primary Hallway the crate catches four times in six seconds, at (104,116), with Pun Pun on the tile between her and the crate. Three regrips, then the server gives the haul up.
4. `put_clear` cannot get it clear of the doors either. The crate is left by the Corporate Showroom firelock.
5. `crate_collected(FALSE, ...)` sends the brain an `action_result` with `gave_up`, `crate` and `number`. There is no `left_in`, because it is not clear of the doors.
6. Dortha's brain sets `brain.gaveUp`, puts the `collect_crate` step on hold for 20 seconds (`fail` in `driver.ts`), and goes off to clean a mess Kailyn called her to.
7. No PDA message goes to Sunshine. Nothing is said to Tyson Jones (Quartermaster).

The collector's own task is not ended either. `syncPickups` only ends a COLLECT task when it is unpacked or `taken_by` names someone else, and `crate_collected` has just set `collected_by = null`. The crate is still `out`, so once the driver's backoff on `collect_crate` runs out (20 seconds, then 40, and more), `planPickups` sends the collector back to haul it again. In this round Dortha's cleaning call came first and Hayden had the crate before she went back. In a round where the head does send someone else, the two can end up after the same crate (MULTI-07). In a round where nobody else is sent, the collector tries again and again, and the head hears nothing each time.

Sunshine did send Hayden Griffiths for crate #2 four seconds later, but not because of anything Dortha said. Kailyn had started passing word that crate #2 was "still waiting to be collected" at 22:06:14, before Dortha had even taken hold of it. That word reached Tyson, and Tyson's routine PDA ("Still waiting at cargo: crate #2") reached Sunshine at 22:07:02, three seconds before Dortha gave up. So the head was told the crate was at cargo when it was lying in a hallway. It was luck that someone else was sent at all.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:740`, in `ingest`. The give-up is stored, and the comment leaves the rest to the job:

      // A haul it gave up on: the crate got away too often, or there was no way through with it.
      // What its job makes of that, such as telling its head, is for the job.
      if (event.details.gave_up && typeof event.details.tool === 'string') {
        const number = Number(event.details.number);
        const named = String(event.details.crate ?? 'crate').replace(/\./g, '');
        brain.gaveUp = {
          tool: event.details.tool,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:200`. The only tools a give-up is ever told of. `collect_crate` and `take_back` are not here:

    const WONT_COME_HOW: Record<string, string> = {
      unload: 'off the shuttle',
      recycle: 'aboard the shuttle',
      release: 'out to the lobby',
      stow_crate: 'clear of the door',
    };

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:649`, `syncWontCome`. The one reader of `brain.gaveUp` that does anything. It is part of the cargo job, so it never runs for a janitor, and it needs `wontComeHow` to name the tool:

    function syncWontCome(brain: NpcBrain): void {
      const gaveUp = brain.gaveUp;
      const how = gaveUp ? wontComeHow(gaveUp.tool) : null;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:298`, `pickupsAfterActing`. The collect task's handler for a result. It only acts on a success:

    export function pickupsAfterActing(
      brain: NpcBrain,
      act: Action,
      task: Task | undefined,
      ok: boolean,
    ): void {
      if (task?.kind !== COLLECT) {
        return;
      }
      if (act.tool === 'collect_crate' && ok) {
        task.unpacked = true;

The only message `pickups.ts` ever sends the head about a failure is the "no crate #N to collect" line in `pickupsOverhear`, which is for cargo saying there is no such crate.

`code/modules/llm_crew/crew_npc_held.dm:436`, in `crate_collected`. The server's side is fine: the crate is freed for anyone to take and the brain is told:

    	// Left where it stopped, it is still there for the taking.
    	if(entry)
    		entry.collected_by = null
    	var/list/details = list("place" = place)
    	var/blocker = in_the_way_report(hauled, details)
    	action_result(CREW_TOOL_COLLECT, FALSE, "You could not get the [hauled_name] where it was going: [reason || "you lost your grip on it"].[blocker][gave_up_report(details)] You are in [place].", details)

`code/modules/llm_crew/crew_npc_grip.dm:334`, `gave_up_report`. When the crate could not be put clear, the brain is told no place for it at all. `place` is where the body is, not the crate:

    	if(isnull(left_clear_in))
    		return " You could not get it clear of the doors either."
    	details["left_in"] = left_clear_in

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:300`, `sendFor`. The head already knows how to send the next of its staff, skipping the one who did not come. It is only ever started by cargo's "still waiting" word, which is about a crate at cargo, not one lying in a hallway.

## How it was found

Seen in a round log, `data/logs/2026/11/19/round-15.44.36`, then read from the code.

game.log:

    [2026-11-19 22:01:15.900] ... (Sunshine Langston) ... was told by its brain to PDA Dortha Matthews: Dortha, crate #2 of janitorial supplies is waiting at cargo. Take it to the Custodial Closet: ...
    [2026-11-19 22:07:00.095] ... (Dortha Matthews) ... lost its grip on the janitorial supplies crate - #2 (#2 for Sunshine Langston) (collect_crate). The crate was left at Central Primary Hallway (104,116,2); the body was at Central Primary Hallway (106,116,2). Next to the crate: Corporate Showroom firelock YN3gu at (104,117), Corporate Showroom at (104,117) and Pun Pun at (105,116).
    [2026-11-19 22:07:03.574] ... (Dortha Matthews) ... is going back to take up the janitorial supplies crate - #2 (#2 for Sunshine Langston) again: try 3 of 3.
    [2026-11-19 22:07:05.393] ... (Dortha Matthews) ... has given up hauling the janitorial supplies crate - #2 (#2 for Sunshine Langston) (collect_crate: it caught on something and you lost your grip on it) and is putting it clear of the doors. It lies at Central Primary Hallway (104,116,2).
    [2026-11-19 22:07:07.730] ... (Dortha Matthews) ... could not get the janitorial supplies crate - #2 (#2 for Sunshine Langston) clear of the doors. It lies at Central Primary Hallway (104,116,2).

crew_brain.log, Dortha's next steps, both from the routine and not the model:

    [2026-11-19 22:07:10.931] ... "Dortha Matthews" ... ROUTINE (no LLM) in Central Primary Hallway ...: You have a mess to clean up in Service Hallway (Kailyn Patterson told you of it), and you are going there with your space cleaner.
    [2026-11-19 22:07:23.062] ... "Dortha Matthews" ... ROUTINE (no LLM) in Service Hallway ...: Kailyn Patterson called you to a mess in the Bitrunning Den, which is locked to you. ...

pda.log has no message from Dortha between 22:02:44 ("On my way to the Bar Lounge.") and 22:12:14 (to Kailyn, about the Bitrunning Den door). None to Sunshine, none to Tyson. game.log has no line of Dortha saying anything about the crate after 22:07:05.

The head's resend came from cargo's reminder, which began before Dortha took hold of the crate (crew_brain.log 22:06:14, Kailyn: "You have word for Tyson Jones, the Quartermaster, that crate #2 ... is still waiting to be collected"; Dortha's first hauling step is 22:06:23):

    [2026-11-19 22:07:02.708] PDA: ... Tyson Jones to Sunshine Langston ... "Still waiting at cargo: crate #2 from your order. Send someone to the Cargo Lobby counter with the number, please."
    [2026-11-19 22:07:11.271] PDA: ... Sunshine Langston to Hayden Griffiths ... "Hayden, crate #2 of janitorial supplies is waiting at cargo. ..."

Then the code was read: `crate_got_away`, `put_clear`, `put_clear_finished` and `gave_up_report` in `crew_npc_grip.dm`; `crate_collected` in `crew_npc_held.dm`; `ingest` and `noteResult`/`fail` in the window; every use of `gaveUp` in `CrewBrain/` (`grep -rn gaveUp`), which is only `brain.ts` and `jobs/cargo.ts`.

Checked against the audit: KNB-15 notes in passing that `collect_crate` and `take_back` are not hauls `wontComeHow` names, but its fault is word dropped when the Quartermaster is not found. LOGB-07 is about stale `gaveUp` word after a later success. CARGO-18 is about a technician sent for a `release` give-up. None of them is the collector telling nobody. `LLM_CREW_PLAN_DROPPED_CRATES.md` plans the telling only for technicians (lines 17 and 125); collectors are not mentioned.

Not checked: whether the same silence happens after a `take_back` give-up. The code says it does (same `WONT_COME_HOW` gap), but no `take_back` give-up was looked for in this round's log. Not checked either why Pun Pun stood where it did, or how Hayden found crate #2 in the hallway (see JOBS-05).

## How to fix it

1. In `gave_up_report` (`crew_npc_grip.dm`), when `left_clear_in` is null, still give the brain where the crate lies: `details["lies_in"] = get_area_name(crate, TRUE)` if the crate is on a turf. Today the brain knows only where the body is. This step can wait: a give-up happens with the crate only a few tiles behind, so the body's `place` is nearly always the crate's room too (both were Central Primary Hallway here). Without it the fix stays in the window.
2. In `brain.ts` `ingest`, keep that in `brain.gaveUp` as well, as `liesIn`, next to `leftIn`.
3. In `pickupsAfterActing` (`jobs/pickups.ts`), when `act.tool === 'collect_crate'`, `!ok`, `brain.gaveUp?.tool === 'collect_crate'`, `task.askedBy` and `brain.hasPda`: push a PDA line onto `brain.toTell` to `task.askedBy`, the way `pickupsOverhear` does. Fixed words, written by code, with what cannot be done without first, for example: "I could not get crate #2 to the Custodial Closet: it kept getting away from me. It is in the Central Primary Hallway, by a door." Use "clear of the doors" when `leftIn` is set. Then finish the task (`task.reported = true; finishTask`) so the collector does not go back for it on top of whoever the head sends next. Clear `brain.gaveUp` once the line is queued, so it does not linger (LOGB-07 has the same trouble for technicians).
4. In the head's message reading (`jobs/head.ts`, next to the `UNPACKED_WORDS` match), read those fixed words with a crate number and call `sendFor(brain, number)`. `sendFor` already skips the one who did not come when there are others. It holds off a second sender for `SENT_GRACE_DS` after the first was sent; a word that the first one gave up should get past that hold, since nobody is on the way any more. Change the `why` of that line so it does not say the crate is "still waiting" at cargo.
5. The line the second collector is sent should not say "is waiting at cargo" when the crate is in a hallway. Either keep the same line (the collector's `collect_crate` takes it from wherever it lies, as Hayden did) or add the place. The owner may want to choose the words.
6. Do the same for `take_back` in `crate_taken_back`'s path: an empty crate given up on the way back should be told to the Quartermaster. That is cargo's business, so it belongs with `syncWontCome`: add `take_back: 'back to cargo'` to `WONT_COME_HOW` only if the collector can reach `syncWontCome`, which it cannot today. Safer to give the collector its own line to the head for that too. Keep this a separate step; it may want its own finding.

This keeps the rules: the code writes and sends the line, the model writes nothing, and a dead model does not stop it. It is general to every job that collects crates, not to janitors.

## How to test the fix

- Type check and lint of `tgui/packages/tgui/interfaces/CrewBrain/`. Compile the server.
- Simulator (`tools/llm_crew/`): SIM-04 says the stand-in server cannot give a `gave_up` on `collect_crate`. Add that fault first, then a scenario: a head sends a janitor for a crate, the `collect_crate` result comes back with `gave_up`, `number` and `lies_in`. Want: one PDA from the janitor to the head with the number and the place; the janitor's collect task closed; the head sending the other janitor for the same number at once, not after `SENT_GRACE_DS`.
- Next round, in `game.log`, after any line `has given up hauling ... (collect_crate:` look for, within a few seconds, `was told by its brain to PDA <head>: I could not get crate #`. In `pda.log`, the head should then send someone else for that number.

## Check

Checked by Opus 5.5 against the round logs and the code at 99f4d33dd0e. Confirmed.

- The round log says what the finding says. game.log lines 1023 to 1046 show the four lost grips on crate #2, the give-up at 22:07:05.393 and "could not get ... clear of the doors" at 22:07:07.730. crew_brain.log line 839 has Dortha's next step at 22:07:10.931 going to clean in the Service Hallway, from the routine. No PDA or say from Dortha about the crate follows. Sunshine's resend (crew_brain.log line 840, 22:07:11.537) gives its own reason as "Cargo says crate #2 ... is still waiting: Dortha Matthews has not collected it", which is the `before` branch of `sendFor`'s `why`. So the head acted on cargo's reminder, not on anything from Dortha. Sunshine was in the brig at the time, which does not change this.
- The quotes match the code. `brain.ts` sets `brain.gaveUp` at about line 744 with the comment leaving it to the job. `grep -rn gaveUp` in `CrewBrain/` finds it read only in `jobs/cargo.ts` (`syncWontCome`, `wontComeStep` and the prompt line near 1874), all behind `wontComeHow`, which has no `collect_crate` or `take_back`. The `gaveUp` hits in `jobs/arrests.ts` are a different field on a warrant. `pickupsAfterActing` is called from `noteResult` in `driver.ts` for every result, `ok` false included, and only acts on success. `pickupsOverhear` is the only failure word to the head.
- No guard elsewhere tells the head. `head.ts` reads only `UNPACKED_WORDS` from a collector and cargo's "still waiting" word. `SENT_GRACE_DS` is 3000 (5 minutes); Sunshine's resend came about six minutes after the first send, so it was past the hold only by chance.
- Correction added to the write-up: the collector's COLLECT task stays open after the give-up, so it goes back for the crate after the backoff. The fix's step 3 (end the task once the head is told) is needed for that as well, and it stops the two-collector clash of MULTI-07 from starting this way.
- Not a duplicate. MULTI-07 is two collectors fighting over one crate; JOBS-02 is the errand dropped at half an hour; KNB-15, LOGB-07 and CARGO-18 are about technicians and `wontComeHow`. HOLE-06 is word lost when PDAs stop.
- The fix is sound and keeps the rules: fixed words written by code, no model needed, general to any job that collects. Step 1 (a `lies_in` from the server) is optional, as the body's `place` is close enough, so the fix can stay in the window and effort stays medium. One thing to watch in step 4: if the head has only the one collector, `sendFor` sends the same one again, which is right, but its new task must not be ended by the old one's `reported` flag.

Not run: no build, type check or simulator. Not checked: a `take_back` give-up in this round. Hayden had three lost grips on `take_back` at 22:08:40 to 22:08:49 (game.log lines 1128 to 1140); whether that ended in a give-up was not followed.

## Fix so far

Done on branch `p-cargo` (window code only; table `tools/llm_crew/cargo-play.ts`; not played):

- Step 3: `pickupsAfterActing` (`jobs/pickups.ts`), on a failed `collect_crate` with `brain.gaveUp` for `collect_crate`, a head who sent it and a PDA, queues the fixed PDA line "I could not get crate #N to the ROOM. It is left in the PLACE[, clear of the doors]. Could you send someone else for it, please?", ends the errand (`reported`, `finishTask`) and clears `brain.gaveUp`. PLACE is `leftIn` if it was put clear, else where the body is. With no head or no PDA it is left to try again, as before.
- Step 4: the head (`jobs/head.ts`, `readsMessage`) reads those words (`GAVE_UP_WORDS`) from the one it sent for that number and calls `sendFor` with the give-up, which skips `SENT_GRACE_DS` and passes over the one who gave up when there is anyone else. The `why` names where it lies. The line sent (step 5) is kept as it is ("is waiting at cargo"), since the collector's `readPickup` knows the message by those words.

Not done: step 1 (`lies_in` from `gave_up_report`, a .dm file) and step 2 (`brain.ts`), neither owned by this group; the body's place stands in for now. Step 6 (`take_back` give-ups) not done.

Done on branch `m-cargo` (window only; table `tools/llm_crew/cargo-play.ts`, 47 cases; not played):

- Step 2 use: `pickupsAfterActing` now tells the head `brain.gaveUp.liesIn` (the server's `lies_in`, read by `ingest`) when the crate was not put clear, and the body's room only when the server sends neither `left_in` nor `lies_in`.
- Step 6: a failed `take_back` with a `take_back` give-up sends the head who sent it one PDA, "I could not get the empty crate from #N back to cargo. It is left in the PLACE[, clear of the doors]. I will try again." It is told once per errand (`task.toldAt`), `brain.gaveUp` is cleared, and the errand stands so the empty is tried again as before. The words do not match `GAVE_UP_WORDS`, so the head sends nobody. Cargo and the Quartermaster are still not told of a lost empty: that would want the Quartermaster to read the line, which is left.

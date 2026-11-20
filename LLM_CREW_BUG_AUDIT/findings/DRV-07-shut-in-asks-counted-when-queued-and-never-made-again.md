---
id: DRV-07
title: Shut in, a person counts as asked for the door the moment the line is queued, and nobody is asked or knocked for a second time in that stay
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:841, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:346, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:360, tgui/packages/tgui/interfaces/CrewBrain/situation.ts:73, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1359
fix: Mark a helper as asked only when the line is really said, and let an ask and a knock be made again after a couple of minutes with nobody come
---

## What is wrong

See also: ASYNC-05 (the same early `noteDone` in `drive`, for word to tell; fix half 1 here and ASYNC-05 together, by running `noteDone` for a spoken step only once the line is said, rather than with two new fields)

A body that is shut in asks each person it can see to let it out, "once, one at a time", knocks once if nobody is in sight, and sends PDA word to a short list of people. Two things make this give up far sooner than it means to.

**1. The person is marked asked before anything is said.** When the step is a line, `drive` hands it to `speak` (which only sets `brain.mustSay`) and calls `noteDone` straight away. `noteDone` puts the helper's name in `brain.outAsks.asked`. The line itself is said later, when the NPC's turn with the LLM comes (often seconds, sometimes a minute: see DRV-05, BRAIN-02). In `think` the line is said only if someone is still in view (`alone` is `brain.peopleInView.length === 0 && speakers.length === 0`, and the dead-model path checks `brain.peopleInView.length > 0`). So a helper who walks out of sight while the ask waits its turn is never asked, and is down as asked. `whoToAskForTheDoor` skips everyone in `asked`, so when that same person comes back, even to stand at the door, the body says nothing to them.

**2. Nothing is ever made a second time in one stay.** `outAsks` is only cleared when the body's location changes. Until then: everyone in `asked` is never asked again, `knocked` stays true so it never knocks again (unless a knock failed because it was not at the door), and `nextToWrite` runs out after whoever let it in, one door keeper and its head. A body with no PDA (`hasPda` false) knocks once and then does nothing more to be found for the rest of the round, unless someone it has never asked comes into view. Someone walking past the door five minutes after the one knock hears nothing.

One concrete case: a janitor is let into the Cargo Bay's back room by a technician, does its mess, and is shut in. The technician walks past the window as it turns to go; the janitor queues "Maria, could you let me out, please?". The Quartermaster is talking in the bay, so the janitor's turn with the LLM comes eight seconds later, when Maria is out of sight and nobody else is in view: the line is not said, and Maria is in `asked`. There is nobody in sight, so it knocks; Maria is at the far end of the bay and does not hear it. Its PDA word goes to Maria (who let it in, `WORD_OUT_KEY`). If the PDA network is down (the project's notes say station power fails about fifteen minutes in), that is lost too. When Maria comes back past the window, and when she comes to the door for a crate, she is not asked. The janitor stands at the door until somebody new turns up.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:805`, in `drive`, the line is handed over and the step counted as done at once:

      if (step.say) {
        // Asked once; if nothing comes of it, it is left a while before being asked again.
        fail(brain, step.key);
        speak(step.say, step.needs, step.sayIf, step.exact);
        noteDone(brain, step);
        return step;
      }

`driver.ts:841`, `noteDone`:

      if (
        step.asks ||
        step.writes ||
        step.key === KNOCK_OUT_KEY ||
        step.key === WORD_OUT_KEY
      ) {
        brain.outAsks ??= { ... };
        if (step.asks) {
          brain.outAsks.asked.push(step.asks);
        }
        if (step.key === KNOCK_OUT_KEY) {
          brain.outAsks.knocked = true;

`driver.ts:360`, the knock, made only while `knocked` is false:

      if (stuck && !helper && brain.atDoorOf === brain.location) {
        if (!brain.outAsks?.knocked && !inBackoff(brain, KNOCK_OUT_KEY)) {

`tgui/packages/tgui/interfaces/CrewBrain/situation.ts:73`, `whoToAskForTheDoor`, which never offers anyone in `asked`:

      const asked = brain.outAsks?.asked ?? [];
      const people = brain.peopleInView.filter(
        (person) => !asked.includes(person.name),
      );

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1359`, in `think`: the line is only said with someone in view.

      const alone = brain.peopleInView.length === 0 && speakers.length === 0;

`brain.ts:416`, the only place `outAsks` is cleared (with `knocked` cleared on a failed knock in `noteResult`):

      if (brain.location !== npc.location) {
        brain.inPlaceSince = now;
        brain.outAsks = null;

## How it was found

Read from the code. Not run, and not seen in a round log (a round would have to be read for a shut-in body whose ask line was queued and never said; `game.log` has the "was told by its brain to say" lines to check against `crew_brain.log`'s `ROUTINE (no LLM)` "could you let me out" records).

Related, not the same: KNA-02 (a shut-in body is sent away from the door), MEM-13 (with no head aboard it writes to nobody), LOGB-01 (the head who is asked cannot open). The plan for the 13:32 round, item 3 (`LLM_CREW_PLAN_ROUND_1332.md:24`), made "a second knock or ask counts as new" on the hearer's side; nothing makes the shut-in body knock or ask a second time.

## How to fix it

1. Mark the helper asked when the line is said, not when it is queued. `noteDone` for a step with `asks` should only note that the ask is waiting (`outAsks.asking = step.asks`). In `brain.ts`, where the after-saying hooks run (`afterSaying`, in both the LLM and the dead-model paths of `think`), move `outAsks.asking` into `outAsks.asked` if a line was really said. If `think` says nothing (alone, or the line dropped), clear `asking` so the step is offered again when the person is back in view. `fail(brain, SHUT_IN_KEY)` already keeps it from being asked in a tight loop.
2. Let an ask go stale. Keep `asked` as `{ name, at }[]`, and have `whoToAskForTheDoor` offer again anyone asked more than about two minutes ago (`ASK_AGAIN_MS = 120000` beside `NOBODY_CAME_MS`). Whoever let it in first, as now.
3. Let a knock go stale. In `noteDone` keep `knockedAt`; in `nextStep` knock again when `Date.now() - outAsks.knockedAt > ASK_AGAIN_MS` and nobody has come (the body is still shut in, at the door, with nobody in view to ask). This is what a person does, and is the only way left to a body with no PDA.
4. Keep the existing order of things: ask whoever is in sight first, then knock, then PDA. Nothing here touches the server.

Checker's notes on the fix: half 1 is plainly a bug and should be built. `think` does not know which driver step queued the line, so the simplest carrier is a field on the brain set beside `mustSay` (the step's `asks`), read back where `afterSaying` runs; build it with ASYNC-05's fix, which needs the same thing for `tells`. Halves 2 and 3 change a rule the code states on purpose (`whoToAskForTheDoor`: "Each person is asked once. Asked again and again, they would be right to call it nagging"; `nextStep`: "it knocks, once, and sends word, once"). That rule was written by an earlier session, not by the owner as far as the change log shows, but the interval is a design choice: ask the owner whether two minutes is right before building 2 and 3. A repeat knock only helps while the body stays at the door, so it goes with KNA-02's fix (the shut-in body walks off on `explore` once nothing is left to try, as the check below saw).

## How to test the fix

- Type check from `tgui/`.
- A table test with the fixture brain in `tools/llm_crew/`: shut in at the door, one person in view. `drive` once (the ask is queued), then empty `peopleInView` and run the think path with nobody in view; bring the person back: `nextStep` must offer the ask again. Then: nobody in view, knocked 130 seconds ago, still shut in: `nextStep` must offer `knock` again.
- In the simulator's shut-in scenarios (`bun tools/llm_crew/sim.ts quiet` with the ones named for doors or nesting), check that nothing passes that used to pass less often: a body should ask a returning helper once more, never twice in two minutes.
- In a round, `crew_brain.log`: for a body shut in for more than two minutes with nobody coming, there should be a second "knocking at the door" `ROUTINE (no LLM)` record.

## Check

Checked by Opus 5.5. Every quote is what the code says today (`driver.ts:805`, `:841`, `:360`, `situation.ts:73`, `brain.ts:1359`, `brain.ts:416`). Traced: `drive` calls `fail`, `speak` and `noteDone` in one go for a spoken step; the `speak` given by `brain.ts:752` only sets `brain.mustSay` and `wake`; `think` clears `mustSay` at its start and says the line only if `alone` is false (LLM path) or `peopleInView.length > 0` (dead-model path, `brain.ts:1612`), so a line that finds nobody in view is dropped for good while the name is already in `outAsks.asked`. `outAsks` is cleared only on a change of room (`brain.ts:416`), and `knocked` only by a failed knock (`noteResult`). No change log entry or plan undoes either; plan 13:32 item 3 is about the hearer's side, as the finding says.

Ran a throwaway script with bun against the real `driver.ts` and the fixture brain: shut in at the Cargo Bay door with Donna in view, `drive` queued "Donna, could you open the door for me" and `outAsks.asked` was `["Donna Sholl"]` at once; with the line never said and Donna back in view (back-off cleared), `nextStep` gave `knock`, not the ask. With `knocked` and `messaged` set ten minutes before and no PDA, `nextStep` gave `explore`: nothing more is ever tried at the door. Confirmed. Effort raised to medium: half 1 crosses `driver.ts`, `brain.ts` and `types.ts`, and halves 2 and 3 add `situation.ts`.

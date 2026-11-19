---
id: BRAIN-12
title: Any line the NPC says marks every finished task whose asker is in view as reported, so a greeting or one done to Ann leaves the Captain never told
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:422, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1558, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1622, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:486
fix: Mark a finished task reported only when the line said names its asker and was the done line or holds the done words, and say one done line per asker
---

## What is wrong

When an NPC finishes work someone asked for or told it of, the asker is owed word that it is done. `wordOwed` lists those tasks whose asker is in view; the driver says "<first name>, that is done." for the first of them (`driver.ts:486`), and the prompt tells the model "You have finished what X asked for ... tell them now, in "say", that it is done" (`describeWork`, `tasks.ts:434`).

What marks the word as given is `afterSaying(brain)` in `tasks.ts`, and it marks **every** task in `wordOwed`, for every asker in view, as `reported`, after **any** line at all. `think` calls it whenever something was said (`brain.ts:1558`), and in the `catch` after the plain line (`brain.ts:1622`). Nothing looks at what was said or to whom.

So:

1. **Two askers in view.** The driver says "Ann, that is done." for Ann's task. Both Ann's task and the Captain's are marked reported. The Captain is never told.
2. **An unrelated line.** The NPC answers a question, greets someone who has just come into view, or passes a remark, while a task is done for someone in view and the driver has not yet said the done line (it says nothing while the body is busy walking or working, `drive` returns null). The model's line does not have to say anything about the task, and often does not: the done line is one item at the end of a long prompt. The task is marked reported all the same.
3. **The model fails.** The `catch` says the plain line its work called for, whatever it was ("Sam, could you open the door?"), and marks every owed task reported.

There is no second chance: `wordOwed` skips reported tasks, and DESK-07 notes there is no PDA fallback either.

One concrete case:

1. The Captain told janitor Bob of a mess in the Bar, and the Bartender, Ann, asked him to clean the Kitchen. Bob cleans both; both tasks are `done`, `askedBy` the Captain and Ann, not reported.
2. Bob walks into the Bar, where both are. Next ingest, `nextStep` gives `wordOwed(brain)[0]`, whichever of the two is first in `brain.tasks`; say Ann's: "Ann, that is done."
3. `think` says it (plain or in the model's words). `afterSaying(brain)` sets `reported = true` on both tasks.
4. The Captain is not told the Bar is clean. Asked, Bob's prompt no longer says it is owed.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:421`:

    /** Notes that the NPC has spoken, which tells anyone in view who was waiting to hear a task was done. */
    export function afterSaying(brain: NpcBrain): void {
      for (const task of wordOwed(brain)) {
        task.reported = true;
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1557`, in `think`, run after any say:

      // Anyone in view who was waiting to hear that a task was done has now been told.
      afterSaying(brain);

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:486`, one line, for the first owed task only:

      const owed = wordOwed(brain)[0];
      if (owed?.askedBy) {
        const what = job.describeTask?.(owed) ?? owed.kind;
        const say = `${owed.askedBy.split(' ')[0]}, ${job.sayDone?.(owed) ?? 'that is done'}.`;

## How it was found

Read from the code. Not seen in a round: the log does not record `reported`, and it takes two askers in view, or an answer said while word is owed, for it to show.

## How to fix it

1. Change `afterSaying(brain)` to `afterSaying(brain, said: string[])`, given the texts that were said this turn.
2. Mark a task reported only if one of the lines names its asker (the first name as a word, as the done line and `think`'s `spokeTo` test at `brain.ts:1543` do; `callsOn` in `addressing.ts:65` is stricter and not exported; for an asker who is the Captain or a head, accept the title too, since the model is apt to say "Captain, ...") and holds the done words (`job.sayDone?.(task)`, or "done", "finished", "clean" as a fallback test). A line that is the driver's done line for that task (the `mustSay` equals the step's `say`) always counts. A done line the model words badly leaves the task owed. The driver then says it again once its backoff has passed (`fail(brain, step.key)` at `driver.ts:806`), so this cannot spam.
3. In both callers in `brain.ts`, pass the texts of the `say` actions that went out (and `[mustSay]` in the `catch`).
4. Leave the driver's one-line-per-turn as it is: with the fix, the second asker's task stays owed, and the next turn says "Zim, that is done." 4 seconds later.
5. Keep jobs that set `task.reported` themselves (`cargo.ts`, `orders.ts`, `pickups.ts`) as they are.

## How to test the fix

A sim scenario in `tools/llm_crew/`: a janitor with two finished told-of tasks from two people, both in view. Before the fix `game.log` has one done line; after it, two, one to each. A second scenario: a finished task for someone in view and a newcomer walking in; the greeting must not mark the task reported, and the done line follows. Run the type check.

## Check

Read `wordOwed`, `afterSaying` and `describeWork` (`tasks.ts:408-470`), the done step in `nextStep` (`driver.ts:485-497`), the busy gate in `drive` (`driver.ts:725-744`), the say path with its backoff (`driver.ts:804-809`), and both callers in `think` (`brain.ts:1558`, `1622`). The quotes are what the code says today. The only other places that set `task.reported` are the job files the write-up names (cargo, orders, pickups), and none of them touches a janitor's told task.

I ran a throwaway bun script (outside the repo) that imports `wordOwed` and `afterSaying` by absolute path. A brain has two done tasks, asked by Ann Lee and Zim Fire, both in view. `wordOwed` gives 2 before one `afterSaying(brain)` call and 0 after it, so one line clears both. The driver offers one done line per turn (`wordOwed(brain)[0]`), so the second asker is never told.

Nothing in `LLM_CREW_CHANGELOG.md` or the plans chose this. Medium and small stand. The fix was mended: name matching by first name or title, since `callsOn` is not exported, and a note that a missed match is retried under backoff.

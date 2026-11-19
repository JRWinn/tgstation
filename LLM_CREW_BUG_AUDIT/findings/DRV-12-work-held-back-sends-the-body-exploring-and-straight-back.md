---
id: DRV-12
title: While a step of its work is held back the body goes exploring or to other work, and the walk back is let off before the step is, so it walks away and back every few seconds
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:582, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:1012, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:539
fix: Offer no idle explore while work is only held back, and hold back any walk to a place where a step has just failed until that step is let off
---

## What is wrong

See also: KNA-02

When a step of its work fails, the driver leaves that step alone for a while (`fail`, 20 seconds and more each time). A clean that fails in the room of its task also holds back the whole job (`jobKey`), "so that it did not go back and forth between two rooms". But two things undo that:

1. **While anything is held back, the body is sent exploring.** With nothing in `ready`, `nextStep` falls to passing the time, and the idle step is `explore` (or `search` if there is storage in view), with the words "What you last tried for your work came to nothing, so you are leaving it a little while before you try again. Meanwhile you are walking the station". `explore` walks to the nearest room the body has not been in, which may be anywhere.
2. **The walk back is let off before the step it is for.** The failed clean and the job are held back under two keys with two counts. The job key is only failed by a clean in the task's own room; the clean key is failed by every clean for that task, including wetting the mop at a sink on the way (the same tool and the same task, so the same key). So the clean's count runs ahead of the job's, and its hold is longer: with the clean failed twice and the job once, the job is free after 20 seconds and the clean after 40. Once the job is free, the walk back to the room (`go_to`, a key of its own) is ready. The body walks back, finds the clean still held back, and with nothing else ready goes exploring again.

So a janitor whose clean has failed walks out of the room, back into it, out again, and back again, a few seconds apart, until the clean is let off. That is the to-and-fro the job key was added to stop.

Seen in `data/logs/2026/11/19/round-20.00.21`, `crew_brain.log`, Brenna Beedell (janitor, `npc6`), all `ROUTINE (no LLM)`:

    02:11:47 in Primary Tool Storage: You are cleaning up the mess here in Primary Tool Storage    clean()
    02:12:04 in Primary Tool Storage: What you last tried for your work came to nothing ... walking the station   explore()
    02:12:11 in Cafeteria: You have a mess to clean up in Primary Tool Storage, and you are going there   go_to("Primary Tool Storage")
    02:12:18 in Primary Tool Storage: What you last tried for your work came to nothing ... walking the station   explore()
    02:12:25 in Fore Primary Hallway: You have a mess to clean up in Primary Tool Storage ...   go_to("Primary Tool Storage")
    02:12:33 in Primary Tool Storage: You are cleaning up the mess here in Primary Tool Storage    clean()

Four walks in 21 seconds to clean one room it was standing in. The same body did the same in the Service Hallway at 02:06:30 to 02:07:25 (explore, back from the Command Hallway, explore, back from Auxiliary Tool Storage, clean). What made the clean fail is not in any log (results are not logged: HOLE-12).

**It is not only cleaning.** The job key is only used for `clean`. Any other step that fails at a place (a `pick_up`, say) is held back under its own key, while the walk to that place is a different key and is not held back. With two tasks in two rooms, the body walks to the first room, finds its step held back, takes the walk to the second, and in the second room the first task's walk is ready again. In `data/logs/2026/11/19/round-20.43.32`, Alger Ratcliff (janitor), holding two damp rags (the cause of the failed `pick_up` is LOGA-05):

    02:57:13 in Custodial Closet: ... you know where there is mop, and you are going to get it.        pick_up("mop")
    02:57:16 in Custodial Closet: You have a mess to clean up in Central Maintenance ...               go_to("Central Maintenance")
    02:57:29 in Central Maintenance: ... your PDA says what you asked for ... is in the Custodial Closet  go_to("Custodial Closet")
    02:57:41 in Custodial Closet: You have a mess to clean up in Central Maintenance ...               go_to("Central Maintenance")
    02:57:53 in Central Maintenance: ... is in the Custodial Closet. You are going there to get it.     go_to("Custodial Closet")
    02:58:05 in Custodial Closet: ...                                                                  go_to("Central Maintenance")
    02:58:18 in Central Maintenance: ...                                                               go_to("Custodial Closet")
    02:58:29 in Custodial Closet: ... you are going to get it.                                         pick_up("mop")

Six walks between two rooms in 62 seconds, the length of the `pick_up` hold, and then again between the Custodial Closet and the Cargo Lobby until 03:00:30. LOGA-05 mends why the `pick_up` fails; this finding is why a failing step sends the body to and fro rather than leaving it at the other job.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:582`, in `nextStep`, the idle step offered when everything is held back:

      const idle: Action | null =
        brain.storageHere > 0
          ? { tool: 'search' }
          : brain.resting
            ? null
            : { tool: 'explore' };
      ...
      const why = heldBack
        ? 'What you last tried for your work came to nothing, so you are leaving it a little while before you try again. Meanwhile'

`driver.ts:539`, the two keys that hold a step back:

        const key = keyOf(task, plan.act, plan.say);
        if (inBackoff(brain, key) || inBackoff(brain, jobKey(task.id))) {
          heldBack = true;
          continue;
        }

`driver.ts:1012`, in `noteResult`, where they are failed separately:

        fail(brain, last.key);
        ...
        const cleaned = brain.tasks.find((task) => task.id === last.task);
        if (last.act.tool === 'clean' && cleaned?.place === brain.location) {
          fail(brain, jobKey(cleaned.id));
        }

## How it was found

Seen in the round log above, then the cause read from the code. Not run in the simulator.

## How to fix it

1. In `nextStep`, when `heldBack` is true, offer no idle step: return null, so the body waits where it is until the held-back step is let off. (It is woken by the next update; updates come at least once a second.) Keep the idle step for a body with no work at all, or with work that cannot be got on with (`work.length > 0` and nothing held back), as now.
2. Make the job key's hold run at least as long as the step's. In `noteResult`, when a clean fails in the task's room, set the job key's `until` to the later of its own and the clean key's: after both `fail` calls, `const step = brain.failures.get(last.key); const job = brain.failures.get(jobKey(id)); if (step && job) job.until = Math.max(job.until, step.until);`.
3. Hold back the walk to a place where a step has just failed, whichever task the walk is for. In `noteResult`, when a step that is not a walk fails, note where (`brain.heldAt = { place: brain.location, until: <that step's until> }`, or a small list of them). In the `nextStep` loop, treat a ready `go_to` whose `place` is a `heldAt` place still in its time as held back (`heldBack = true; continue`). In the second case above the two walks may be for two different mess tasks that both want the mop, which is why this goes by the place and not by the task. The cost: other work in that room waits out the same hold, 20 seconds the first time. A body then stays with its other job, or waits where it is (step 1), and does not walk back to a step it cannot yet take.
4. Do not count the wetting of a mop at a sink elsewhere against the clean in the mess's room: give that step its own key. The simplest way is in the janitor's plan, by adding a field the server ignores to the act (`{ tool: 'clean', wet: true }`), as `force_door` and `jail` already carry `attempt` for this purpose.
5. Owner's question: should a body whose work is held back stay put, or do something on the spot (search storage in view, tidy)? Step 1 has it stay put; `search` with storage in view could be kept, since it does not leave the room.

## How to test the fix

- Type check from `tgui/`.
- A table test with the fixture janitor: one mess task in the room it stands in, the clean key failed twice and the job key once. For the next 40 seconds `nextStep` must give no `explore` and no `go_to`, and the `clean` once the 40 seconds are up.
- `bun tools/llm_crew/sim.ts quiet` with the janitor scenarios: they must still pass.
- In the next round, grep `crew_brain.log` for "came to nothing, so you are leaving it a little while": there should be none with `explore()`.

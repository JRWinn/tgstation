---
id: DESK-06
title: Called to a mess in a room locked to it by anyone but cargo, a janitor walks at the door every few minutes, never knocks or asks, and never tells the caller
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:846, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:475, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:888, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:154, code/modules/llm_crew/crew_npc_tools.dm:486
fix: Give any told mess task the let-in steps once a walk to its room fails for want of a way in, whoever called, and let anyone coming into view restart the asking, not only cargo
---

## What is wrong

The janitor's whole way into a locked room (stand at the door, knock, message whoever called, ask anyone in sight, wait, ask again when someone comes) runs only for a task with `task.via` set. `via` is set in one place: a call by PDA from someone whose job is cargo (`isCargo(job)`). And the one thing that starts the asking again, `meets`, only listens for someone in cargo.

Every other call to a locked room goes the plain way: `go_to` the room. The server finds no way in, marks the room in `blocked_places` for five minutes (fifteen after the second time), and the task is blocked with "you could not find a way in, and will try again later". Blocked tasks are never dropped for age (`tasks.ts:154`), so when the server's mark runs out it walks at the door again. Nobody is told: not the caller, and not anyone who could open the door. It ends only when the task happens to be open and over 30 minutes old at a sync, and is dropped without a word.

Concrete cases on MetaStation (a janitor's ID opens maintenance and the Custodial Closet, not much else):

- The Captain sends "There is blood all over the Bridge, could you clean it up?" `readsMessage` takes it (`takeToldWork`, `via` unset). The janitor walks to the Bridge, fails, waits five minutes, fails, waits fifteen, and so on. The Captain is never told it cannot get in, and nobody is asked to open the door.
- An engineer or a security officer who sees a mess in their own locked rooms, if those jobs ever call janitors (today only cargo does, `jobs/cargo.ts:1622`), would get the same.
- Said aloud: "Bob, there's vomit in Medbay" gets the same, through `workInWords`.

The project rule is that a behaviour described for one job is built as a general rule. This one is built for cargo alone, and the `meets` hook names cargo in code.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:846`, in `readsMessage`, the only place `via` is set:

    if (task && fromCargo && named !== CARGO_LOBBY) {
      task.via = CARGO_LOBBY;
    }

`janitor.ts:475`, in `syncTasks`, what every other locked room gets:

    const noWayIn =
      !brain.doorHeld &&
      task.place !== brain.location &&
      brain.blockedPlaces.includes(task.place);

`janitor.ts:888`, `meets`:

    meets: (brain, _name, job) => {
      if (!isCargo(job)) {
        return;
      }

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:154`:

    return brain.now - task.createdAt < GIVE_UP_DS || task.state === 'blocked';

`code/modules/llm_crew/crew_npc_tools.dm:486`, the server's mark on a failed walk:

    if(tool == CREW_TOOL_GO_TO && goal)
        blocked_places[goal] = world.time

## How it was found

Read from the code. Not seen in a round: the rounds so far had only cargo calling janitors to locked rooms.

## How to fix it

1. In `syncTasks`, when a told CLEAN task (`source === 'told'`) is in `brain.blockedPlaces` and has no `via`, set `task.via = brain.location` (any value that is not the task's place will do; `via` is only read as "has to be let in"). From then on `letInStep` runs: `go_to_door`, knock, message `task.askedBy`, ask anyone in view.
2. In `letInStep`, the person to ask aloud is today the caller or "a technician". Make that the caller, or anyone in view whose ID the server says opens the door (`brain.doorKeepers`, which the server already sends for doors it came in by; it may need sending for the door it is standing at too).
3. In `meets`, drop the `isCargo(job)` test, or test that the newcomer is a door keeper for a door it is asking at.
4. When it has asked and nobody came (`NOT_LET_IN`), send the caller one PDA line saying so, in fixed words, so that a human caller knows: for example "I cannot get into the Bridge. Could someone let me in?". Then leave the task blocked as now.
5. Owner question: should a janitor called to a room locked to it by someone who does not work there (the Captain sending it to Medbay) go and knock, or answer at once that it has no access? Step 1 assumes it goes and knocks.

## How to test the fix

- Simulator: a janitor told by the Captain, by PDA, of a mess in a room in its `blockedPlaces`. After the first failed walk it must go to the door, knock and message the Captain.
- Type check from `tgui/`.
- Next round: grep `game.log` for `walk failed (go_to, to <room>)` by a janitor and check a knock follows.

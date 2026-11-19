---
id: CARGO-12
title: A workmate lying knocked out, dead or in cuffs in plain sight still counts as about, so their share of the work is left to them for good
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:284, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1368, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1152, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1413
fix: Write one helper, ableWorkmate, that needs the person in view to be neither down nor cuffed, and use it in leftTo, doorIsMine, the knock rule and visitorToMind
---

## What is wrong

Several rules in `cargo.ts` have one technician leave something to another because the other is "there". Each of them tests only that the other is in `peopleInView`. The server puts every human it can see in that list, standing or not, and marks each with `down` (not conscious, or floored and unable to get up) and `cuffed`. None of the rules reads those two marks.

So a workmate who is dead on the bay floor, knocked out, or standing in cuffs waiting to be walked off is still "about", and:

- `leftTo`: their share of the standing work (the shuttle, the rooms, or both) is left to them. With the shuttle left to a body on the floor, nothing is unloaded and the shuttle is never sent back. No order can then be fetched: the server will not send the shuttle while a crate is aboard (`supply_run_step`), and gives the order up after six minutes (see CARGO-01).
- `doorIsMine`: "if the keeper is in view, the door is theirs" has no time limit at all, so nobody answers an ask or a knock.
- the knock rule in `doorSought`: with no keeper, whoever sent for the visitor answers "if they are here to", and failing that the cargo name that sorts first. Both test only sight.
- `visitorToMind`: "there is a workmate at the post to see to them" is true of a workmate lying at the post.

One concrete case: Pun Pun knocks Maria out in the Cargo Bay (round 14.28's write-up has it beating three janitors and the officer unconscious in a minute). Maria has the shuttle and the rooms. Sam, at the counter eight tiles away, has her in view. `leftTo(brain, 'shuttle')` returns "Maria Williams" on every update. Sam's `unload` task says "That is Maria Williams's to see to: the Quartermaster gave them the shuttle this shift." for as long as she lies there. There are no medical staff, so that is the rest of the round.

`cargo.ts` also counts the Quartermaster as someone who answers doors: the knock rule's last test is `isCargo(seen.job) && seen.name < brain.name`, and `isCargo` is true of the Quartermaster, who does not open the department's doors. A technician whose name sorts after the Quartermaster's leaves a knock from inside to it whenever it is in sight and the work has not been divided. `visitorToMind` has the same `isCargo` test.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:284`, `leftTo`:

    holders.find(
      (name) =>
        brain.peopleInView.some((person) => person.name === name) ||
        brain.now - (brain.people.get(name)?.at ?? -Infinity) < HOLDER_ABOUT_DS,
    ) ?? null

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1368`, `doorIsMine`:

    if (brain.peopleInView.some((seen) => seen.name === keeper)) {
      return false;
    }
    return brain.now - at > KEEPER_WAIT_DS;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1413`, in `doorSought`:

    : by
      ? by === brain.name ||
        !brain.peopleInView.some((seen) => seen.name === by)
      : !brain.peopleInView.some(
          (seen) => isCargo(seen.job) && seen.name < brain.name,
        );

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1152`, `visitorToMind`:

    const workmateAtPost = brain.peopleInView.some(
      (person) => person.in_post && isCargo(person.job),
    );

`code/modules/llm_crew/crew_npc_senses.dm:191`, what the server sends for each person in view:

    ... "cuffed" = !isnull(person.handcuffed), "down" = crew_npc_person_down(person)))

`tgui/packages/tgui/interfaces/CrewBrain/types.ts:60`:

    /** TRUE if this person is in handcuffs. */
    cuffed?: BooleanLike;
    /** TRUE if this person is lying on the floor and cannot get up: knocked down, or out cold. */
    down?: BooleanLike;

`brain.people` (the "seen not long since" half of `leftTo`) is written for everyone in view too (`observe` in `memory.ts:164`), so a body on the floor keeps renewing it.

## How it was found

Read from the code, not seen in a round. Not listed in the change log or the plans. The change log's note under the 16:50 entry, that nothing is to be built for crew who are down until there is a medical department, is about helping them, not about leaving work to them.

## How to fix it

1. In `cargo.ts` add:

       /** A workmate it can see who is on their feet and free to work. */
       function ableInView(brain: NpcBrain, name: string): boolean {
         return brain.peopleInView.some(
           (person) => person.name === name && !person.down && !person.cuffed,
         );
       }

2. `leftTo`: use `ableInView` for the first half. For the second half, "seen not long since" must not be renewed by a body on the floor: keep a small map on the brain, `ableAt[name] = brain.now`, set in `syncTasks` for each technician in view who is neither down nor cuffed, and test that in place of `brain.people.get(name)?.at`.
3. `doorIsMine`: `if (ableInView(brain, keeper)) return false;`.
4. The knock rule: use `ableInView` for `by`, and `isTechnician(seen.job) && !seen.down && !seen.cuffed && seen.name < brain.name` for the last test. `isTechnician` is in `jobs/supply.ts` and is already imported.
5. `visitorToMind`: `person.in_post && isTechnician(person.job) && !person.down && !person.cuffed`.
6. The same marks are worth reading in `jobs/rounds.ts` (`workmate` at line 176) so that a technician does not announce its round to a body on the floor and count the post as kept. That file is shared by every job with a post.

## How to test the fix

- Simulator: the sim's people have no `down` flag set anywhere today. Add one to a technician in the `qm` scenario after the work is divided and the shuttle has docked, and check that the other technician unloads.
- Type check.
- In a round with a technician arrested in the bay: the other technician's steps in `crew_brain.log` should not read "That is ...'s to see to" while the first is in cuffs.

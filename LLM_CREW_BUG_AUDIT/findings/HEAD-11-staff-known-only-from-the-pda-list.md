---
id: HEAD-11
title: A head knows its staff only from its PDA's list, so a janitor with no PDA asking it face to face is ignored, and a head with no PDA has no staff, holds no meetings and orders nothing
kind: gap
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:176, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:218, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:800, code/modules/llm_crew/crew_npc_cargo.dm:666
fix: Make staff() the PDA list joined with everyone in view whose ID puts them in the head's department, so word given face to face counts and the no-PDA paths in meetStep can run
---

## What is wrong

`staff(brain)` is built from `brain.pdaPeople` alone. The server fills that from the PDA network, and only when the head carries a PDA (`people_on_pda` returns an empty list when `pda_messenger()` is null). It is not joined with the people the head can see, though `peopleInView` gives each one's job from their ID.

Two results:

1. **A janitor with no PDA is not the head's staff.** Its spoken ask, "Hop, I need something to clean with for my work. Could you get it ordered, please?", which `needStep` has it say to the head's face precisely because it has no PDA, reaches `noteAsk`, which returns at once: `!staff(brain).some((person) => person.name === who)`. The janitor sets `toldHeadAt`, waits `TELL_AGAIN_DS` (8 minutes), says it again, and is ignored again, for the rest of the round. At a meeting it is not called on, not counted, and its report is not heard (`hearReport` has the same test).
2. **A head with no PDA has no staff at all.** `syncMeeting` needs `people.length > 0` to call a meeting, so none is called; `noteAsk` drops every ask, so nothing is ordered. The code in `meetStep` written for a head that cannot send word ("Nothing reaches them. They are counted as called, and the meeting goes on without them") can never run, and nor can the aloud call for a head with no PDA.

How a body comes to have no PDA: it is dropped, taken, or lost with a stolen bag; HOLE-08 notes PDAs lying in lockers. It is not common. The same `pdaPeople`-only rule is in `captainName` and `headName`, but those also look at `peopleInView` first.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:176`, `staff`:

    export function staff(brain: NpcBrain): { name: string; job: string }[] {
      const department = departmentHeadedBy(brain.job);
      ...
      return brain.pdaPeople.filter((person) =>
        department.jobs.some((job) =>
          person.job.toLowerCase().includes(job.toLowerCase()),
        ),
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:218`, `noteAsk`:

    if (!staff(brain).some((person) => person.name === who)) {
      return;
    }

`code/modules/llm_crew/crew_npc_cargo.dm:666`, `people_on_pda`:

    var/datum/computer_file/program/messenger/own_messenger = pda_messenger()
    if(isnull(own_messenger))
      return people

## How it was found

Read from the code, not seen in a round.

## How to fix it

1. In `staff`, after the PDA list, add everyone in `brain.peopleInView` whose `job` matches the department by the same test and who is not already listed by name. A small `seenStaff` memory (name and job, last seen time, kept for the round) lets a head remember a no-PDA janitor it has met once, so it is still called by voice when in sight and asked about at the next meeting.
2. Keep `sendFor` and the PDA call to those on the PDA list only (they need a PDA to be sent word); `meetStep`'s existing branches already handle "not in sight and no PDA" by counting them called.
3. The Quartermaster and Head of Security branches of `staff` need the same join.

## How to test the fix

- Simulator: a janitor with `has_pda: false` that says its need to the head in view. Pass if the head orders.
- A head with `has_pda: false` and janitors in view: pass if a meeting is called aloud or by walking up.
- Type check from `tgui/`.

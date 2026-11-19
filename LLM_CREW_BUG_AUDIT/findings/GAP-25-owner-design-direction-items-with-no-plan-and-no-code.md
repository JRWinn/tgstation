---
id: GAP-25
title: Six parts of the owner's design direction have no plan and no code, needs, how-to cards, a stocked work area, cover before a break, rooms handed out to janitors, and a raise
kind: gap
severity: low
effort: large
confidence: sure
status: found
found_by: Opus 5.5
area: design
files: tgui/packages/tgui/interfaces/CrewBrain/person.ts:1, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:1, LLM_CREW_BRIEF.md:1
fix: Put the six to the owner as one list, and write a short plan for whichever the owner wants next, starting with the head handing out rooms to its janitors, which is the cheapest and helps today
---

## What is wrong

The owner laid out where the crew design is going on 2026-11-16 and 2026-11-17. It is kept only in the assistant's memory notes ("LLM crew design direction" and "Crew meeting design"), not in `LLM_CREW_BRIEF.md` or any `LLM_CREW_PLAN_*.md`. Some of it has been built (relationships, `relationships.ts`; tidying as a shared duty, `jobs/tidying.ts`; heads and meetings; diagnostics is GAP-19). Six parts have no plan and no code. The notes say not to build "not yet" items unless asked, so this is not a fault in what was built. It is a list nobody has, so that they are not lost and so the owner can say which comes next.

| # | The owner's words, as the notes keep them | Today |
| --- | --- | --- |
| 1 | "Needs (food, health, rest) are a person thing, not yet built. Person needs come first once below a threshold." | Nothing. `person.ts`'s header says needs "will go" there. A search of the window and server code for nutrition, hunger, rest or tired finds only a personality's wording. |
| 2 | "Later still: before going to lunch, make sure someone is covering your work." | Nothing. Depends on 1. The nearest thing built is a technician not going on rounds with a visitor inside unless a workmate is at the post. |
| 3 | "How-to cards: a third kind of card beside person and job, holding procedures with conditions, tools and best methods (how to clean a room and what to use, how to hack a door you have to get through)." | Nothing. Procedures are code in each job (`jobs/janitor.ts`, `jobs/engine.ts`'s checklist). The engine checklist is the closest thing to a how-to card: data, one map, one engine. |
| 4 | Shared duties: "keep your work area stocked with emergency and general supplies", and in the job layer "what the area should stock". | Nothing. No job lists what its rooms should hold. Staff report a need only when their own tool is missing or poor (`NEED` in `jobs/janitor.ts`, `lacks` for the officer's baton). |
| 5 | "Heads will also hand out assignments such as which janitor takes which rooms." | Not built for janitors. The Quartermaster deals out the technicians' work (the counter, the shuttle, the rooms) at its first meeting. The Head of Personnel hands out nothing: every janitor picks from every mess it knows of. |
| 6 | "IN FUTURE CODE": "the best performer gets a raise 'or something'. The per-person totals it would need now exist." Also "Raises for the best performer" in the Quartermaster plan's "Not in this plan". | Nothing. The totals are there (`work_done`, `jobs/reports.ts`). |

Why 5 matters now and not only later: with three janitors and no rooms handed out, all three plan from the same messes. They are kept apart only by who was called (one call per room, secure-areas plan) and by the shared lists GAP-06 writes up. A janitor told of a mess by a workmate goes to it; a head that gave out rooms would let each go only to its own unless asked. The light replacer plan (GAP-11) already wants the Head of Personnel to hand one janitor the lights at the first meeting, so the hand-out step is needed there too and could carry both.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/person.ts:1`:

    * A person has a personality and a set of rules for living among other people. Its job is a
    * separate layer (see jobs/), because any personality may be given any job. This is also where
    * what belongs to a person rather than a job will go as it is built: needs such as food and rest,
    * and how the person feels about the people it has met.

The direction itself is in the assistant's memory note "llm-crew-design-direction", not in the repo. `LLM_CREW_BRIEF.md` says nothing of layers, needs or how-to cards.

## How it was found

Read the memory notes, then searched `code/modules/llm_crew/` and `tgui/packages/tgui/interfaces/CrewBrain/` for each (nutrition, hunger, rest, tired, lunch, how-to, stock, restock, emergency supplies, assign, rooms handed out, raise). Nothing found but what the table says. Not checked: whether hunger matters inside one round. Base hunger is slow enough that in a one-hour round a body is unlikely to reach starving, so 1 is not urgent.

## How to fix it

1. Copy the design direction into the repo: a section in `LLM_CREW_BRIEF.md` ("Where the design is going", with the date and the owner's words), so a new session finds it without the memory notes. GAP-21 asks for the brief to be brought up to date anyway; do both at once.
2. Put the six to the owner, asking which comes next. My order: 5, then 4, then 1 and 2 together, then 3, then 6.
3. For 5, a plan in the shape the Quartermaster's work split already has: at the first meeting the Head of Personnel deals out rooms (by department, so the Cargo Bay's messes go to one janitor), says it word for word ("Ysabel, cargo and the Service Hallway are yours this shift."), and each janitor's `plan` puts its own rooms first and others only when called. It must hold for one janitor or five, and a janitor with no rooms given (a dead head, a dead model) works as today. The light replacer's hand-out goes in the same step.
4. For 4, a list per job of what its rooms should hold, checked when a body looks in on a room on its rounds (`jobs/rounds.ts`), and told to its head as a need. It uses the order path that is already built.
5. For 1 and 2, the person layer: a server sense for the body's own hunger and tiredness, a threshold above which they come before routine work and below emergencies, and a handover line to a workmate before leaving. Food comes from the kitchen or the vending machines the honest way.

## How to test the fix

- Whatever is built: the simulator scenario for it, with a dead model, as every plan does.
- For 5: a scenario with three janitors and messes in three departments; each janitor should go to its own rooms' messes first, and the hand-out line should be in the head's meeting.

---
id: PARSE-16
title: Quartermaster, order some paper and Janitor, clean the bar call on nobody when anyone else is about, because only crew with a post are known by their job, and HoP, QM, CE, HoS and sec never
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:95, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:65
fix: Let any crew member be called on by its job title or the usual shorthand for it, in callsOn's strict shapes (at the start, or set off by a comma), longest title first so Engineer is not taken from Chief Engineer
---

## What is wrong

See also: MEM-01, which is the opposite fault for crew who **do** have a post: any word of the job anywhere in the line calls on them.

In SS13 people are called by their job far more often than by name: "Captain", "HoP", "Officer", "Janitor", "QM". `saidTo` knows a crew member by its job only if it serves at a post (`!!brain.post && usesName(lower, brain.job)`). The server gives a post only to cargo technicians, station engineers and security officers (`post_place` in `crew_npc_cargo.dm`, `crew_npc_engineering.dm`, `crew_npc_security.dm`). The Head of Personnel, Quartermaster, Chief Engineer, Head of Security and every janitor have none. And no shorthand is known for anyone.

With anyone else in view and the speaker not right beside the NPC, a line that calls on it by job is "for nobody": it is heard and not answered, and no order is taken from it. Run, the Captain four tiles off and turned away, one other person in the room:

| NPC | The Captain says | saidTo |
| --- | --- | --- |
| Head of Personnel (Rita Vance) | HoP, hold a meeting | nobody |
| Head of Personnel | Head of Personnel, hold a meeting | nobody |
| Quartermaster | QM, order some paper | nobody |
| Quartermaster | Quartermaster, order some paper | nobody |
| Janitor | Janitor, clean the bar | nobody |
| Janitor | jani, clean the bar | nobody |
| Chief Engineer | CE, shut the engine down | nobody |
| Security Officer (post) | sec, arrest bob | nobody |
| Security Officer (post) | Officer, arrest bob | me |
| Cargo Technician (post) | cargo, open the door | me |

The orders read by code from what a superior says to an NPC (`buildTalk`'s `ordered`, the meeting order, the Quartermaster's order taking aloud, the desk's warrants aloud, which need `said_to === 'me'`) are all lost with it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:95`, in `saidTo`:

    if (
      usesName(lower, brain.name) ||
      (!!brain.post && usesName(lower, brain.job))
    ) {
      return { to: 'me' };
    }

`addressing.ts:65`, `callsOn`, which knows people only by a part of their name:

    const first = name.split(/[^A-Za-z]+/).find((part) => part.length > 2);

## How it was found

Run. A throwaway script (`parse/byjob.ts` in the scratchpad) called `saidTo` with the fixture brain for each job, `post` set as the server sets it, the Captain and Josh Reed in view; the table is its output. (With the fixtures' own Head of Personnel, "Hop Kins", "HoP, hold a meeting" is `me`, but only because "hop" is in his name.) Not seen in a round log.

## How to fix it

1. Beside `OPENERS`, add a table of job shorthands, the same one PARSE-02 proposes for rooms: `hop` Head of Personnel, `hos` Head of Security, `ce` Chief Engineer, `qm` Quartermaster, `cmo`, `rd`, `jani|janny|custodian` Janitor, `sec|officer|secoff` Security Officer, `cargo|cargo tech|tech` Cargo Technician, `engi|engineer` Station Engineer, `cap|captain` Captain.
2. Add `callsOnJob(heard, job)`: the job title, or one of its shorthands, in the strict shapes `callsOn` uses (at the start after an opener, or set off by a comma or colon). Try the longest title first, and do not let "engineer" match where "chief engineer" stands.
3. In `saidTo` rule 1, test `callsOnJob(heard, brain.job)` for every NPC, post or not; keep the loose `usesName(job)` for post holders only after MEM-01's change. In rule 2, test `callsOnJob` against the jobs of everyone in view, so "QM, ..." is `other` for a technician standing beside the Quartermaster.
4. When two in view share the job called on ("Janitor, ..." with two janitors there), return `group`: the nearest answers.

## How to test the fix

- Add the table's rows to `tools/llm_crew/addressing.ts`, each wanting `me`, plus "QM, order paper" heard by a technician beside the Quartermaster wanting `other`, and "Chief Engineer, come here" heard by a station engineer wanting `other`.
- Keep the existing `Hey, cargo technician, any mail?` row passing.

---
id: PARSE-15
title: Status report on your department and gather your staff call no meeting, while did you hold a meeting and get the bar cleaned, no need for a meeting each call one, the second dropping the order
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:83, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:127, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:257, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1452
fix: Refuse MEETING_ORDER_WORDS in a question or after a negation, add the plain asks for a report and for gathering staff, and test it per clause so an order in another clause still stands
---

## What is wrong

`isMeetingOrder` decides, by one regular expression, whether the Captain has told a head to find out how its staff are doing, which makes the head call a staff meeting. It is read by code for spoken lines and PDA messages (`chiefengineer.ts`, `head.ts`), and a match also **wipes any other order in the same line**: `workInWords` returns null for a superior's line that matches (`tasks.ts:257`), and `brain.ts:1452` drops the model's `work` answer when it matches.

Run with a Head of Personnel (a head with staff):

| The Captain says | isMeetingOrder |
| --- | --- |
| hold a meeting | true |
| call a staff meeting | true |
| find out how your people are doing | true |
| check on your janitors | true |
| meeting pls | false |
| hold a meetin | false |
| gather your staff | false |
| get your team together | false |
| status report on your department please | false |
| give me a report on your section | false |
| I want a report from your department | false |
| have your staff report in | false |
| how are your guys doing | false |
| how is service doing | false |
| did you hold a meeting? | **true** |
| get the janitors to clean the bar, no need for a meeting | **true** |

The last two are a question and a "no need". For the last, the head calls a meeting the Captain said was not needed, and the order in the same line is dropped as well: the line names the Bar, and `workInWords` returns null for any superior's line that `isMeetingOrder` matches. (Corrected by the checker: "check the bar, no need for a meeting" does not match, since it has none of hold, call, have, run, convene or get before "meeting". Lines that do, each calling a meeting and losing the order: "have the bar cleaned, we can have a meeting later", "Don't call a meeting, just clean the bar", and to the Quartermaster by PDA "get a crate of lightbulbs ordered, no meeting needed", where the meeting test in its `readsMessage`, `quartermaster.ts:1449`, comes before `ORDER_WORDS` and `takeOrder`.)

See also PARSE-09 (a negated or question clause taken as an order to clean, in `workInWords`): the same per-clause test serves both.

A missed ask is not silent: the model is told nothing of a meeting, may say it will hold one, and none is held.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:83`:

    const MEETING_ORDER_WORDS =
      /\b(hold|call|have|run|convene|get)\b[^.?!]*\bmeeting\b|\bhow\b[^.?!]*\b(section|department|staff|team|people|janitors|lot)\b[^.?!]*\b(doing|getting on|going|coping|managing)\b|\b(check|check in|look in) (on|with) your (section|department|staff|team|people|janitors)\b/i;

`meetings.ts:127`:

    export function isMeetingOrder(brain: NpcBrain, heard: string): boolean {
      return (
        (departmentHeadedBy(brain.job)?.jobs.length ?? 0) > 0 &&
        !/captain/i.test(brain.job) &&
        MEETING_ORDER_WORDS.test(heard)
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:257`, in `workInWords`:

    if (!place || (fromSuperior && isMeetingOrder(brain, heard))) {
      return null;
    }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1452`:

    if (
      isMeetingOrder(
        brain,
        report.filter((line) => line.includes(' says: ')).join(' '),
      )
    ) {
      continue;
    }

## How it was found

Run. A throwaway script (`parse/meet.ts` in the scratchpad) called `isMeetingOrder` on a fixture Head of Personnel for each line above; the table is its output. That a match drops the other order is read from the code. Not seen in a round log.

## How to fix it

1. Test per clause (split on `.`, `?`, `!`, `,`, " but ", " and "), and refuse a clause that ends in `?` or has `\b(no need|don'?t|do not|not|never mind|no)\b` before "meeting". Typed lines often drop the `?`, so also refuse a clause that begins with a question word or auxiliary (`^(did|have|has|is|are|was|were|do|does|when|why|what)\b`): "have you had a meeting yet" matches today. "Have your staff report in" begins with "have" too, so test the plain asks of step 2 before the question test.
2. Add the plain asks: `\b(status|progress)\s+report\b`, `\breport\s+(on|from)\s+(your|the)\s+(section|department|staff|team|people)\b`, `\b(gather|round up|get together|assemble)\b[^.?!]*\b(staff|team|people|section|department|janitors)\b`, `\bhave\s+your\s+(staff|team|people)\s+report\b`, `\bhow\s+(is|are)\s+(service|supply|engineering|security|your\s+\w+)\s+(doing|going|getting on)\b`, and a misspelt "meetin(g)?". Mind what these will catch besides: the Quartermaster runs `isMeetingOrder` ahead of the orders it reads and of `askWhatWasMeant` (only a plain yes or no from the Captain, `readAnswer`, comes first), so "status report on the order?" would call a meeting instead of being answered. Keep "status report" tied to `your (section|department|staff|team|people)` or to no object at all, and add the Quartermaster's own words for its crates to the table as must-be-false rows. What the fixed words still miss is the owner's case for the last-resort reader (memory "loose wording for orders"; the warrant reader `deskUnread` in `jobs/desk.ts` is the model of it): a meeting asked for in words code cannot read could go to it, but that is the owner's call.
3. In `workInWords` and `brain.ts:1452`, drop only the clause that is the meeting order, not the whole line: test `isMeetingOrder` on the clause that named the room.
4. Keep `bun tools/llm_crew/sim.ts quiet captain` passing (the Captain's "find out how your section is doing").

## How to test the fix

- A table in `tools/llm_crew/` with the rows above, wanting true for every ask and false for the question and the "no need".
- `quiet captain` and `quiet engine` scenarios.

## Check

Checked by Opus 5.5. The regular expression (`meetings.ts:83`), `isMeetingOrder` (`meetings.ts:127`), the `workInWords` guard (`tasks.ts:257`) and the `brain.ts:1452` skip are as quoted. Callers that act on a match: `head.ts:1197` and `head.ts:1307` (Head of Personnel, spoken and PDA), `quartermaster.ts:1449` and `:1611`, `chiefengineer.ts:662` and `:692`, `headofsecurity.ts:235` and `:263`. None of them tests for a question or a negation first.

Ran the expression, copied from the file, in a throwaway bun script in the scratchpad on the table's lines and some more. Every row of the table came out as written, except the write-up's side remark: "check the bar, no need for a meeting" is false, and was replaced in the body with lines that are true and do lose an order ("have the bar cleaned, we can have a meeting later", "Don't call a meeting, just clean the bar", "get a crate of lightbulbs ordered, no meeting needed", and also "have you had a meeting yet"). Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers `MEETING_ORDER_WORDS`; the owner's wish that loose wording be understood (memory "loose wording for orders") supports the misses half.

Severity medium stands: a meeting the Captain said was not wanted, or an order lost, which a player sees. Effort raised to medium: the clause split touches `meetings.ts`, `tasks.ts` and `brain.ts`, plus a table.

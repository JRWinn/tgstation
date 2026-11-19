---
id: BRAIN-05
title: A janitor is offered "lead them somewhere" on words like take, way and get to, and walks off to a room nobody asked for
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/options.ts:15, tgui/packages/tgui/interfaces/CrewBrain/options.ts:58, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:137, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1476
fix: Offer the walk only when a line said to this NPC both asks the way and names a room, and have code check a go_to against what was said as it does an order
---

## What is wrong

Crew who keep no post (today that is the janitors) can agree to lead someone to a room. The offer is only meant to be on the table when someone asks to be shown or taken somewhere. It is decided by one loose pattern over everything said in the NPC's hearing since it last spoke, whoever said it and whoever it was said to.

The pattern takes single ordinary words: `take`, `way`, `walk`, `lost`, `get to`, `show`. So "I'll grab that space cleaner and get to work", "Please take it", "Allegria blocks my way", "I'm already on my way", "get lost" and "take that order to Personnel" all put the walk on offer. The rooms offered are then not rooms anyone named: with no room in what was said, the list is the rooms the janitor was last in or knows of.

Once it is on offer, the small model takes it about one time in four. Nothing in code checks the choice (a `go_to` passes the "was it asked for" test for any job with no `agrees`, and the janitor has none). The body walks to that room, and its work is held for 20 seconds as if it had led someone (`LEAD_PAUSE_MS`).

In the 14 rounds on disk from `round-17.06.14` (2026-11-18) on, the walk was offered 35 times out of 851 answers. In none of the 35 had anyone asked to be shown anywhere. It was taken 10 times. The words that set it off: `take` 13, `way` 9, `get to` 9, `lost` 2, `walk` 1, and one "where/find" with a room.

One concrete case, `data/logs/2026/11/18/round-20.12.30/crew_brain.log`, 02:13:39, Charlton Stone, Janitor, in the Custodial Closet 70 seconds into the round, with nothing to clean with yet:

    [20:13:27] Caden Campbell says: "Charlton Stone, I'm Caden Campbell; look at that dirt, it's practically begging to be wiped away once I grab my space cleaner." (person p1, 0 tiles away, speaking to you)
    [20:13:29] Macie Lauffer says: "Hi, I'm Macie Lauffer. Seems you two got here first; I'll just grab my space cleaner and get to work on that dirt." (person p2, 0 tiles away, speaking to everyone there)
    ...
    - {"tool": "go_to", "place": one of "Cargo Lobby"} - lead them to one of these places. Only when they have asked to be shown or taken there.

and the reply:

    "say": "Hey Caden! That dirt looks delicious, but I gotta find my space cleaner first. Where did I leave it?",
    "move": { "tool": "go_to", "place": "Cargo Lobby" }

Caden Campbell had done the same three seconds earlier on the same line. Two of three janitors were sent off to the Cargo Lobby before they had picked up a tool. The other eight are listed under "How it was found".

## Where

`tgui/packages/tgui/interfaces/CrewBrain/options.ts:15`:

    const ASKS_TO_BE_LED =
      /\b(show|take|lead|guide|walk|escort|come with|way|how do i get|get to|lost|directions?)\b/i;
    /** The words of someone asking where something is, which is asking the way only if it is a room. */
    const ASKS_WHERE = /\b(where|find)\b/i;

`options.ts:58`:

    const wantsLeading =
      ASKS_TO_BE_LED.test(heard) || (ASKS_WHERE.test(heard) && named.length > 0);
    if (!job.keepsPost && !brain.shutIn && wantsLeading) {
      ...
      const places = [...new Set([...named, ...knownPlaces(brain)])]

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:137`, what `heard` is: every line of speech in the report, not only what was said to this NPC.

    const options = availableOptions(
      brain,
      spokenTo,
      report.filter((line) => line.includes(' says: ')).join(' '),

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1476`, in `think`: no check that a walk was asked for.

    if (action.tool === 'go_to') {
      ledSomeone = true;
    }
    ...
    const calledFor = job.agrees
      ? [...heardLines].reverse().find((line) => job.agrees?.(brain, action, line) !== false)
      : (heardLines.at(-1) ?? '');

With no `agrees`, `calledFor` is always a string, so the `go_to` is always run.

## How it was found

Read from the code, then counted in the round logs with a throwaway script (outside the repo) that reads every `crew_brain.log` from 2026-11-18 17:00 on, finds the answers whose prompt had the `go_to` option in it, runs the same pattern over the heard lines to see which word set it off, and prints those where the reply's `move` was `go_to`. The ten:

- `18/round-17.48.05` 00:05:43, Corrine Whittier to Central Primary Hallway. Heard: "crate #7741 is ready for you at the counter. Please take it".
- `18/round-19.33.11` 01:34:25, Jonas Fiscina to Cargo Lobby. Heard: "I'll grab that space cleaner and get to work."
- `18/round-20.12.30` 02:13:36 and 02:13:39, Caden Campbell and Charlton Stone to Cargo Lobby. Heard: "get to work on that dirt".
- `18/round-21.49.53` 03:57:44, Manuel Sheets to Custodial Closet. Heard: "while Allegria blocks my way".
- `18/round-22.29.47` 04:52:33, Grady Ahmed to Custodial Closet. Heard, said to someone else: "making our way to Corporate Showroom".
- `18/round-22.29.47` 04:52:49 and 04:52:57, Finn Wright to Cargo Bay and then Command Hallway. Heard: "on my way", then "take that order to Personnel".
- `18/round-23.57.07` 05:58:25, Adan Allen to Cargo Lobby. Heard: "let me get to work."
- `19/round-20.43.32` 02:45:03, Alger Ratcliff to Cargo Lobby. Heard: "if you're just wasting time chatting, get lost."

(Times are the log's, six hours ahead of the crew's.) What the body then did was not followed in `game.log` for each. The `go_to` is sent to the server by `runTool` with no further test, so it walked unless the server refused the walk.

Not in `LLM_CREW_CHANGELOG.md` or the plans as an open fault. The comment in `options.ts` records an earlier, narrower fix ("asked where the mops are set off for the closet").

## How to fix it

1. `talk.ts`: build `heard` for the options from the lines said to this NPC only. `describeEvent` marks them: keep report lines that include `speaking to you`, or `speaking to everyone there` when nothing was said to it by name. Lines said to someone else are not asking it for anything.
2. `options.ts`: a walk is on offer only when a room is named in those lines (`named.length > 0`) and the line asks the way to it. Offer only the named rooms: drop `...knownPlaces(brain)` from `places`. Nobody can be led to a room they did not name.
3. Narrow the pattern to wording that asks for a guide, tied to the person: `show me`, `take me`, `lead me`, `guide me`, `walk me`, `escort me`, `the way to`, `how do i get to`, `where is|where's` (with a room named), `i am lost|i'm lost`, `directions to`. Loose spelling still has to pass ("wheres the bar", "how do I get to teh bar" will not name the room: that is acceptable, the NPC can still answer in words).
4. `brain.ts`, in `think`: check a `go_to` in code as an `order` is checked. Before `runTool`, require that `action.place` is named in a heard line that was said to it and that passes the pattern. If not, push `[nothing said called for it: not done]` and `continue`. Set `ledSomeone` only after that check, so a walk that is not taken does not hold the work for 20 seconds.
5. Do not offer it when whoever spoke is one of the crew NPCs this window runs (`brains` has their names): they know every room aboard. That alone would have stopped seven of the ten. The owner may want NPCs to be able to lead each other later: say so if so.

Keep: crew with a post never get the offer, nor does anyone shut in, nor for a room in `blockedPlaces`.

## How to test the fix

- A table of cases like `tools/llm_crew/addressing.ts`: for each of the ten heard lines above, `availableOptions(...)` returns only `stay`. For "Can you show me the way to the Bar?", "take me to the Bar please", "where is the Kitchen?", "how do I get to Cargo Bay?" it returns a `go_to` with exactly that room.
- `tools/llm_crew/voice.ts` (model test, card free) if it has a leading case: it should still pass.
- Type check from `tgui/`.
- Next round: in `crew_brain.log`, no reply should have `"tool": "go_to"` in `move` unless the report has someone asking the way.

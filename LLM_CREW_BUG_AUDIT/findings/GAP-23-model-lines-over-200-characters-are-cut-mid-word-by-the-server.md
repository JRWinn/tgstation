---
id: GAP-23
title: A line the model words that runs past 200 characters is cut mid-word by the server, after the window has checked it holds the words a hearer needs
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: e805fa14c20, d5c8b52d56c
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1370, tgui/packages/tgui/interfaces/CrewBrain/prompt.ts:300, code/modules/llm_crew/crew_npc_tools.dm:151, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1954
fix: Trim every say to the last whole sentence that fits in 200 characters in the window, before the needs test, and fall back to the plain line if the trimmed one no longer holds the needed words
---

## What is wrong

The server cuts anything a body is told to say at 200 characters (`CREW_NPC_SAY_MAX_LENGTH`), wherever that falls. The window knows the limit (`SAY_MAX = 200` in `jobs/reports.ts`) but uses it only when it joins a word-for-word line to a remark (`withRemark`). A line the model words itself has no limit anywhere on the window side that code enforces: the `say` field of the reply schema has none, and nothing trims it. The fixed part of the prompt does ask for "one or two short sentences" (`SPEAKING` in `person.ts`), and the model often does not keep to it. So the model's long lines are said with their last words chopped off mid-word.

Two harms:

1. **What players see.** The crew stop mid-word several times a round. This was seen in `round-23.57.07` on 2026-11-17 and written in the owner's notes on the staff meeting as "a say is cut at 200 characters, which cut the head's LLM-worded order mid-word", listed there as "Not fixed and not yet on the plan". No plan or change log entry took it up, and it is still there in the latest rounds.
2. **What hearers act on.** Where a hearer's next step is read from a line, the window has the model word it and then checks that the needed words are in it (`mustSayNeeds`, the `needs` of a `Plan` or a `toTell`). If they are missing, it says the plain line instead. That check runs on the model's whole line, before the server cuts it. A line that has the needed words past character 200 passes the check, and then the words are cut off on the server. The hearer's code never sees them. For example the technician's "crate N is out in the lobby" (`jobs/cargo.ts:1954`, `needs` = the number, then "lobby"): a model that greets and chats first and ends "...it is out in the lobby" over 200 characters passes, is cut before "lobby", and the janitor who came for the crate is not told by code that it is out.

One concrete case, from the round: the Head of Personnel's order to a technician in `round-23.57.07`, `game.log` line 309:

    [2026-11-18 06:04:17.812] GAME: Crew NPC *no key*/(Innocent Tireman) (owner: zimfire) was told by its brain to say: Roswell Sauter, welcome aboard Space Station 13; I am Innocent Tireman, Head of Personnel. Adan here needs some better cleaning gear than a rag, so could you place an order for a crate of janitorial s

And from the most recent round, `round-20.43.32` (2026-11-19, 03:00:05 in the log):

    ... was told by its brain to say: Abel Murphy, since you're already heading for Mining, tell Jean-Luc there's a door waiting for him in the hallway. Don't ask me to push it open myself; my hands are busy with your crowbar and the cont

A grep of every round's `game.log` for says of 199 characters or more that do not end in a stop finds such lines in 31 of the rounds under `data/logs/2026/11/`, from one to sixteen a round (16 in `round-01.53.17`, 6 in `round-20.00.21`), 106 in all. Some of the 199-character lines may be whole lines that happen to end without a stop; nearly all end mid-word.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:151`, in `tool_say`:

    text = trim(copytext_char(text, 1, CREW_NPC_SAY_MAX_LENGTH + 1))

`tgui/packages/tgui/interfaces/CrewBrain/prompt.ts:300`, the reply schema, with no length on `say`:

    say: parts.maySaySilent
      ? { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] }
      : { type: 'string', minLength: 1 },

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1370` to `:1418`, where the model's line is taken: `withoutHandles`, then for a line that must carry words, the test on the whole line:

    if (mustSay && mustSayNeeds && !exact) {
      for (const action of actions) {
        if (
          action.tool === 'say' &&
          !mustSayNeeds.test(String(action.text ?? ''))
        ) {
          action.text = mustSay;
        }
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/reports.ts:47`: `const SAY_MAX = 200;`, read only in `withRemark`.

## How it was found

Seen in round logs (the two lines quoted, by grep: `grep -h "was told by its brain to say: " data/logs/2026/11/*/round-*/game.log`, keeping lines whose text is 199 characters or more and does not end in `.`, `!`, `?` or a quote). Then read in the code: nothing on the window side bounds a model-worded line but the request in the prompt. Not seen: a case where a needed word was cut and a hearer missed it. That half is read from the code.

## How to fix it

1. In `brain.ts`, where the reply's `say` actions are cleaned (right after `withoutHandles`, about line 1373, so before the `exact` branch and the `mustSayNeeds` test at about line 1410), cut each line to fit: if it is over 200 characters, keep up to the last `.`, `!` or `?` at or before character 200; if there is none past about character 60, cut at the last space before 200 and add a full stop. Put the helper beside `withRemark` in `jobs/reports.ts` and use `SAY_MAX` from there, so there is one number. Move `SAY_MAX` to a shared place if `reports.ts` is the wrong home.
2. Do the `mustSayNeeds` test after the cut, not before. A trimmed line that no longer holds the needed words falls back to `mustSay`, as it does today when the model leaves them out.
3. The PDA needs nothing here. `tool_message` does cut at `CREW_NPC_MESSAGE_MAX_LENGTH` (200, `crew_npc_cargo.dm:702`) the same way, but the model never words a PDA message: the reply schema (`prompt.ts:290` on) has no `message`, and a `toTell` sent by PDA goes out as the code wrote it (`driver.ts:452`, `act: { tool: 'message', ..., text: tell.line }`). A code-built PDA line over 200 characters would be a separate fault.
4. Optionally add `maxLength: 200` to `say` in the schema. It stops the model running on, but on its own it also cuts mid-word, so step 1 is still needed.
5. Keep the server's cut: the window is untrusted, and the cut is the last guard. It should seldom fire after this.

This keeps the rules: code decides what is said, the model only words it, and a dead model changes nothing.

## How to test the fix

- A small table of cases beside `tools/llm_crew/reports.ts`: a 250-character line with a full stop at 150 keeps 150; one with no stop is cut at a space and ends with a full stop; a line under 200 is unchanged; a `needs` line whose needed word lies past 200 falls back to the plain line.
- Type check.
- In the next round, the grep in "How it was found" should print nothing.

## Check

Checked by Opus 5.5 on 2026-11-19. Confirmed.

- The quotes are what the code says today: the server cut at `crew_npc_tools.dm:151`, `CREW_NPC_SAY_MAX_LENGTH 200` at `_defines.dm:98`; the `say` schema with no `maxLength` at `prompt.ts:300`; `SAY_MAX` read only in `withRemark` (`reports.ts:47`, `:231`); the `mustSayNeeds` test on the whole line in `brain.ts` at about `:1410`, after `withoutHandles` and before anything that bounds length. Nothing between `parseReply` and the `say` act trims it; `grep` for `SAY_MAX`, `slice(0, 200` and `maxLength` in the window finds no other limit on `say`.
- The needs case is real: `cargo.ts:1954` builds `needs` as `<item>.*lobby`, tested on the model's whole line; the server then keeps only the first 200 characters.
- Ran the finder's grep over `data/logs/2026/11/*/round-*/game.log`: 106 says of 199 characters or more that do not end in a stop, the same count.
- Not in the change log or the plans as fixed. `LLM_CREW_PLAN_SECURITY.md:133` notes the 200-character cut as a fact. The "owner's notes" quoted are the session memory on the meeting design, not a repo file.
- Corrected step 3: the PDA has no model-worded text to trim. Severity medium is right (players see it each round; work mostly still gets done, and the missed-needs half is read from code, not seen). Effort small.

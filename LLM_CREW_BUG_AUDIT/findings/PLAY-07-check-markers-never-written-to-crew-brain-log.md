---
id: PLAY-07
title: What the code did with each model reply is kept only in the window, so five next-round checks grep crew_brain.log for words it never holds
kind: bug
severity: low
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: logs
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1798, code/modules/llm_crew/crew_brain_link.dm:290, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1500, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1542, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1619, LLM_CREW_BUG_AUDIT/NEXT_ROUND_CHECKS.md:16
fix: Send decision.calls with each decision record in logDecision and write it as a calls field in write_brain_log
---

## What is wrong

After each model call, the window's code decides what is really done with the reply. It drops a line that sounds like an order, takes on an order it made out from what was heard, and drops a `remember` or `work` that nothing said called for. It writes each of these into `decision.calls`, with a tag in square brackets:

- `[sounded like an order: not said]`
- `[an order, made out from what was said]`
- `[nothing said called for it: not done]`
- and others: `[made out without the LLM]`, `[the LLM gave none]`.

`decision.calls` is shown in the Crew Brain window (`Details.tsx`) and nowhere else. The record sent to the server for `crew_brain.log` has `trigger`, `context`, `reply`, `error`, `ms` and `tokens`. It has no `calls`. The server writes only the fields it knows, so even a `calls` field sent by the window would be thrown away.

So `crew_brain.log` holds the model's raw reply, not what the body said or did. The reader of the log is misled both ways: a line the code held back (an arrest order a head was talked into) looks said, and an order the code made out from what was heard and acted on does not show at all.

`NEXT_ROUND_CHECKS.md` tells the reader to grep `crew_brain.log` for three of these tags to prove five fixes (PARSE-09, ASYNC-08 twice, TRUST-11, CARGO-06). Those greps find nothing in any round, whether the fix works or not. The only other place the tags exist is the window's memory, which is lost when the window reloads (a tgui build or a reconnect).

The concrete case, from round-15.44.36: the round has 1,085 decision records, 251 of them model calls. Casey Cooper says "Sunshine Langston, you are under arrest. Stand still." seven times, and a meeting line ending "your report, please." is said 13 times (three of them "Kailyn, your report, please."). Those lines are said by the code (their records are `ROUTINE (no LLM)`), so they are not the fault themselves. But they are heard, and they are in the talk sent to the model in the 251 model calls. Any `say` the code held back from one of those replies as sounding like an order, and any order the code made out from that talk, leaves no trace in `crew_brain.log`. `game.log` does not help for orders: it logs only `say` and `PDA` from the brain ("was told by its brain to say: ..."), not `work`. A held-back `say` can only be found by hand, by matching each raw reply against `game.log`'s say lines. The TRUST-11 and ASYNC-08 checks cannot be ticked from this round.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1798`, in `logDecision`. The record has no `calls`:

    const record = {
      npc: brain.id,
      kind: 'decision',
      trigger: decision.trigger,
      // What went with the fixed part this time: the notes, memory and earlier talk it was sent.
      context: (decision.sent[0]?.content ?? '').slice(card.length).trim(),
      reply: rawReply,
      error: decision.error ?? '',
      ms: decision.ms,
      tokens: decision.promptTokens ?? 0,
    };
    setTimeout(() => send?.('brain_log', record), LOG_SEND_GAP_MS);

`logDecision` is called at line 1760, after every `decision.calls.push`, so the full list is ready at that point:

    brain.sayingNow = false;
    logDecision(brain, decision, rawReply);

The tags are pushed only into `decision.calls`. `brain.ts:1500`:

    if (soundsLikeOrder(text, brain)) {
      decision.calls.push(
        `say(${JSON.stringify(text)}) [sounded like an order: not said]`,
      );
      return false;
    }

`brain.ts:1542`:

    if (ordered) {
      decision.calls.push(
        `work(${describeTask(brain, ordered)}) [an order, made out from what was said]`,
      );
    }

`brain.ts:1619`:

    if (calledFor === undefined && action.tool !== 'say') {
      decision.calls.push(
        `${formatAction(action)} [nothing said called for it: not done]`,
      );
      continue;
    }

The one reader of `decision.calls`, `tgui/packages/tgui/interfaces/CrewBrain/Details.tsx:218`:

    {decision.calls.length > 0
      ? decision.calls.join('\n')

The server side, `code/modules/llm_crew/crew_brain_link.dm:290`, in `write_brain_log`, keeps a fixed list of fields:

    	else
    		record["trigger"] = log_field(params["trigger"], CREW_NPC_LOG_FIELD_LENGTH)
    		record["context"] = log_field(params["context"], CREW_NPC_LOG_FIELD_LENGTH)
    		record["reply"] = log_field(params["reply"], CREW_NPC_LOG_FIELD_LENGTH)
    		record["error"] = log_field(params["error"], CREW_NPC_LOG_FIELD_LENGTH)
    		record["ms"] = isnum(params["ms"]) ? round(params["ms"]) : null
    		record["tokens"] = isnum(params["tokens"]) ? round(params["tokens"]) : null
    	rustg_log_write("[GLOB.log_directory]/crew_brain.log", json_encode(record), "true")

The checks, `LLM_CREW_BUG_AUDIT/NEXT_ROUND_CHECKS.md`:

    16:- PARSE-09: grep `crew_brain.log` for "[an order, made out from what was said]" ...
    41:- ASYNC-08: ... `crew_brain.log` shows work(...) [an order, made out from what was said] ...
    45:- TRUST-11: ... `crew_brain.log` shows "[sounded like an order: not said]" ...
    54:- CARGO-06: ... (`crew_brain.log` "[nothing said called for it: not done]") ...
    58:- ASYNC-08 (both halves): ... `crew_brain.log` shows work(...) [an order, made out from what was said] ...

The other three record builders (the `READING (LLM)` record near line 1218, the `CHOICE (LLM)` record near 1353 and the `ROUTINE (no LLM)` record near 1923) put their outcome into `reply`, so they are not affected.

## How it was found

Seen in a round log, then read from the code. In `data/logs/2026/11/19/round-15.44.36/crew_brain.log`:

    grep -c "made out from what was said\|sounded like an order\|nothing said called for it" crew_brain.log
    0
    grep -c '"kind":"decision"' crew_brain.log
    1085
    grep -c '"calls"' crew_brain.log
    0

834 of the 1,085 records are `ROUTINE`, `READING` or `CHOICE`; the other 251 are model calls written by `logDecision`. A record from the round shows the only fields there are:

    [2026-11-19 21:48:54.814] {"owner":"zimfire","npc":"npc2","name":"Tyson Jones","kind":"decision","trigger":"ROUTINE (no LLM) in Quartermaster's Office, ...","context":"","reply":"get_paper()","error":"","ms":0,"tokens":0}

Then the code above was read: the tags are written only into `decision.calls`, `logDecision` does not send it, and `write_brain_log` would drop it if it did. Not checked: which of the 251 model replies in this round had a line held back or an order made out from talk. That is the point of the fault: the log cannot say.

The change log already notes that "The brain log keeps the model's raw reply" (`LLM_CREW_CHANGELOG.md:897`, `LLM_CREW_PLAN_ROUND_0912.md:45`), as a fact found while reading a round, not as a fault to fix.

## How to fix it

Take the first way. It is two small edits and makes every past and future check readable.

1. In `logDecision` in `brain.ts`, add `calls: decision.calls.join(NEWLINE),` to `record`. Use the same `NEWLINE` constant the other records use.
2. In `write_brain_log` in `crew_brain_link.dm`, in the `else` branch, add `record["calls"] = log_field(params["calls"], CREW_NPC_LOG_FIELD_LENGTH)`. Keep it cut by `log_field` like the other fields, since everything in params comes from the client.
3. Keep the record small. `calls` is short (a few lines), but large records sent in the same millisecond collide (RT-06), and the window already sends more calls a minute than a non-admin is allowed (HOLE-26 is about the number of calls, not their size). Send it in the same record, not a new one, so no new call is added.
4. Leave `NEXT_ROUND_CHECKS.md` as it is: once `calls` is logged, the greps find the tags inside the `calls` field. If the fix is not made, the five checks must be changed instead to say "read the Crew Brain window's Details for that NPC before the window is closed or reloaded", which is weaker.

The other way, changing only the checks, leaves the log misleading about what was said, so I would not take it alone.

## How to test the fix

- Type check the window (`tsc` for `tgui/packages/tgui`) and compile the server.
- In the simulator (`tools/llm_crew/`), run a scenario where a head is asked to have someone arrested and one where an order is given in passing. The simulator plays the server, so check that the `brain_log` act it receives has a `calls` field holding `[sounded like an order: not said]` and `[an order, made out from what was said]`.
- In the next round, `grep -c '"calls"' crew_brain.log` should equal the number of model-call records, and the five greps in `NEXT_ROUND_CHECKS.md` should find their tags when the case comes up.

## See also

- HOLE-12: the server's answer to each tool call is logged nowhere. That is the body's side; this is the window's side of the same gap.
- RT-06 and HOLE-26: limits to keep in mind when adding the field.

## Check

Confirmed. I tried to find a place where the tags reach the log and found none.

- The code still matches every quote. In `brain.ts`, `decision.calls.push` is at lines 1500, 1542, 1566, 1591, 1619, 1639, 1646, 1729, 1736 and 1744. `logDecision` is called once, at line 1760, after all of them. Its `record` (lines 1798 to 1808) has no `calls`. The only other reader of `decision.calls` is `Details.tsx:218`.
- `ui_act` in `crew_brain_link.dm:268` passes `params` straight to `write_brain_log`. In the `else` branch (lines 308 to 314) only `trigger`, `context`, `reply`, `error`, `ms` and `tokens` are copied into the record. Any other field is dropped.
- `game.log` does not make up for it. Only `say` (`crew_npc_tools.dm:167`) and `PDA` (`crew_npc_cargo.dm:785` to `808`) are logged as "was told by its brain to". A `work` the code made out from talk is not logged with its tag anywhere.
- In `round-15.44.36/crew_brain.log` I counted 0 lines with any of the five tags, 1,085 decision records, 251 model-call records and 0 `"calls"` fields, as the finder said. The five greps in `NEXT_ROUND_CHECKS.md` (lines 16, 41, 45, 54, 58) can never match.
- Corrected: the arrest line is said seven times, not six, and a "your report, please." line 13 times, not seven. Both are said by the code (`ROUTINE (no LLM)` records), so I reworded the case to say what the round really shows.
- Severity lowered from medium to low. The crew does nothing wrong. By `FORMAT.md` this is "a test or tool that misleads" and log readers misled, which is low. It is still worth doing soon, since five checks of this round's fixes depend on it.
- No duplicate. HOLE-12 is the server's answer to each step. RT-06 is two records in one millisecond. HOLE-26 is the number of calls a minute. None covers the window's `calls` list. The change log line 897 and `LLM_CREW_PLAN_ROUND_0912.md:45` note that the log keeps the raw reply but list nothing to fix.
- The fix is sound. `NEWLINE` exists in `brain.ts:77`. `log_field` cuts the new field like the others, so a bad client cannot make it longer than 6,000 characters. It adds no new call. It keeps the project's rules, since it only writes down what the code already decided. It also helps with the owner's wish, said this session, to keep the brain history longer: the tags would then outlive a window reload in the log, even before the window keeps its own history.
- Not checked: I did not build, type check or run the simulator.

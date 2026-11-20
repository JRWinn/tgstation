---
id: RT-06
title: Two large brain log records sent in the same millisecond still collide, and the second is lost with a duplicate ID runtime
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: logs
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1664, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1679, tgui/packages/tgui/events/act.ts:35, code/modules/tgui/tgui_window.dm:393
fix: Send every brain_log record through one queue in brain.ts that lets out at most one record every few tens of milliseconds, instead of a fixed 300 ms delay per record
---

## What is wrong

Any `act` whose payload is over about 2 KB is sent in chunks, and the chunked message is named by the time it was sent, to the millisecond: `const id = \`${Date.now()}\`` in tgui's `act.ts`. The server refuses a second chunked message with the same name: `create_oversized_payload` throws "Attempted to create oversized tgui payload with duplicate ID." and drops it. So two large messages sent in the same millisecond lose the second.

Most brain log records are large. Measured from every `crew_brain.log` on disk: 7,962 of the 8,887 decision records and 250 of the 320 card records come to more than 2 KB once URL-encoded, so each of them is sent in chunks. (The routine, no-model records are all small.)

This was seen once, in round-16.16.36 (build a4406362, before the first commit), and a fix went in: a decision record is now sent 300 ms after it is made (`LOG_SEND_GAP_MS`), and the card that goes with it is sent at once, so those two no longer meet. The comment says why: "Two large messages sent in the same millisecond collide on the way to the server."

The fix spaces out the two records of one decision. It does not space out records of different decisions, because every record gets the same 300 ms. Any two large records created within the same millisecond are still sent in the same millisecond, 300 ms later; and a card sent at once for one body can land in the same millisecond as another body's decision record whose 300 ms are just up. The second is dropped with the runtime, and the round's brain log is missing that model call: what it was told and what it answered. Nothing else is lost (tool calls are small and are not chunked), so this is only the log.

One concrete case: two bodies' model calls come back together (Ollama set to answer more than one request at a time, or two short calls queued back to back). `logDecision` runs for both in one JavaScript turn. Both `setTimeout(..., 300)` fire in the same turn 300 ms later, `Date.now()` is the same for both, both are over 2 KB, both are named, say, "1795000123456", and the server keeps the first.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1664` and `:1679`, in `logDecision`:

      if (card !== brain.loggedCard) {
        brain.loggedCard = card;
        act?.('brain_log', { npc: brain.id, kind: 'card', text: card });
      }
      // Two large messages sent in the same millisecond collide on the way to the server.
      const send = act;
      ...
      setTimeout(() => send?.('brain_log', record), LOG_SEND_GAP_MS);

The same fixed delay is used at `brain.ts:1131`, `:1266` and `:1803`.

`tgui/packages/tgui/events/act.ts:35`, in base tgui:

      if (urlSize > 2048) {
        const chunks: string[] = stringifiedPayload.split(chunkSplitter);
        const id = `${Date.now()}`;

`code/modules/tgui/tgui_window.dm:393`, in base tgui:

    /datum/tgui_window/proc/create_oversized_payload(payload_id, message_type, chunk_count)
    	if(oversized_payloads[payload_id])
    		stack_trace("Attempted to create oversized tgui payload with duplicate ID.")
    		return

## How it was found

Seen in a round log: `data/logs/2026/11/16/round-16.16.36/runtime.log`, "Attempted to create oversized tgui payload with duplicate ID." from `create oversized payload("1794867513668", "act/brain_log", 3)`. That build predates the 300 ms delay. No later round has the runtime. The sizes above were measured by a throwaway Python script over every `crew_brain.log`, URL-encoding each record the way `act.ts` does. The same script over every `href.log` of 18 and 19 November found 26,721 `tool_call` acts, the largest about 740 characters encoded, none chunked: so only the log is at risk. That the collision can still happen is read from the code; it has not been seen since the fix.

## How to fix it

1. In `brain.ts`, replace the per-record `setTimeout(..., LOG_SEND_GAP_MS)` with one small send queue for brain log records: push the record, and if no send is pending, send the head and schedule the next one at least, say, 20 ms later. The card goes through the same queue, ahead of its decision. With one queue, no two records can ever share a millisecond, whichever bodies they come from.
2. Keep the 300 ms only if it is wanted for another reason; the queue makes it unnecessary for this one.
3. The base-tgui alternative, giving the chunked message a name that cannot repeat (`${Date.now()}-${counter++}`), would fix it for every window, but it is a change to base tgui and not ours to make without the owner's word.

## How to test the fix

- Type check the window.
- In a round, `runtime.log` must not show the duplicate ID line, and the count of decision records in `crew_brain.log` should match the count of model calls the window shows.
- A quick check without a round: in a throwaway script, call the queue's push twice in one turn and see that the two sends are made at different times.

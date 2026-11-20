---
id: GAP-15
title: Loose wording and bad spelling are understood only for warrants and pardons sent to security by PDA, every other typed order still needs the exact words
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:662, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:178, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:73, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:147
fix: Lift the forgiving speller and the small LLM reader out of security into shared code, and give each job's order reader a list of the orders it takes so the same last-resort question serves all of them
---

## What is wrong

The owner, 2026-11-18: "I do use the LLM so my spelling can incorrect and I was hoping that there could be more variations that it would understand", and, asked about the LLM as the reader of last resort: "yes, last resort works", with the condition that it be its own small call ("if we send too much to the LLM it [chokes]"). Recorded in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md` under M5 and in the memory note "loose wording for orders": "the user expects typed orders to crew to be understood with loose wording and bad spelling".

It was built for one desk only. Both layers live in security's files and are called only from security's reader:

- the speller (`mendWords`, `closeName` in `jobs/security.ts`), which mends "warrent", "arest", "pardn" and misspelt names;
- the LLM reader (`deskUnread`, `deskRead` in `jobs/desk.ts`; `buildReading`, `readReading`, `readingAsOrder` in `jobs/security.ts`; `readingQueue` in `brain.ts`), which answers one question with three fields: warrant, pardon or neither; the name; the minutes.

And only for a PDA message. The change log's 16:50 entry says so: "Orders said aloud that code cannot read are not put to the LLM reader. The voice answers them, as before."

Everything else the Captain types is still matched by fixed words with no speller and no reader:

| Order | Read by | What a typo does |
| --- | --- | --- |
| An order of supplies to the Quartermaster ("2 crates of janitoral suplies") | crate kinds by name in `jobs/supply.ts` and `jobs/quartermaster.ts` | answered with what cargo can get, or taken as no order |
| The Captain's yes or no to a big purchase | two regexes in `jobs/quartermaster.ts:133` to `:137` | asked "is that a yes or a no to order 2" at most twice, then the order is held |
| "Leave", "throw X out" | `LEAVE_WORDS` and the put-out words in `jobs/guarding.ts:73` | not obeyed, the voice argues or agrees and nothing happens |
| "Hold a meeting" to a head | the meeting-order words in `jobs/head.ts` | no meeting |
| "Go and look at the X" | `ORDER_SOUNDS` in `jobs/orders.ts:27`, with the main LLM turn as the first reader | this one does have the model, but through the full talk prompt |
| "Emitters off", "light the engine" to engineering | `jobs/engineering.ts` | not acted on |
| "Try again" to security, a sighting ("Pun Pun is in the Bar") | `TRY_AGAIN_WORDS`, the sighting reader in `jobs/security.ts` | "there is no warrant on ..." or nothing |

One case: the Captain PDAs the Quartermaster "order 2 jantorial suply crates for the HoP pls". `mendWords` is never called on it (it is only called from `readWarrant`, `readPardon` and `deskTakes`), no crate kind matches, and the Quartermaster answers with the list of what cargo can get. The Captain has to type it again in the crate's exact name.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:662`:

    export function deskUnread(
      brain: NpcBrain,
      from: string,
      fromJob: string,
      text: string,
    ): boolean {
      if (!isHead(fromJob) || isSecurity(fromJob)) {
        return false;
      }
      const desk = deskOf(brain);
      desk.unread ??= [];

It is reached only from security's PDA reader. `mendWords` (`jobs/security.ts:178`) is imported only by `jobs/desk.ts`.

## How it was found

Read from the code against the plan and the change log. No model was called. `desk.ts` and the callers of `mendWords` were read. The other rows of the table were found by searching for each job's word lists, not by reading each reader end to end, so the right-hand column is what the code suggests, not what a round showed: whoever builds this should try each with one misspelt line first.

## How to fix it

Keep the rules: code carries every name and number, the model's answer is checked against the message before it is believed, the sender always gets the fixed read-back, and no answer means "I did not follow that".

1. **Move the general parts.** New file `jobs/reading.ts`: `mendWords` (taking the list of words it may mend to as an argument, not security's fixed list), `closeName`, the queue entry type, and a generic `buildReading(message, choices)` / `readReading(reply, choices, message)`. `jobs/security.ts` keeps its own word list and calls these.
2. **One question, a job's own choices.** Each job that takes typed orders gets an optional hook on `Job` (`jobs/job.ts`): `reads?: { kinds: Record<string, string>; asOrder(reading): string }`. `kinds` is the handful of orders it takes, each in a few words ("an order for supplies", "yes to a purchase", "no to a purchase"). `asOrder` puts the model's reading into the fixed words the job's code already reads, exactly as `readingAsOrder` does for a warrant. The prompt stays about 100 words: the message, the kinds, and the fields.
3. **Refuse what is not in the message.** As security does for a name: a crate kind or a number the model returns must be found in the message by `closeName`-style matching against the job's known list (`brain.orderable`, the names on the PDA), or the reading is dropped.
4. **Where to call it.** In each job's `readsMessage`, at the point where it gives up on a PDA message from the Captain or a head (the Quartermaster's "what cargo can get" answer, a head's unread message). Use the same throttle: two waiting at most, one every five seconds (`UNREAD_MOST`, `READING_EVERY_MS`).
5. **Spoken orders.** A line said to a body by the Captain or its head, which code cannot read and which names it (`addressing.ts` decides who was spoken to), goes through the same reader before the voice answers. This is the part the 16:50 entry left out. Mind the prompt budget: it is a second call, not more text in the first.
6. **Run the speller first, always.** `mendWords` with the job's own words costs nothing and would catch most of the table above without the model.

Question for the owner: the reader bends the standing rule "every line with a name or a number is read by code alone" (the change log says so). It was approved for warrants. Is it approved for orders that spend money (the Quartermaster's), given that the read-back and the Captain's yes on a big purchase both stand between a misreading and a crate?

## How to test the fix

- `tools/llm_crew/security.ts` already has cases for `mendWords` and the readings: move them with the code, and add tables for the Quartermaster's kinds in `tools/llm_crew/book.ts`.
- Simulator: the `loose` scenario covers a loosely worded warrant. Add one where a head sends the Quartermaster a misspelt order, with a quiet and a dead LLM: with the model dead the speller alone must read it or the head is told it was not followed.
- `tools/llm_crew/voice.ts` or `choose.ts`-style run of the reading question against the real model, which the 16:50 entry says has never been done even for warrants.

---
id: DESK-01
title: Any PDA message a janitor cannot read is taken to mean its supplies have come, and sends it to the Cargo Lobby
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:881, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:296, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:756, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1296
fix: Set suppliesSentAt in the janitor's readsMessage only when the message has the head's fixed words what you asked for has come, and ignore every other message
---

## What is wrong

The janitor's `readsMessage` reads a PDA message as a mess call, as word about a door, or as word that a mess is beyond another janitor. Anything else falls to the last three lines, which take it to mean "what you asked for has come", whoever sent it and whatever it says:

- `suppliesSentAt` is set, so for ten minutes (`SUPPLIES_WAIT_DS = 6000`) `suppliesWaiting` is TRUE.
- `suppliesAt` is the first room named in the message, or the Cargo Lobby if none is.
- `toldHeadAt` is set back to null, so the janitor counts as never having told its head what it needs.

`brain.ts:556` clears `suppliesSentAt` on every update while the janitor holds a proper tool, so a janitor with a mop or spray is not hurt. A janitor with nothing, or only a rag, is. That is every janitor at the start of a round now that nothing is given at spawn.

Messages that reach a janitor and are none of the three kinds:

- Anything the Captain types: "How is it going?", "Good work", "Go to the Bridge".
- A mess call that names no room the janitor knows and is not from cargo: "There's vomit all over the hallway outside medbay". `named` is undefined, so the mess branch does not return, and the line falls through.
- A head's or an officer's free reply written by the model and sent by PDA.

Concrete case. Start of round. The janitor has searched the Custodial Closet, found nothing, and sent its head "I need something to clean with for my work. Could you get it ordered, please?" (`toldHeadAt` set). Its SUPPLIES task is blocked on "you have told your head what you need". The Captain sends it "Thanks, hang in there." Then:

1. `readsMessage`: no mess words, no door words, so `suppliesSentAt = at`, `suppliesAt = CARGO_LOBBY`, `toldHeadAt = null`.
2. `syncTasks`: `supplyStep` is now ready, so the block is lifted.
3. `supplyStep`: no known supply, `suppliesSentAt` is fresh, so "your PDA says what you asked for has come and is in the Cargo Lobby. You are going there to get it." It walks across the station.
4. In the lobby it searches any storage there, finds nothing, and with `toldHeadAt` null goes on to `needStep` and asks its head again.
5. For the ten minutes, `JANITOR.needs` returns null (`!suppliesWaiting(brain)` is false), so at a staff meeting its report says it needs nothing. With only a rag, the SUPPLIES task is raised to `asked` (janitor.ts:517) and goes ahead of calls to messes.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:881`, the end of `readsMessage`:

    // Word that what it asked for has come, and where it is.
    brain.suppliesSentAt = at;
    brain.suppliesAt = placeNamedIn(brain, heard) ?? CARGO_LOBBY;
    brain.toldHeadAt = null;

The comment over `readsMessage` says what it assumes, which is no longer true since supplies come through the head:

    // list as something someone is waiting on. Any other message is, most likely, cargo saying the
    // supplies are in.

The mess branch, which does not return when no room is named (janitor.ts:833):

    if (named) {
      ...
      return;
    }

The only message that is meant to land here, `head.ts:1296`:

    line: `${ask.who.split(' ')[0]}, what you asked for has come. It is in the ${room}.`,

## How it was found

Run in a throwaway bun script in the system temp folder (fixtures `janitor(null)`, the real `readsMessage`, `syncTasks` and `planTask`): a janitor with nothing, blocked on having told its head, sent "Thanks, hang in there." by the Captain. It printed:

    before blocked you have told your head what you need, and will hear when it has come
    fields 3005 Cargo Lobby null
    after open You have nothing to clean with, but your PDA says what you asked for has come and is in the Cargo Lobby. You are going there to get it. {"tool":"go_to","place":"Cargo Lobby"} needs: null

Also read from the code, and the senders checked: every fixed PDA line sent to a janitor (head.ts, cargo.ts, meetings.ts, pickups.ts) was looked up. Meeting calls, crate pickups and the wanted list are taken before the job's `readsMessage` (brain.ts:586), so they do not fall through. Not seen in a round.

## How to fix it

1. In `jobs/head.ts`, export the fixed words as a constant, for example `export const HAS_COME = 'what you asked for has come';`, and build the line at head.ts:1296 from it.
2. In `jobs/janitor.ts` `readsMessage`, replace the last three lines with:
   - if `text.toLowerCase().includes(HAS_COME)`: set `suppliesSentAt`, `suppliesAt` from the words after "It is in the", and `toldHeadAt = null`, as now;
   - otherwise do nothing.
3. Keep the comment over `readsMessage` true: say that only the head's fixed line means the supplies have come.
4. Check that no other job still sends a janitor "supplies are in" in other words (cargo used to). A grep for `suppliesSentAt` shows only `pickups.ts:311`, which is the janitor's own pickup and does not go through `readsMessage`.

## How to test the fix

- Simulator: a janitor with no tool that has told its head, then sent a PDA message from the Captain with no mess or door words. It must stay where it is and its SUPPLIES task must stay blocked. Then send it the head's "what you asked for has come. It is in the Custodial Closet." and check it goes there.
- Type check from `tgui/`.
- Next round, grep `game.log` for "your PDA says what you asked for has come" and check each one follows a "what you asked for has come" line in `pda.log`.

---
id: PARSE-08
title: I'm locked out, open the door is read as asking to be let out, and I want to leave, open the door from inside is not read as asking out, so neither door is opened
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:158, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2270, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1261, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2324
fix: Decide in or out by where the asker stands when the technician can see them, and otherwise by let me out, leave, get out, done in, never by the bare word out
---

## What is wrong

When someone asks a cargo technician about the door of its post, aloud or by PDA, the technician decides whether they want **in** or **out** with one test: does the line hold the word "out" anywhere (`LET_OUT_WORDS = /\bout\b|\bdone in\b/i`).

Two ordinary ways of asking are read the wrong way round:

1. **From outside, wanting in, with "out" in the line**: "I'm locked out, can you open the door", "donna im out here at the door, let me in", "open the door so I can get my crate out". The ask is stored with `out: true`. `mayPass` then looks for the person inside the post; they are not inside, so it returns null. No door task is made. And the PDA refusal ("Sorry, nobody here sent for you") is skipped because it is only sent when `!asked.out`. So a janitor that cargo itself sent for, a security officer with a warrant (`mayPass` returns null before it reaches the security check), or anyone else, gets no door and, by PDA, no answer at all.
2. **From inside, wanting out, without the word "out"**: "I want to leave, open the door", "im done, can you open the door", "can I leave? the door is shut", "open the door I need to go". For someone the technician can see standing inside its rooms, `idleWord` is true (no room named, no `LET_OUT_WORDS`), so the ask is not even recorded. "let me leave" has no "door" in it and is not an ask at all.

The crew's own fixed asks are worded to pass ("Could you let me in, please?", "I am done in the X ... Could you let me out"), so the simulator does not see this. A player, or the model's own wording of an NPC's ask, does.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:156`:

    const DOOR_WORDS = /\bdoor\b|let (me|us) (in|out|through)|open up/i;
    /** The words that mark a request for a door as wanting out, not in. */
    const LET_OUT_WORDS = /\bout\b|\bdone in\b/i;

`cargo.ts:2270`, in `overhears`:

    const idleWord =
      !askedRoom &&
      !LET_OUT_WORDS.test(heard) &&
      !!asker &&
      !!seenInside(brain, asker);
    if (
      speaker &&
      event.details.said_to !== 'other' &&
      DOOR_WORDS.test(heard) &&
      !idleWord
    ) {
      brain.doorAsked = {
        ...
        out: LET_OUT_WORDS.test(heard),

`cargo.ts:1261`, in `mayPass`, for an ask marked `out`:

    if (out !== false) {
      // Someone it can see standing inside one of its rooms, who cannot let themselves out.
      const seenIn = person ? seenInside(brain, person) : undefined;
      if (seenIn) {
        return { name, room: seenIn, out: true };
      }
      ...
    }
    ...
    if (out || already || (inside && !person && inside.room === wanted)) {
      return null;
    }

`cargo.ts:886`, the PDA refusal, skipped for an ask marked `out`:

    if (
      asked?.byPda &&
      !asked.refused &&
      !asked.answered &&
      !asked.out &&

## How it was found

Run. A throwaway script (`parse/door.ts` in the scratchpad) tested the two expressions, copied exactly:

    I'm locked out, can you open the door             door: true  out: true
    donna im out here at the door, let me in          door: true  out: true
    can you open the door so i can get my crate out   door: true  out: true
    let me in                                         door: true  out: false
    i want to leave, open the door                    door: true  out: false
    im done, can you open the door                    door: true  out: false
    let me leave                                      door: false out: false
    get me outta here                                 door: false out: false

The rest (what `mayPass` and `idleWord` make of it) is read from the code, not run. Not seen in a round log.

## How to fix it

1. Where the technician can see the asker (`brain.peopleInView`), decide by where they stand, not by their words: seen inside one of its rooms (`seenInside`) is out, seen outside is in. That is what a person at a counter would go by.
2. Only for an ask by PDA, or from someone out of sight, go by words. Out: `let (me|us) out`, `\bleave\b`, `get (me |us )?out`, `outta here`, `done in`, `(i'?m|i am) (done|finished)`, `shut in`, `locked in`, `stuck in`. In: `let (me|us) in`, `locked out`, `(i'?m|i am) (out here|outside)`, `come in`, `get in`. If both or neither, in.
3. Add "let me leave", "get me out" and "i want out" to `DOOR_WORDS`'s second alternative, so an ask to be let out with no "door" in it is still an ask.
4. In `mayPass`, put the security check before the `out` test returns null, so an officer is let in whatever words it used.

## How to test the fix

- A table in `tools/llm_crew/` that sets a technician at its post with a janitor it sent for standing in the lobby, passes `overhears` each "in" line above, and wants a door task with `out: false`; and with a player seen inside the bay, each "out" line above, wanting `out: true`.
- `bun tools/llm_crew/sim.ts quiet office`, `quiet nested` and `quiet trapped` must still pass.

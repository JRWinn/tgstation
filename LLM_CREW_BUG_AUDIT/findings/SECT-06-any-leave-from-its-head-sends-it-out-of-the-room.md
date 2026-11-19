---
id: SECT-06
title: Any line from its head or the Captain with leave, get out or out of here in it sends a crew member out of the room it is in and keeps it out ten minutes
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:73, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:687, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:202, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:507
fix: Take it as an order to leave only when a clause, with the body's name and please taken off, is a bare leave or get out (of here, of the room) said to the body, not a negation and not the speaker of itself
---

## What is wrong

`guardOverhears` takes a line as "leave this room" when it comes from someone the body answers to, is said to it, and has any of the `LEAVE_WORDS` anywhere in it. The word "leave" with something else as its object, a negation in front, or "out of here" said of a thing, all count.

The body then says "Yes, Walker. I am going.", walks out to where it came from, and for ten minutes (`KEPT_OUT_MS`) does no work in that room: `barred` is true and the driver skips every task placed there.

The test that it is not at its post (`brain.location !== brain.post`) does nothing for anyone without a post. Janitors and the Head of Personnel have none (`post_place` is set only in `crew_npc_cargo.dm`, `crew_npc_engineering.dm` and `crew_npc_security.dm`), so for a janitor every room counts.

Concrete cases, each said to the janitor Tolly Field in the Bar by the Head of Personnel, Walker Wolfe, standing beside it:

- "Tolly, don't leave the bar until it is clean."
- "Tolly, leave the mop bucket by the door."
- "Tolly, please leave the wet floor signs out."
- "Get that vomit out of here, Tolly."
- "Tolly, the bar is unauthorized for the clown, keep an eye out"

Every one set `toldToLeave` for the Bar, made `barred(b, 'Bar')` true, and gave the step "Yes, Walker. I am going." The first is the exact opposite of what was asked. The mess it was told to clean is left for ten minutes.

The same holds for the Captain and every crew member, since the Captain is `superior` to all of them, and for any head's lines put in words by the model.

The head speaking of itself counts too (found by the checker): "Tolly, I will leave you to it." and "Thanks Tolly, I am off, I have to leave now." both set it. So does a fixed line in our own code: a head that is shut in asks its own staff "Tolly, could you let me out of the Bar, please? I cannot get out of here by myself." (`nextStep`, `driver.ts:351`), and "out of here" with the name in it sets `toldToLeave` on the janitor it asked for help, for the room the janitor is in. Then the leave step (`driver.ts:434`) comes before anything else the janitor would do, and it walks off from the head it was asked to let out. That last part is read from the code, not run.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:73`:

    const LEAVE_WORDS =
      /\b(leave|get out|go away|clear off|clear out|out of here|out you go|off you go|not authori[sz]ed|unauthori[sz]ed)\b/;

`guarding.ts:687`, in `guardOverhears`:

    if (
      superior &&
      LEAVE_WORDS.test(heard) &&
      (event.details.said_to === 'me' || namesPerson(heard, brain.name)) &&
      brain.location !== brain.post
    ) {
      brain.toldToLeave = {
        by: speaker,
        room: brain.location,
        at: Date.now(),
        said: false,
      };
      brain.keptOut[brain.location] = Date.now() + KEPT_OUT_MS;
    }

`guarding.ts:202`, `barred`, and `tgui/packages/tgui/interfaces/CrewBrain/driver.ts:507`, where it stops the work:

    if (task.place && barred(brain, task.place)) {
      continue;
    }

## How it was found

A bun script in the system temp folder (brain from `tools/llm_crew/fixtures`) put a janitor in the Bar with the Head of Personnel in view (`superior: true`) and fed each line above to `guardOverhears` with `said_to: 'me'`. Each printed `toldToLeave {"by":"Walker Wolfe","room":"Bar",...} barred Bar: true step: "Yes, Walker. I am going."`. Not seen in a round.

## How to fix it

1. Replace the bare `LEAVE_WORDS` test with a reader of the order itself, `toldToLeaveBy(heard, brain)` in `guarding.ts`. Split the line into clauses on `[.,!?;]`, take the body's first and last names, "please", "now", "at once" and "right now" off each, and take it as an order to leave only when a clause is then one of:
   - `leave`, `leave (here|this room|the <room it is in>|us|me)`;
   - `(get out|go away|clear off|clear out|off you go|out you go|out)`, optionally followed by `of here`, `of (this|the) (room|<room it is in>)`;
   - `you (need|have|ought) to leave|go`, `you (are not|aren't) (allowed|authori[sz]ed) (in )?here`.
   Testing whole clauses this way, not words anywhere in the line, is what keeps out "get that vomit out of here", "leave the mop bucket by the door", "I have to leave now" and "I cannot get out of here by myself".
2. Return no order if the clause still has a negation in it: `not`, `don't`, `dont`, `never`, `no need to` (the third pattern above is the one that has "not" on purpose).
3. Drop "not authorized" and "unauthorized" from the words that send the body itself out: they describe someone, and the put-out words already carry them for strangers. If the owner wants "you are not authorized in here" to work, test for "you" before it.
4. Keep the rest as it is: who may say it (`superior`), said to it, and nobody told to leave its own post.
5. Have the voice keep its part: when the reader takes no order, the line goes to the model as talk, as any other line does.

## How to test the fix

Add a table of cases for `guardOverhears` (in `tools/llm_crew/security.ts` or a new one): each line above leaves `toldToLeave` null, and so do "Tolly, I will leave you to it.", "Thanks Tolly, I have to leave now." and "Tolly, could you let me out of the Bar, please? I cannot get out of here by myself."; "Tolly, leave.", "Leave the bar, Tolly.", "Tolly, get out of here.", "Off you go, Tolly.", "Out, Tolly. Now." and "Tolly, you are not authorized in here." each set it. The simulator's `leave` scenario ("Jan, leave.", `sim.ts:1353`) must still pass; run it with `evict` and `aside`, four at a time at most. In a round, grep `game.log` for "I am going." said by a crew member and read the line said to it just before.

## Check

Checked by Opus 5.5. The quotes at `guarding.ts:73`, `:687` (the test in `guardOverhears`), `:202` (`barred`) and `driver.ts:507` are what the code says today. `guardOverhears` is called from `brain.ts:661` for every `speech_heard` from a person, with nothing before it that reads the line as anything else. `superior` comes from the server's `answers_to` (`crew_npc_guarding.dm:59`): the Captain for everyone, and the head of the body's own department, so the Head of Personnel for a janitor. `namesPerson` (`guarding.ts:90`) is true for any line with "tolly" in it, so `said_to` does not even matter once the name is said. A janitor has `post: null`, so `brain.location !== brain.post` is always true for it.

I wrote my own script (scratchpad `chk/sect06.ts`, bun, the `janitor()` fixture put in the Bar, Walker Wolfe in view with `superior: true`). All five lines in the finding set `toldToLeave` and made `barred(b, 'Bar')` true. So did "Tolly, I will leave you to it.", "Thanks Tolly, I am off, I have to leave now." and our own shut-in ask from `driver.ts:351`, "Tolly, could you let me out of the Bar, please? I cannot get out of here by myself."; I added those to the body. What the janitor does next after the shut-in ask was not run.

Nothing in `LLM_CREW_CHANGELOG.md` or the plans chose this reading on purpose; GAP-15 lists `LEAVE_WORDS` only for orders that are not understood, the other side. Severity high stands: it is the wrong order acted on, the heads' model-worded talk to their staff will often have "leave" or "out of here" in it, and our own fixed line for a shut-in head sets it off on the very person asked for help. Effort small: one reader in `guarding.ts`. I rewrote fix step 1 to read whole clauses rather than words after the verb, which is simpler and also keeps out the speaker talking of itself, and I widened the test cases. Not seen in a round.

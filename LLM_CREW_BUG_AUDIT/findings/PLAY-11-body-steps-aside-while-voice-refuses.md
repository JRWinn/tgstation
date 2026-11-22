---
id: PLAY-11
title: Asked to step aside, the body steps aside while the voice says it will not until its work is done
kind: bug
severity: low
effort: small
confidence: likely
status: fixed
fixed_in: 56651fee88a
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/situation.ts:110, tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:69, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:407, tgui/packages/tgui/interfaces/CrewBrain/person.ts:121
fix: While a step aside stands, say the work is set down for now instead of You are in the middle of (unless doing is already the step itself), put the aside line first, and tell the model the step is already being made and cannot be put off
---

## What is wrong

When someone asks a crew member to step aside, the code moves the body at once (`asideStep`). The model is only asked what to say. Its answer can say the opposite of what the body is doing. A player sees the janitor step out of the way and, in the same breath, say it cannot step aside until it has finished mopping.

The prompt does tell the model. It is not that the line is missing. The line is there, but the lines around it pull the other way, and the model went with them:

- `describeSituation` puts "You are in the middle of cleaning up the mess here." first, from the server's `doing`. That stays true in the prompt while the body is stepping away from the mess.
- The janitor's cues then say "There is a mess here (...), and it is yours to clean with your mop."
- Only after those comes the aside line: "Kailyn Patterson asked you to step aside, and your body is stepping out of their way. You do not argue it or explain what you were doing: at most you say sorry."
- The spoken-to moment at the very end says "Answer them, whatever it is about". It says nothing of the ask being already met.

So two lines say "you are mopping, it is yours", one says "you are moving", and the last one says "answer". A small model reads "is stepping" as something still to be decided, and answers the ask with a reason to wait.

Concrete case, from round-15.44.36: Netta Rader, janitor, is mopping oil in the Cargo Bay. Kailyn Patterson loses her grip on a crate with Netta in the way and asks her, by name, to step aside. Netta's driver steps aside 0.9 seconds later. The model's reply, built from a prompt made before the step, comes 2 seconds after that and says she must finish mopping first. The body has already moved.

This is low: the body does the right thing and the work goes on. What is wrong is what a player hears, and the log reads as if the janitor refused.

The second fault in the same moment is not this one. Netta's line holds the words "step aside", and Kailyn's body took it as Netta asking her to step aside, and stepped aside from the janitor too. That is the word list taking in a line that is not an ask; see PARSE-04. PARSE-04 does not list this exact case (a refusal that names the words), so whoever fixes PARSE-04 should add it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/situation.ts:107`, in `describeSituation`:

    export function describeSituation(brain: NpcBrain): string[] {
      const job = jobFor(brain.job);
      const lines: string[] = [];
      if (brain.doing) {
        lines.push(`You are in the middle of ${brain.doing}.`);
      }
      lines.push(...job.cues(brain));
      lines.push(...guardCues(brain));
      lines.push(...asideCues(brain));

`tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:69`, in `asideCues`:

    export function asideCues(brain: NpcBrain): string[] {
      const asked = brain.asideAsked;
      return asked && Date.now() - asked.at < ASIDE_STANDS_MS + ASIDE_HOLD_MS
        ? [
            `${asked.by} asked you to step aside, and your body ${asked.done ? 'has stepped' : 'is stepping'} out of their way. You do not argue it or explain what you were doing: at most you say sorry.`,
          ]
        : [];
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:407`, in the janitor's cues:

      `There is a mess here (${brain.cleanableMesses.join(', ')}), and it is yours to clean with your ${brain.cleaningTool}.`,

`tgui/packages/tgui/interfaces/CrewBrain/person.ts:121`, `MOMENTS.spokenTo`:

    'Someone has just spoken to you. Answer them, whatever it is about: a question, a remark, a joke or a complaint, to do with your job or not. ...'

`asked.done` is set by the driver when the routine step is handed out, whether or not a spot was found (`driver.ts:945`, `brain.asideAsked.done = true`). The prompt for the answer is built when the line is heard, before the step, so it nearly always says "is stepping". In this round the model call took 2876 ms and was logged at 21:55:50.019, so its prompt went out at about 21:55:47.14, some 150 ms before the step was handed out at 21:55:47.293.

## How it was found

Seen in a round log, `data/logs/2026/11/19/round-15.44.36`.

`game.log`:

    [2026-11-19 21:55:46.392] GAME-SAY: *no key*/(Kailyn Patterson) (mob_3019) "Excuse me, Netta, could you step aside, please? I need to get this past you." (Cargo Bay (68,151,2))
    [2026-11-19 21:55:49.306] GAME-SAY: *no key*/(Netta Rader) (mob_3020) "Apologies, Kailyn; I must finish mopping this oil before I can step aside, lest it bring bad luck to your path." (Cargo Bay (68,151,2))

`crew_brain.log`, Netta's body moving by routine before her model answered:

    [2026-11-19 21:55:47.293] ... "name":"Netta Rader","kind":"decision","trigger":"ROUTINE (no LLM) in Cargo Bay, holding mop, bucket: Kailyn Patterson has asked you to step aside: you are in their way. You are stepping clear of them, and will get on with your own work once they are past.","context":"","reply":"step_aside(\"p7\")"

Netta's model decision, logged at 21:55:50.019 (2876 ms), has these lines in its prompt, in this order:

    You are in the middle of cleaning up the mess here.
    There is a mess here (pool of oil, footprints), and it is yours to clean with your mop.
    Kailyn Patterson asked you to step aside, and your body is stepping out of their way. You do not argue it or explain what you were doing: at most you say sorry.
    ...
    Someone has just spoken to you. Answer them, whatever it is about: ...

and its reply's "think" was "Kailyn wants me to move so she can pass through the mess I am tending."

Kailyn then stepped aside from Netta, the PARSE-04 half:

    [2026-11-19 21:55:49.640] ... "name":"Kailyn Patterson","kind":"decision","trigger":"ROUTINE (no LLM) in Cargo Bay, holding nothing: Netta Rader has asked you to step aside: you are in their way. ...","reply":"step_aside(\"p4\")"

Then read from the code above. One case only. Which of the competing lines did the most harm is a guess: the model was not run again with the order changed. Whether the reply would have been right with "has stepped" is not known.

## How to fix it

1. In `describeSituation`, when `asideCues(brain)` gives a line, do not push "You are in the middle of X". Push instead: "You have set down X for now to let <asker> past. You go back to it once they are past." Push the aside line straight after it, before `job.cues`. Leave `doing` as it is when it is the step itself: the server's `describe_doing` gives "stepping out of someone's way" for a `step_aside` walk (`crew_npc_hands.dm:494`), and "You have set down stepping out of someone's way" would be nonsense. In that case push "You are stepping out of <asker>'s way." or nothing, since the aside line already says it.
2. In `asideCues`, word the line as settled whether or not `done` is set yet: "<asker> asked you to step aside, and you are moving out of their way now. That is already done: you do not say you will wait, finish first or cannot. At most you say sorry." Keep "has stepped" for the hold after the step.
3. Leave the job cues as they are. They should still name the mess, so the janitor goes back to it after.
4. Do not add a check on the reply text. A list of refusal words would be one more word reader to get wrong (see PARSE-04). If plays show the model still argues after steps 1 and 2, the owner can decide whether the spoken-to answer to an aside ask should be a fixed "Sorry, <name>." from the code instead of the model.

## How to test the fix

- tgui type check for the window.
- In `tools/llm_crew/`, a prompt case: a janitor mid-mop, with `asideAsked` set and `done` false. Check the report has no "You are in the middle of" line and the aside line comes before "There is a mess here". If the voice tool can run the real model, run that prompt ten times and count replies that say it will wait or finish first. Do the same with the old prompt. After the fix there should be none, or far fewer than before.
- In the next round, grep `game.log` for "before I can step aside", "finish" and "first" in crew lines said within 5 seconds of a "could you step aside" to them.

## Check

Confirmed. I tried to prove it wrong and could not.

- **The code quotes are current.** `describeSituation` in `situation.ts` still pushes "You are in the middle of" first, then `job.cues`, `guardCues`, then `asideCues`. `asideCues` in `jobs/aside.ts` and the janitor's mess line in `jobs/janitor.ts` read as quoted. `MOMENTS.spokenTo` in `person.ts` reads as quoted. One thing was not quite right in the write-up: `done` is set when the step is handed out, not when it is taken. I mended that line. It does not change the fault.
- **The round log shows it.** In `round-15.44.36`, `game.log` lines 475 to 479: Kailyn's ask at 21:55:46.392, Netta's "I must finish mopping this oil before I can step aside" at 21:55:49.306. `crew_brain.log` line 385 is Netta's routine `step_aside("p7")` at 21:55:47.293. Line 387 is the model's answer, with the prompt lines in the order the finding gives, ending with the spoken-to moment. The reply's "think" is as quoted.
- **The body did move.** `game.log` has no line for a `step_aside` result, so this is only from the positions: at 21:55:45.080 Netta is at (67,151), and she speaks at 21:55:49.306 from (68,151). Where she was meant to go is not logged.
- **No guard stops it.** The prompt has the general rule "Promise nothing your body is not already doing" (`person.ts`), and the aside line itself. The model went against both. Nothing checks the reply against the step. So the fault is the prompt's weight and order, as the finding says. Whether the fix is enough is a guess until the model is run on the new prompt.
- **Not a duplicate.** I read the titles and fixes of every finding that names stepping aside: DRV-03 (fixed, about the six-second stand), DRV-08 (the 15-second hold), KNB-13 (fixed, when the hauler asks), JOBS-06 (back-off after a failed step), KNA-34 (a name later in the line), PARSE-04 (word list). None is about what the one asked says. HOLE-22 is about the model saying banned things, not this. The change log has no entry for it.
- **The PARSE-04 half is right too.** `crew_brain.log` line 386: Kailyn steps aside from Netta at 21:55:49.640, 0.3 s after Netta's line. Netta's line has "step aside" and starts with "Kailyn", so `asideOverhears` takes it. KNA-34's fix (only a name at the head of the line counts) would not stop it either, since Kailyn is named at the head. Whoever fixes PARSE-04 should add a line that says "before I can step aside" or "I can't step aside" as a case that must not match.
- **The fix.** Steps 1 and 2 are small, keep the rules (the code moves the body, the model only talks), and do not need the model to stall anything. I added one thing to step 1: once the server's `doing` is "stepping out of someone's way" (`describe_doing`, `crew_npc_hands.dm:494`), the swap must not turn it into "set down stepping out of someone's way". Step 4, no word reader on the reply, is right. Effort small is right.
- **Severity.** I left it low. The body does the right thing, and only the spoken line is wrong. It could be argued as medium, since a player notices it and the asks come in most rounds with hauling. The owner may want to move it.

Not checked: no model was run, so it is not known how often this reply comes, or whether the new wording stops it. Only one case was seen.

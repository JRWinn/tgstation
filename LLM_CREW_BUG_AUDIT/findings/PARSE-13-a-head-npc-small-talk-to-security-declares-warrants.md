---
id: PARSE-13
title: A crew head's small talk with the Head of Security, written by the model, is read as declaring a warrant, keep up the good work and arrest those troublemakers is a warrant on those troublemakers
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:710, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:302, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:128
fix: Have crew heads declare warrants only in the fixed warrantLine words, and have the desk take a spoken line from a head as a warrant only when it begins with the verb or the warrant words, not from words in the middle of a remark
---

## What is wrong

See also: TRUST-11 (the speaker's model is free to say an order at all; its fix in `think` stops these lines being said, this one's fix stops the desk reading a remark as a warrant), SECT-01 (negations and questions), SECT-21 ("is wanted on the bridge"). Those are about the human Captain's wording. This is about the other crew heads, whose spoken lines are written by the model.

`deskHears` takes anything said to the Head of Security (or to an officer keeping the list) by a head of department and puts it through `deskTakes`, and so `readWarrant`, which finds a warrant verb anywhere in the line. The Head of Personnel, Quartermaster and Chief Engineer are crew NPCs whose greetings and passing remarks are the model's words: they meet the Head of Security, they pass remarks in company (`passRemark`), they answer it. A friendly line to a security chief is likely enough to have "arrest" or "jail" in it.

When a head of department declares a warrant **on purpose**, its code does it in fixed words by PDA (`declareTrespass` in `wanted.ts`, `warrantLine`). Nothing it says aloud needs to be read as a warrant. But everything it says aloud is.

Run, as said to the Head of Security by a head (all of them are declarers):

    Keep up the good work and arrest those troublemakers!   warrant on "those troublemakers"
    I hear Pun Pun is wanted for stealing bananas.           warrant on "I hear Pun Pun", for stealing bananas
    Joan, did you arrest Bob yet?                            warrant on "Bob yet"
    Who would you arrest first, Joan?                        warrant on "first", for Joan
    I would jail half this crew if I could.                  warrant on "half this crew if"

Most of these name nobody, so nobody is arrested; but each is answered "I have that: a warrant for ...", sent to every head as a notice, and read out at every staff meeting for the rest of the round. A remark like "Joan, arrest Pun Pun if you see him, ha" puts a real warrant on Pun Pun.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:710`:

    export function deskHears(brain: NpcBrain, event: SenseEvent): boolean {
      ...
      // Its own staff are heard whoever they seemed to be speaking to. Anyone else has to be
      // speaking to it: a warrant talked about in its hearing is not a warrant declared.
      if (!isSecurity(job) && event.details.said_to !== 'me') {
        return false;
      }
      return deskTakes(brain, speaker, job, heard, true);
    }

`desk.ts:463`, in `deskTakes`: `const declared = readWarrant(text, knownNames(brain));`

`jobs/wanted.ts:142`, the one place a crew head declares a warrant, in fixed words by PDA:

    line: warrantLine(name, `trespass in the ${place}`),

## How it was found

Run for `readWarrant` (`parse/smalltalk.ts` in the scratchpad, with Pun Pun, Bob Hale, Dana Reyes and Joan Kerr known). That `deskHears` passes a head's spoken line to it is read from the code. Whether the model writes such lines in a round is not known: not seen in a round log. Hence "likely".

## How to fix it

1. In `readWarrant`, for a line **said aloud**, take the warrant words only at the start of a sentence (after an optional name and comma, "please", "can you", "could you", "I want you to"): `^(?:[A-Z][\w'-]*,\s*)?(?:please\s+|can you\s+|could you\s+|i want you to\s+)?(?:warrant|arrest|...)`. Keep the anywhere-in-the-line reading for PDA messages, where SECT-01's fix applies.
2. The question for the owner: should security take a warrant from another crew member's spoken line at all, given that crew heads declare theirs by PDA in fixed words? If not, `deskHears` can skip `readWarrant` for speakers whose job is a head other than the Captain unless the line is in `warrantLine`'s shape. That uses only the speaker's job, which the body sees on their ID, not whether they are an NPC.
3. SECT-01's negation and question test removes rows three and four.

## How to test the fix

- Add the five lines above to `tools/llm_crew/security.ts` wanting null when said aloud, and keep "Arrest Pun Pun", "Warrant for Pun Pun, for theft" and "Pun Pun is wanted" passing.
- Next round, grep `pda.log` for `Security notice` and check each name against what the Captain sent.

---
id: PARSE-04
title: Move pls, excuse me, coming through and let me pass do not ask a body to step aside, while I moved the bucket out of the way and can you move the crate do
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:16, tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:26
fix: Match ASIDE_WORDS against the whole short line for move, excuse me and coming through, accept u and pls, and refuse out of the way and you move when an object follows or the speaker speaks of themselves
---

## What is wrong

Stepping aside is done by code the moment the words are heard (`asideOverhears`), whether a player or another NPC asks. The model is not asked whether it was a request. So the word list is the whole reader, and it misses the ordinary ways a player asks, and takes in lines that are not asks at all.

Missed (a player stuck behind a crew body in a doorway):

- "move", "move pls", "pls move", "move it"
- "can u move" ("u" is not "you")
- "excuse me", "coming through", "let me pass", "let me thru"
- "you are in my way", "youre in the way"
- "scoot over", "budge up", "step back", "outta the way", "move out of the doorway"

The body goes on standing there. The model may answer "Sorry!" in its voice, and the body still does not move: the coded step is the only thing that moves it.

Taken as an ask, when said to the body (beside it, so `said_to` is `me`) or with its name in it:

- "I moved the bucket out of the way", "I will clean this out of the way", "I'll move the crate out of the way": the speaker telling of their own work. `\bout of (the|my) way\b` matches.
- "Can you move the crate to the bay": an order to move a thing, not oneself. `\b(could|can|would|will) you (please )?move\b` matches. A technician told this by the Quartermaster beside it steps aside from the Quartermaster instead.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:16`:

    const ASIDE_WORDS =
      /\bstep aside\b|\b(stand|move|shift) aside\b|\bout of (the|my) way\b|\bmake way\b|\blet me (past|through|by)\b|\b(could|can|would|will) you (please )?move\b|\bplease move\b|\bmove over\b|\bmove,? please\b|\bget (this |it )?past you\b/;

`aside.ts:26`, `asideOverhears`, which acts on it with no other test than who it was said to:

    if (!speaker || speaker === brain.name || !ASIDE_WORDS.test(heard)) {
      return;
    }
    if (event.details.said_to !== 'me' && !namesPerson(heard, brain.name)) {
      return;
    }

## How it was found

Run. A throwaway script (`parse/aside.ts` in the scratchpad) tested the expression, copied exactly, on lower-cased lines:

    excuse me                       false
    coming through                  false
    move                            false
    move pls                        false
    can u move                      false
    could you move please           true
    you are in my way               false
    let me pass                     false
    let me thru                     false
    move out of the doorway         false
    ill move the crate out of the way   true
    i moved the bucket out of the way   true
    can you move the crate to the bay   true

Not seen in a round log. The crew's own ask (`driver.ts:481`, "Excuse me, X, could you step aside, please? I need to get this past you.") matches and is not changed by this.

## How to fix it

1. Split the reader in two: words that are an ask wherever they stand ("step aside", "stand aside", "make way", "let me past/through/by/pass/thru", "move over", "scoot over", "budge up", "get this past you", "you are in my way", "you're in the way", "coming through"), and words that are an ask only when they are the whole line, give or take a name, "please"/"pls"/"plz" and punctuation ("move", "move it", "excuse me", "step back", "out of the way", "outta the way").
2. For "you move": allow `you|u`, and refuse it when a noun follows the verb ("move the crate", "move that", "move it to"): test `\b(could|can|would|will) (you|u) (please |pls )?move\b(?!\s+(the|that|this|it\s+to|those|these|a|an)\b)`.
3. For "out of the way": refuse it when the line begins with "I", "I'll", "I will", "I moved", "we": the speaker is talking of themselves.
4. Keep it code only, as now: it must work with the model down.

## How to test the fix

- Add a table to `tools/llm_crew/` that runs `asideOverhears` on a fixture brain with `said_to: 'me'` for each line above and checks `brain.asideAsked`.
- `bun tools/llm_crew/sim.ts quiet aside` must still pass (the crew's own ask).
- Next round, grep `game.log` for `step_aside` and check each against what was said in the lines before it.

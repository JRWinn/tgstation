---
id: PLAY-19
title: The Head of Security, told to its face that its officer is being attacked by someone in sight, reports it and does nothing
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts
fix: Told so, with the attacker in sight and not down, a head of staff or wanted, stop them with the baton and no more
---

## What is wrong

The Head of Security, told to its face that its officer is being attacked by someone in sight, reports it and does nothing.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. 18:01:35 to 18:01:51: "Gabriel, Pun Pun attacked me", then the PDA to the Captain, "Nobody is wanted" and back to the office, with Annie being hit a square or two off.

## How to fix it

Told so, with the attacker in sight and not down, a head of staff or wanted, stop them with the baton and no more.

## How to test the fix

crew_brain.log from the Head of Security "has attacked <officer>. There is no warrant on them, so you are stopping them". The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

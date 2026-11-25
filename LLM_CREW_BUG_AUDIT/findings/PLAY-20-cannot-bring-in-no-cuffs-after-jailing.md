---
id: PLAY-20
title: The Captain is told "I cannot bring in X: no cuffs" seconds after X is put in a cell, when the cuffs have just come off in there
kind: bug
severity: low
effort: small
confidence: sure
status: fixed
fixed_in: uncommitted, branch crew-fixes-1149
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts
fix: No "no cuffs" on someone it cuffed itself
---

## What is wrong

The Captain is told "I cannot bring in X: no cuffs" seconds after X is put in a cell, when the cuffs have just come off in there.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. pda.log 17:56:13.

## How to fix it

No "no cuffs" on someone it cuffed itself.

## How to test the fix

pda.log: no "no cuffs" within a minute of "is in Cell". The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

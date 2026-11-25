---
id: PLAY-21
title: The Captain saying "Arrest X" to nobody by name, with only an officer there, gets no answer
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts
fix: The officer says whom a warrant is for, as it does when named, unless the Head of Security is in sight
---

## What is wrong

The Captain saying "Arrest X" to nobody by name, with only an officer there, gets no answer.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. game.log 18:02:01, "Arrest Pun pun" in the Security Office, ten seconds after the Head of Security left.

## How to fix it

The officer says whom a warrant is for, as it does when named, unless the Head of Security is in sight.

## How to test the fix

An officer answers the Captain with whom to tell. The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

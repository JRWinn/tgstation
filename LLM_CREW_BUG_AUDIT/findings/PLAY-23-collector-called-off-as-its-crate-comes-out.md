---
id: PLAY-23
title: A janitor waiting at the counter for a crate it asked for walks off to another call as the crate is brought out
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts
fix: Waiting for an asked-for crate ranks as an asked wait
---

## What is wrong

A janitor waiting at the counter for a crate it asked for walks off to another call as the crate is brought out.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. 17:58:07 to 17:59:25: crate #2648 left in the lobby while Anjelica Ashbaugh was let into the bay, and then shut in it.

## How to fix it

Waiting for an asked-for crate ranks as an asked wait.

## How to test the fix

No go_to_door from a collector between its ask and "is out in the lobby for you". The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

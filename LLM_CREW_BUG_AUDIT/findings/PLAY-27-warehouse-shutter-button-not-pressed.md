---
id: PLAY-27
title: A technician cannot press the Warehouse shutter button and goes round by maintenance
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_doors.dm
fix: Not known yet, the log now says which check failed and where the body stood
---

## What is wrong

A technician cannot press the Warehouse shutter button and goes round by maintenance.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. 17:55:02 and 17:55:32, "could not press". Ten seconds after the first the body was at (76,147), not by the button at (72,144), so the walk there may have failed.

## How to fix it

Not known yet, the log now says which check failed and where the body stood.

## How to test the fix

game.log "Why not:" on a "could not press" line. The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

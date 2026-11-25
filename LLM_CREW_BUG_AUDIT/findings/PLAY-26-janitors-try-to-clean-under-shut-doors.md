---
id: PLAY-26
title: Janitors try to clean dirt under shut doors, which no tool reaches, and count it as work
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: janitor
files: code/modules/llm_crew/crew_npc_hands.dm
fix: A mess under a shut door is passed over until the door stands open
---

## What is wrong

Janitors try to clean dirt under shut doors, which no tool reaches, and count it as work.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. 28 "could not get to the dirt" in ten minutes. Looked up on the map, most were under shut doors, the rest under fixed machines (those are left).

## How to fix it

A mess under a shut door is passed over until the door stands open.

## How to test the fix

Far fewer "could not get to the dirt" in game.log. The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

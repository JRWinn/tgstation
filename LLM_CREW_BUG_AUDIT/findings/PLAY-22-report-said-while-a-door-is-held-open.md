---
id: PLAY-22
title: A janitor reports a job done while a door is held open for it, and the door shuts
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts
fix: Word that a job is done waits while a door is held
---

## What is wrong

A janitor reports a job done while a door is held open for it, and the door shuts.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. 17:56:43 to 17:57:25: Xavier Hujsak spoke before walking and was shut in the Delivery Office.

## How to fix it

Word that a job is done waits while a door is held.

## How to test the fix

No say between "opened ... to let" and that body walking through. The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

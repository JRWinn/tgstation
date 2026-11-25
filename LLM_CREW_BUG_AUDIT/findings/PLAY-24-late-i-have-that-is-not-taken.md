---
id: PLAY-24
title: A technician does not take the Quartermaster's "I have that" if it comes after 25 seconds, and says its word again
kind: bug
severity: low
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts
fix: Take it while the word is still being told, unless it went by PDA
---

## What is wrong

A technician does not take the Quartermaster's "I have that" if it comes after 25 seconds, and says its word again.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. 17:57:16 said, 17:57:57 answered, 17:59:43 said again.

## How to fix it

Take it while the word is still being told, unless it went by PDA.

## How to test the fix

One "has come in" per order at the Quartermaster. The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

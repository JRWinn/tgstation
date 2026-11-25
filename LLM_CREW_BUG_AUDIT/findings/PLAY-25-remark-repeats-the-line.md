---
id: PLAY-25
title: A remark added to a fixed line repeats a sentence of it
kind: bug
severity: low
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: voice
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/reports.ts
fix: Leave a sentence the line has already said off the remark
---

## What is wrong

A remark added to a fixed line repeats a sentence of it.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. 18:01:57 "Gather round and have your reports ready" twice in one line.

## How to fix it

Leave a sentence the line has already said off the remark.

## How to test the fix

No line with one sentence twice. The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

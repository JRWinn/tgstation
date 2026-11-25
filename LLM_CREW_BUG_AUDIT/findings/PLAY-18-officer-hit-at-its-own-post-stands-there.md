---
id: PLAY-18
title: A hurt officer hit at its own post stands there and takes it, stays hurt for the round however well healed, and hunts at 1 health
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts
fix: Get away to Medbay or a hallway when at its post, hurt ends at 70 health, no looking for people under 20 health while hurt
---

## What is wrong

A hurt officer hit at its own post stands there and takes it, stays hurt for the round however well healed, and hunts at 1 health.

## How it was found

`data/logs/2026/11/23/round-11.49.16`. Annie Mills, 18:01:34 to 18:02:20: 87 health to crit in the Security Office with a baton, then put down disposals. At 17:55:53 it set off to look for Pun Pun at 1 health. Get-away was planned as a walk to the post, so at the post it only waited; beat.hurt was cleared by nothing but "try again" and kept the baton away.

## How to fix it

Get away to Medbay or a hallway when at its post, hurt ends at 70 health, no looking for people under 20 health while hurt.

## How to test the fix

An officer hurt at its post: crew_brain.log "is attacking you at your post". One healed past 70 stops its attacker again. The window parts are in `tools/llm_crew/play-1149.ts`, where they can be.

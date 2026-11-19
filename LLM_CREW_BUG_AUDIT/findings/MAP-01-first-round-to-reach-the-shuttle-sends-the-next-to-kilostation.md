---
id: MAP-01
title: The first test round that sees the emergency shuttle leave makes the next round KiloStation, where the crew has never been run
kind: gap
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: design
files: config/maps.txt:35, config/config.txt:364, code/modules/shuttle/mobile_port/variants/emergency/emergency.dm:245, code/datums/votes/map_vote.dm:18, code/controllers/subsystem/map_vote.dm:111
fix: Pin the test server to MetaStation (an admin-set next map, or drop map rotation in config) until the crew is checked on other maps, and say so in the change log
---

## What is wrong

Every round played so far was MetaStation (66 round folders, every one has `perf-NULL-MetaStation.csv`). That is not a choice anyone made: there is no `data/next_map.json`, so each boot falls back to `load_default_map_config()`, whose default `map_name` is `"MetaStation"`. MetaStation is held only because no round has yet got as far as the emergency shuttle leaving the station (no round log has "Emergency Shuttle Departure" or a map vote).

When the shuttle does leave, `emergency.dm` forces a map vote. With map rotation on (`MAPROTATION` in `config/config.txt`), `get_valid_map_vote_choices` drops every map whose `minplayers` is above the number of players with a client. The crew NPCs have no client, so on the owner's test server that number is 1. In `config/maps.txt` every votable map has `minplayers 25` or more except `kilostation` (`maxplayers 40`, no minimum). So the only choice is KiloStation, and `create_vote` with one choice finalises it at once and writes `data/next_map.json`:

    if(length(choices) == 1) // Only one choice, no need to vote. Let's just auto-rotate it to the only remaining map because it would just happen anyways.
    	var/datum/map_config/change_me_out = global.config.maplist[choices[1]]
    	finalize_vote(choices[1])// voted by not voting, very sad.

The next round, and every round after (KiloStation stays the only valid map), loads KiloStation. The owner did not ask for it and the crew have never been run there. What differs on KiloStation is written up in the other MAP findings: room names the window code asks for by name, the HoP's line room, a station with no Cargo Lobby or Bar Lounge of that name, and the engine list that is MetaStation's only.

Concrete case: the owner plays a long test round, calls the shuttle, and it leaves. The chat says "The map vote has been skipped because there is only one map left to vote for. The map has been changed to Kilo Station." The next morning's test round starts on KiloStation. Whatever goes wrong is read as a fault in the crew code from the day before.

## Where

`config/config.txt:364`:

    MAPROTATION

`config/maps.txt` (the only votable map with no `minplayers`):

    map kilostation
    	votable
    	maxplayers 40
    endmap

`code/modules/shuttle/mobile_port/variants/emergency/emergency.dm:245`:

    INVOKE_ASYNC(SSvote, TYPE_PROC_REF(/datum/controller/subsystem/vote, initiate_vote), /datum/vote/map_vote, vote_initiator_name = "Map Rotation", forced = TRUE)

`code/controllers/subsystem/map_vote.dm:111`, in `get_valid_map_vote_choices`:

    if(possible_config.config_min_users > 0 && filter_threshold < possible_config.config_min_users)
    	continue

`code/datums/map_config.dm:23` (the fallback when there is no `next_map.json`):

    var/map_name = "MetaStation"

## How it was found

Read from the code and the config, and checked against the round logs: `ls data/logs/2026/11/*/round-*/perf-*` gives 66 files, all `MetaStation`, and a grep of every round's `game.log` and `shuttle.log` for "Emergency Shuttle Departure" finds none. Not seen happen: no round has gone that far.

## How to fix it

This is a test-server setting, not crew code, so the owner should choose.

1. Simplest: comment out `MAPROTATION` in `config/config.txt` while the crew are only meant for MetaStation. With it off the forced vote still runs, but check `SSmap_vote` and the shuttle code for whether it then writes `next_map.json`; if it still does, take the second way.
2. Or: give `metastation` in `config/maps.txt` no `minplayers` (and mark the others `disabled` for now). Then MetaStation is always a valid choice and, with the default-map rule in `get_vote_result`, wins with one player.
3. Whichever is done, add one line to `LLM_CREW_CHANGELOG.md` that the test server is pinned to MetaStation on purpose, and one line to the round-start log in `spawn_test_crew` naming the map (`SSmapping.current_map.map_name`), so a round on another map is plain when the logs are read.

Question for the owner: pin to MetaStation for now, or start testing another map on purpose (and which)? The project's rule is that nothing is tied to one map, but a round landing on another map by accident is not a test anyone reads as one.

## How to test the fix

- Start a round, call the shuttle with an admin verb (or set its timer short), let it leave, and read the chat and `data/next_map.json`. The next map should be MetaStation.
- Restart and check that the new round folder has `perf-NULL-MetaStation.csv`.

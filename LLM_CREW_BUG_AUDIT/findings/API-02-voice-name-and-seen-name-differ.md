---
id: API-02
title: The server names one person three ways, and the window matches a voice to a face by name, so a Captain whose ID shows an honorific is never obeyed
kind: bug
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_senses.dm:404, code/modules/llm_crew/crew_npc_senses.dm:191, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1196, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:684, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:687, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1610, tgui/packages/tgui/interfaces/CrewBrain/jobs/headofsecurity.ts:262, code/modules/llm_crew/crew_npc_doors.dm:823
fix: Find the speaker among people_in_view by details.handle, which the server already ties to the voice, and fall back to the name only when there is no handle
---

## What is wrong

See also: CARGO-19 (a counter order held for and messaged to the seen name, in tool_order) and JOBS-07 (mail never handed over, in freight.ts). Same naming split, but each needs its own change: the handle lookup here mends neither.

The server tells the brain who someone is in three different fields, and they are worked out three different ways:

- `people_in_view[].name` is `person.name`, the mob's visible name. For a human that is `get_visible_name()`, which puts the ID's honorific in: "Captain John", "Captain Smith", "Officer Smith", or "Face (as ID name)" for someone wearing another's card.
- `speech_heard` `details.speaker` is `speaker.get_voice()`, which for a human is `real_name` ("John Smith"), not the visible name.
- `pda_message` `details.speaker` and `pda_people[].name` are the PDA's `saved_identification` (the registered name, "John Smith").

The window takes these to be one and the same. Everywhere a job decides whether a line was said by someone it answers to, it looks the voice up among the people in view by name:

    brain.peopleInView.find((person) => person.name === speaker)?.superior

With a visible name of "Captain John" and a voice of "John Smith" that finds nobody, so the line is taken to be from someone with no say over the NPC.

Concrete case: the owner plays the Captain and has ctrl-clicked their ID to show the "Captain" honorific (`/obj/item/card/id` `honorific_position`, set by the player; the trims for Captain, security, heads and others all offer one). Their `name` is now "Captain John". They walk up to the Head of Personnel NPC and say "John here. Hold a staff meeting now." The NPC hears speaker "John Smith" with handle p3. In `head.ts` `overhears`, `peopleInView.find(person => person.name === 'John Smith')` is undefined, so `meetingOrderedBy` is never set and no meeting is called. The same check fails in `guarding.ts` (being told to leave a room), `chiefengineer.ts` (orders about the engine), `quartermaster.ts` and `headofsecurity.ts`. Things it means to say aloud to the Captain (`toTell` with `to` taken from a PDA name) also wait for a `peopleInView` entry named "John Smith" that never comes, and are dropped unsaid after two minutes.

The same split runs the other way too. The server hands the window a seen name where the window will use it as a PDA name: `door_opened_for` keeps `let_in_by = opener.name` (crew_npc_doors.dm:823) and sends it as `let_in_by`. A body shut in after being let in then PDAs that name (`driver.ts` WORD_OUT_KEY step, `person: brain.letInBy`), and `tool_message` looks it up by `saved_identification` (`messenger_named`). "Captain John" is not "John Smith", so the server answers "You cannot find that person on your PDA." and the one person who let it in is never asked to let it out. A masked opener ("Unknown") fails the same way. And in `tool_open_door`, someone who asked by PDA or out of sight is found by `person_at_room(person_name, room)`, which compares the PDA or voice name the window passes with `LOWER_TEXT(person.name)`, the seen name (crew_npc_doors.dm:553): the Captain with an honorific on, asking cargo by PDA to be let into the bay, is "a name nobody at the door has", and is told "You do not know who that is" unless they happen to be in sight.

The server already has the answer: `on_pre_hear` adds `details.handle` when the speaker is a human the body has just seen, and that handle is the same one in `people_in_view`.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:404`, in `on_pre_hear`:

    var/speaker_name = message_mods[MODE_SPEAKER_NAME_OVERRIDE] || speaker.get_voice()
    ...
    if(ishuman(speaker) && recently_saw(speaker))
        details["handle"] = handle_for(speaker)

`code/modules/llm_crew/crew_npc_senses.dm:191`, in `look_around`:

    people_in_view += list(list("handle" = handle_for(person), "name" = person.name, ...

`code/modules/mob/living/carbon/human/human_say.dm:32` (base game), `get_voice` returns `real_name` unless a voice changer or trait says otherwise. `code/modules/mob/living/carbon/human/human_helpers.dm:43`, `get_visible_name(add_id_name = TRUE)`, returns `id_name` with honorifics when the face matches the card.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1196`:

    brain.peopleInView.find((person) => person.name === speaker)?.superior &&

and the same pattern at `guarding.ts:684`, `chiefengineer.ts:687`, `quartermaster.ts:1610`, `headofsecurity.ts:262`.

## How it was found

Read from the code on both sides and in the base game's naming procs. Not seen in a round: no round log shows a player with an honorific on. Rated likely rather than sure because it needs the player to have turned the honorific on, or someone to wear another's ID.

## How to fix it

1. Add one helper in the window, say `speakerInView(brain, event)` in `addressing.ts` or `situation.ts`: if `event.details.handle` is a string, return the `peopleInView` entry with that handle; else return the entry whose name equals `details.speaker`.
2. Replace each `brain.peopleInView.find((person) => person.name === speaker)` in the overhears hooks (head, guarding, chiefengineer, quartermaster, headofsecurity, and any other grep turns up) with the helper. Those hooks all receive the event.
3. Server, `door_opened_for`: keep the opener's PDA name for `let_in_by` (the `saved_identification` of the PDA they carry, which `door_keepers` already reads; failing that `real_name` is closer than `name`), since the only use made of it is to send them word.
4. Server side, optionally, send the visible name too: in `on_pre_hear` add `details["seen_as"] = speaker.name` when the handle is set, so the window can map a voice name to a seen name for `toTell` and `jobOf`.
5. Owner question: should a person's identity in the brain be the name on their ID (what the PDA uses) or the name they are seen by? The two only differ with honorifics or a borrowed ID. Using the handle for anything in sight, and the PDA name for anything out of sight, avoids having to choose.

## How to test the fix

- A small table in `tools/llm_crew/addressing.ts`: a person in view `{ handle: 'p3', name: 'Captain John', superior: 1 }` and a speech event with speaker "John Smith", handle "p3": the helper must return the Captain.
- In a round, as Captain, ctrl-click your ID to show the honorific, then order a head to hold a meeting. `crew_brain.log` should show the head calling one.

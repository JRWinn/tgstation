---
id: TRUST-03
title: Who said something is taken from the voice alone, so a voice made to sound like the Captain is the Captain, whoever is standing there
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:404, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:716, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:132, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:465, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1504
fix: Send the face the voice comes from with each line heard, and have the window take the speaker's rank from the person behind the handle, never from the voice name or the PDA list
---

## What is wrong

See also: HOLE-01 (rank from the job text on a card). This is a second, separate way in: the voice.

The server tells the window who spoke by `speaker.get_voice()`, and nothing else about the name. For a human that is `override_voice` if set, the ID's name if a voice changer is on, and otherwise the real name (`human_say.dm:32`). A player hearing the same line sees more: `get_message_voice` adds " (as <the name on their ID>)" whenever the voice is not the name they show (`human_say.dm:44`). So a player sees "Jane Doe (as Bob Hale)" and knows something is off. The crew body is told "Jane Doe" and that is all.

The server does tie the line to the body that said it: `details["handle"]` is the handle of the person it saw. The window never uses the handle to decide rank. Every job looks the speaker up by the voice name: `jobOf(brain, speaker)` takes the first person in view with that name, and failing that the job the PDA list shows for that name. So a voice that names someone who is not in view gets that person's job from their PDA.

One concrete case. A changeling uses Mimic Voice (`code/modules/antagonists/changeling/powers/mimic_voice.dm`: "Will turn our voice into the name that we enter") with the Captain's name, Jane Doe. It walks up to the Head of Security as itself, Bob Hale, Assistant, in plain sight, and says: "Warrant for Jordan Vale, for theft, 15 minutes."

1. `on_pre_hear`: `speaker_name` is "Jane Doe". `details["handle"]` is Bob's handle, since the body has just seen him.
2. `deskHears`: `speaker` is "Jane Doe". `jobOf(brain, "Jane Doe")`: the real Captain is not in view, so `pdaPeople` gives "Captain".
3. `deskTakes(brain, "Jane Doe", "Captain", ...)`: `declarer` and `captain` are true. The warrant is taken, read back aloud to "Captain", and given to the officer.

The same voice can pardon anyone in the cells, tell the Quartermaster "yes" to a big purchase (`overhears` in `quartermaster.ts` reads the answer from `jobOf(brain, speaker)`), and, with the Head of Security's name, hand an officer a warrant in the Head of Security's own words, which the officer serves on anyone but the Captain with none of the desk's rules (`officer.ts:465`: `if (isHeadOfSecurity(job)) takeWord(...)`).

Even with the real Captain in view, `jobOf` finds them by the name and answers "Captain" for the changeling's line.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:404`, in `on_pre_hear`:

    var/speaker_name = message_mods[MODE_SPEAKER_NAME_OVERRIDE] || speaker.get_voice()
    ...
    if(ishuman(speaker) && recently_saw(speaker))
    	details["handle"] = handle_for(speaker)

`code/modules/mob/living/carbon/human/human_say.dm:32` and `:44` (base game):

    /mob/living/carbon/human/get_voice(add_id_name = FALSE)
    	...
    	if(override_voice)
    		return override_voice
    	...
    /mob/living/carbon/human/get_message_voice(visible_name)
    	. = ..()
    	if(. != name)
    		. += " (as [get_id_name("Unknown", honorifics = TRUE)])"

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:132` (the same `jobOf` is copied into arrests, head, quartermaster, wanted, officer, headofsecurity, chiefengineer, forcing and janitor):

    function jobOf(brain: NpcBrain, name: string): string {
      return (
        brain.peopleInView.find((person) => person.name === name)?.job ??
        brain.pdaPeople.find((person) => person.name === name)?.job ??
        ''
      );
    }

`desk.ts:716`, in `deskHears`: `const job = jobOf(brain, speaker);`

## How it was found

Read from the code, base game and ours. Not tried in a round: no changeling has been played against the crew.

Not checked: how often a voice and a face differ for ordinary reasons. Honorifics make the name in view "Captain Jane Doe" while the voice is "Jane Doe" (`get_visible_name` in `human_helpers.dm:65`), so `peopleInView.find` already misses the real Captain by name today and the PDA list is what answers. The fix below has to keep that working.

## How to fix it

1. Server, `on_pre_hear`: for a human speaker the body has seen, also send `"face_name" = speaker.name` (what the body sees of them) and `"voice_matches" = (speaker_name == speaker.real_name ? TRUE : findtext(speaker.name, speaker_name) != 0)`. Simplest honest form: `voice_matches` is TRUE when `speaker.get_message_voice()` has no " (as " added, which is the test a player's chat applies.
2. Window: write one helper, say `speakerOf(brain, event): PersonInView | null`, in `brain.ts` or `memory.ts`. With `details.handle`, it returns the person in view with that handle. With no handle (someone it cannot see), it returns null.
3. Replace every `jobOf(brain, speaker)` used on a line heard aloud with `speakerOf(brain, event)?.job ?? ''`, and use the person's `command` and `superior` flags where rank matters. If `voice_matches` is false, treat the line as from someone of no rank: `''`. The PDA list is not a way to learn the rank of someone heard aloud: it is for PDA messages.
4. Where the window keeps names (warrants `by`, orders `from`, who to answer), keep using the voice name for what is said back, so that the answer still goes to the name the speaker used.
5. Tell the model when the voice does not match: in `describeEvent`, write the speaker as "Jane Doe (as Bob Hale)" the way a player's chat does. What the crew make of it is talk.

## How to test the fix

- A table test for `deskHears`: a Head of Security brain with the Captain on its PDA list, Bob in view as "Assistant" with handle p3, and a `speech_heard` event with `speaker` "Jane Doe", `handle` "p3", `voice_matches: false`, the words of a warrant. No warrant is taken and `REFUSALS.notDeclarer` is the reply. The same event from the real Captain's handle with `voice_matches: true` is taken.
- The same for the officer: a warrant in the Head of Security's words, from a handle whose job is not Head of Security, is not taken.
- Server compile. In a round, an admin can set `override_voice` on a player with View Variables and try the warrant above. `game.log` should show no arrest.

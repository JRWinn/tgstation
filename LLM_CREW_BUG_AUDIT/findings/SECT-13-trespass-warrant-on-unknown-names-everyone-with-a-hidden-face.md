---
id: SECT-13
title: A masked trespasser shows as Unknown, its head declares a warrant on Unknown, and the officer then arrests anyone whose face is hidden
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:346, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:128, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:463, code/modules/mob/living/carbon/human/human_helpers.dm:61
fix: Refuse a warrant on the name Unknown, and have whoever could not put an Unknown out tell their head what they saw instead of a name
---

## What is wrong

A human whose face is covered and who has no ID in the ID slot is shown to everyone as "Unknown" (`get_visible_name`; `get_id_name` looks only at `wear_id`, `human_helpers.dm:114`). The server sends `person.name` (`crew_npc_senses.dm:191`), which `update_visible_name` keeps equal to that. The crew go by that name. Nothing in the warrant code treats "Unknown" as anything but a name.

Concrete case. Someone in a gas mask with no ID walks into the Cargo Bay. A technician asks them to leave, they will not go, and `throw_out` fails with "could not get". `wantedAfterActing` notes `couldNot: { name: 'Unknown', place: 'Cargo Bay' }`. The technician tells the Quartermaster "Jameson, I could not put Unknown out of the Cargo Bay." The Quartermaster declares "Warrant for Unknown, for trespass in the Cargo Bay." by PDA. The Head of Security reads it: "Unknown" is a name with two or more letters, nobody known has a job, so the warrant is taken and given to the officer.

From then on `sameName('Unknown', person.name)` is true for anyone else who is shown as Unknown: a crew member in internals and a mask with their ID in a bag, someone in a space suit with no ID on show. The officer arrests the first such person it sees. If the trespasser takes the mask off, they are seen by their own name, and nobody is after them.

Every head reads "Security is looking for Unknown" at its meetings, and staff send "Security: Unknown is in the Bar." for every masked person they see.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:346`, in `wantedAfterActing`, the name is whatever the body saw:

    const name =
      brain.peopleInView.find((person) => person.handle === act.person)?.name ??

`wanted.ts:128`, `declareTrespass`, sends it on as a warrant:

    line: warrantLine(name, `trespass in the ${place}`),

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:463`, in `deskTakes`, takes it like any other:

    const declared = readWarrant(text, knownNames(brain));
    if (declared) {

`code/modules/mob/living/carbon/human/human_helpers.dm:61` and `:73`, where the name comes from:

    if(HAS_TRAIT(src, TRAIT_UNKNOWN_APPEARANCE) || HAS_TRAIT(src, TRAIT_INVISIBLE_MAN))
        return "Unknown"
    ...
    return face_name || id_name || "Unknown"

## How it was found

Read from the code, following the name from the server's `people_in_view` (`person.name`) through `wantedAfterActing`, `declareTrespass` and `deskTakes`. `LLM_CREW_PLAN_SECURITY.md` (section 8) lists "A name that cannot be seen is not wanted. A mask, or no ID and a hidden face, and nobody spots them." as known. That is the other half: a known name hidden by a mask. A warrant whose name is "Unknown" is not mentioned there. Not run and not seen in a round. Marked "likely" because I did not check that `throw_out` fails with "could not get" for a masked trespasser in particular; any trespasser who will not go gives that answer.

## How to fix it

1. In `security.ts`, add `isNoName(name)`: true for "Unknown", "Unknown (as ...)" and the empty string.
2. In `deskTakes`, refuse a warrant on such a name: "Captain, I cannot take a warrant on Unknown. Tell me who it is, or where they are and what they wear." (a new line in `REFUSALS`).
3. In `wantedAfterActing`, do not note a `couldNot` for such a name. Have the body tell its head plainly instead ("Jameson, someone with their face hidden would not leave the Cargo Bay."), so the head can send for security to the room. Whether a warrant can be on "whoever is in the Cargo Bay" is a design question for the owner; today a warrant needs a name.
4. In `syncWanted`, skip people seen as Unknown when sending sightings, so that an old warrant on Unknown (from before the fix) does not flood the Head of Security.

## How to test the fix

Add to `tools/llm_crew/security.ts`: `deskTakes` from a head with "Warrant for Unknown, for trespass in the Cargo Bay." leaves no warrant and answers with the new refusal; the same from the Captain; `wantedAfterActing` on a failed `throw_out` ("You cannot get a hold of Unknown.") of a person named "Unknown" leaves `couldNot` empty and queues the plain line to the head; `readWanted` on a head given "Jameson, I could not put Unknown out of the Cargo Bay." (from before the fix, or typed) sends no warrant. A warrant on a real name still works: "Warrant for Pun Pun, for trespass in the Cargo Bay." In a round, grep `pda.log` for "Warrant for Unknown" and "put Unknown out".

## Check

Checked by Opus 5.5. Read `get_visible_name`, `get_face_name` and `get_id_name` in `code/modules/mob/living/carbon/human/human_helpers.dm`, `people_in_view` in `crew_npc_senses.dm:191`, `tool_throw_out` and its walk in `crew_npc_guarding.dm:144` (its failures "You cannot get a hold of [person.name]." and "You could not get [person.name] out of ..." both match `WOULD_NOT_GO`), `wantedAfterActing`, `syncWanted`, `readWanted` and `declareTrespass` in `jobs/wanted.ts`, `deskTakes` in `jobs/desk.ts`, and `target` and `isWarrantOn` in `jobs/arrests.ts:167` and `:281`. Nothing anywhere in the window code treats "Unknown" as no name. The quotes are what the code says today.

Ran a throwaway bun script in the scratchpad: `couldNotLine('Jameson Hart', 'Unknown', 'Cargo Bay')` gives "Jameson, I could not put Unknown out of the Cargo Bay."; a Quartermaster brain reading it from a Cargo Technician queues "Warrant for Unknown, for trespass in the Cargo Bay." to the Head of Security; the Head of Security's `deskTakes` takes it ("I have that: a warrant for Unknown ... I do not know that name yet.") and copies the Captain; `sameName('Unknown', 'Unknown')` is true, which is all `target` needs to pick any other Unknown in view. That settles the step the finder left as "likely", so confidence is now sure. Confirmed.

Severity stays medium, though the wrong person is acted on: it needs a masked trespasser with no ID who will not be walked out, and then someone else masked with no ID in the officer's sight, which is not most rounds. Effort small holds for steps 1, 2 and 4; step 3's plain line to the head is a few more lines in `wanted.ts`. The plan's known item (`LLM_CREW_PLAN_SECURITY.md:492`) is the other half, as the finding says.

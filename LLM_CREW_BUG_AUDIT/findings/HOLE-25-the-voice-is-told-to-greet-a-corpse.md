---
id: HOLE-25
title: A dead or senseless body coming into view is put to the voice as someone new to greet, and the report never says that anyone in view is down, dead or in cuffs
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: code/modules/llm_crew/crew_npc_senses.dm:200, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:947, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:188, tgui/packages/tgui/interfaces/CrewBrain/person.ts:124, tgui/packages/tgui/interfaces/CrewBrain/situation.ts:45
fix: Say in the arrival line and in People in view when someone is lying still, out cold, dead (as examining them would show) or cuffed, and do not wake the voice to greet anyone who is not up and awake
---

## What is wrong

See also: GAP-13 (the harm senses that would tell the brain someone has fallen are written and switched off). This is a different and cheaper fault: what the voice is told about a body it can already see.

When someone comes into view for the first time, the server's event says only that they are "lying on the floor" (`crew_npc_senses.dm:200`), the same words for someone resting, someone out cold and a corpse. The server knows more and sends it, in `people_in_view`, as `down` and `cuffed` (`crew_npc_senses.dm:191`), but those are used only by security code. The report the voice reads lists people as "Name, Job (p3)" (`situation.ts:45`) whatever state they are in.

The window then wakes the voice for the arrival because "you have not seen them before" is in the line (`shouldWake`, `brain.ts:947`), and picks the moment "meeting" (`talk.ts:188`), whose words are:

    'You are seeing someone for the first time. Greet them in your own way, and make sure they learn your name. React to who they are or what they are doing.'

So a janitor walking into a room with a dead assistant on the floor says something like "Hi there, I'm Alex, the janitor. Lovely day!" to the corpse, and goes on mopping. Players see this. The same for someone the crew member watched collapse: they are already "seen", so nothing at all is said or done, and the report goes on listing them as if they stood there.

People in cuffs are not marked either. A crew member meets a cuffed prisoner being walked to the brig and greets them the same as anyone, and is never told the person it is chatting with is under arrest.

Concrete case: in `round-17.06.14` (quoted in GAP-13) Pun Pun put three janitors and the officer down. Each crew member that later walked past one for the first time was woken to greet them. The change log notes a technician sent a downed janitor clean-up calls; the greeting is the spoken half of the same blindness.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:200`, in `look_around`:

    		var/lying = person.body_position == LYING_DOWN
    		var/text = "[person.name][job ? ", [job]," : ""] comes into view [distance] tile\s away[lying ? ", lying on the floor" : ""]."

`code/modules/llm_crew/crew_npc_senses.dm:191`: `"cuffed" = !isnull(person.handcuffed), "down" = crew_npc_person_down(person)` are sent with each person in view.

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:947`, in `shouldWake`:

        case 'person_in_view':
          ...
          return (
            line.includes('you have not seen them before') &&
            !isWarrantOn(brain, String(event.details.name ?? ''))
          );

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:188`:

      } else if (meeting) {
        about.push(MOMENTS.meeting);
        sayIs = 'your greeting.';
        maySaySilent = false;

`tgui/packages/tgui/interfaces/CrewBrain/situation.ts:45`:

          return `${person.name}${person.job ? `, ${person.job}` : ''} (${person.handle}${feeling ? `; ${feeling}` : ''})`;

## How it was found

Read from the code: followed a `person_in_view` event from `look_around` through `describeEvent`, `shouldWake` and `buildTalk`. Not looked for in a round log; the brain log would show "your greeting" moments whose trigger line has "lying on the floor".

## How to fix it

1. Server, `look_around`: in the arrival text say what a person standing there would see at a glance: "lying on the floor, not moving" for `crew_npc_person_down`, "in handcuffs" for `handcuffed`. Whether they are dead is something a player finds by examining ("no signs of life"), so add it only once the body has stood within a tile or two of them and looked (the same distance an examine needs); then emit one knowledge event "X is dead" and put `dead` in their `people_in_view` entry. This keeps to what the body could see.
2. Window, `shouldWake`: do not wake for a `person_in_view` whose `details.lying` is set or who is `down` in `people_in_view`. Add `down` and `cuffed` to the event details so the check does not have to look across.
3. Window, `describeView`: add "(lying still)", "(in cuffs)" and "(dead)" after the name in "People in view", from the fields the server already sends. That costs a few words only when it is true.
4. Leave what to do about a body to GAP-13 and its question for the owner. With step 3 the voice at least speaks of it as it is when it does speak.

## How to test the fix

- Type check and server compile.
- Simulator: a scenario with a person sent as `down: true` and `lying: true` arriving in view; check that no greeting is asked for, and that the report line reads "(lying still)".
- In a round: kill a monkey-free test body with admin tools in a hallway and walk a janitor past it; read the brain log for the moment and what was said.

## Check

Checked by Opus 5.5 on 2026-11-19, from the code, before the window half was built. Confirmed.

- The quotes are what the code says today: the arrival text and its `lying` detail in `look_around` (`crew_npc_senses.dm`, about line 199), `cuffed` and `down` sent with each person in `people_in_view` (about line 191, `crew_npc_person_down` in `crew_npc_security.dm`), the `person_in_view` case of `shouldWake` in `brain.ts`, which looked only at "you have not seen them before" and a warrant, the `meeting` moment in `talk.ts`, and the "People in view" line in `describeView` (`situation.ts`), which wrote "Name, Job (handle)" whatever state the person was in.
- `PersonInView` in `types.ts` already has `cuffed` and `down`, read only by security code (`jobs/arrests.ts`); nothing in the voice's report used them. So a person lying dead on the floor, seen for the first time, woke the voice for a greeting.
- Nothing in the change log or the plans covers it (searched `lying`, `down`, `greet`). GAP-13 is the related gap; this is the cheaper part.
- Severity medium and effort small stand for the window half (steps 2 and 3). Step 1, the server's wording and "dead" after a close look, is server work in `crew_npc_senses.dm` and was left for whoever owns that file.

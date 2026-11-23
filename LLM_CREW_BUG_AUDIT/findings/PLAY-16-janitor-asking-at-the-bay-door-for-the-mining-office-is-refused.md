---
id: PLAY-16
title: A janitor sent to the Mining Office or Bitrunning Den who asks at a Cargo Bay door about that mess is told nobody sent for it, once it has no call of its own to the bay
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1591, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1680, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1218, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:1034, code/modules/llm_crew/crew_npc_cargo.dm:153
fix: When an ask names a door of the post and also about the mess in another room of the department, let a standing call to that room be the permission in mayPass, as LOGA-01 step 3 proposed
---

## What is wrong

A technician sends a janitor to a mess in the Mining Office or the Bitrunning Den. Those rooms have a door of their own onto maintenance, so they are not in `roomsThrough` (LOGA-01's fix keeps any room with a maintenance or hallway door out, on purpose). When the janitor cannot get to that door (here it was shut in the Delivery Office), the server tells it the room opens from the Cargo Bay, and the janitor asks at a Cargo Bay door, in the janitor's own fixed words: "I am at the Deliveries door of the Cargo Bay about the mess in the Mining Office. Could you let me in, please?"

The technician reads the room of the ask as the Cargo Bay (the door named first) and drops the room the mess is in. `mayPass` then lets the janitor in only if the Cargo Bay itself has a mess it was called to. Once that call has gone to another janitor, or the bay's mess is not on the list, the answer is "Sorry, Braden, nobody here sent for you to the Cargo Bay, so I cannot let you in", to the janitor the same technician sent for. Eleven minutes on, the technician sends a second janitor to the same two rooms.

This is LOGA-01's fault for the rooms LOGA-01's fix left out. LOGA-01 said it "works only by luck when the same janitor has also been called to the Cargo Bay itself", and offered a safety net in its step 3, which was not built.

The case, `data/logs/2026/11/20/round-10.31.34` (played on `pre-night`; the code below is unchanged on master):

1. 16:40:47 and 16:40:49 `pda.log`: Kathy Stahl to Braden Reade, "There is a mess in the Mining Office ... Come to its door and knock" and the same for the Bitrunning Den.
2. 16:43:20 and 16:44:42: Braden, "I am at the Deliveries door of the Cargo Bay about the mess in the Mining Office". Both answered "Braden, I am coming to the Deliveries door of the Cargo Bay to let you in." Braden then had a Cargo Bay call of his own as well (16:37:48).
3. 16:41:57 Braden had told Kathy the bay's cobweb needs soap, and at 16:44:19 Kathy gave the Cargo Bay to Mary Cook. At 16:46:15 Kathy's prompt lists the Cargo Lobby, Mining Office and Bitrunning Den as sent to Braden, and no Cargo Bay mess.
4. 16:46:16 Braden, shut in the Delivery Office since 16:45:41: "I am at the Deliveries door of the Cargo Bay about the mess in the Mining Office. Could you let me in, please?" 16:46:17 Kathy's brain: "Braden Reade has asked by PDA to be let in to the Cargo Bay. Nobody who works here sent for them, so you are sending back that you cannot." and the refusal by PDA.
5. 16:46:24 the same ask for the Bitrunning Den got no answer; 16:51:12 it got the same refusal. 16:51:16 and 16:51:18 Kathy sent Kyleigh Davies to the Mining Office and the Bitrunning Den.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1591`, `roomAskedIn`: the room named after "door of the" wins, which is the Cargo Bay here; "about the mess in the Mining Office" is not kept anywhere on the ask.

    const after = said.match(
      /\b(?:door (?:of|out of|into|to)|(?:let|get) (?:me|us) (?:into|in to|out of)) the ([^.,!?]+)/,
    )?.[1];

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1680`, in `mayPass`:

      // Sent for to a room further in, which has no way to it but through this one.
      const beyond = boundBeyond(brain, name, wanted);
      if (!brain.areaMesses[wanted] && !beyond) {
        return null;
      }
      const sentFor =
        !!brain.areaMesses[wanted] && !!expectedCall(post, name, brain.now, wanted);

`boundBeyond` (cargo.ts:1544) looks only at `brain.roomsThrough`, which the server fills in `learn_department`, `code/modules/llm_crew/crew_npc_cargo.dm:153`:

    			if(!door.allowed(body) && !(far_name in closed_rooms) && !istype(far_side, /area/station/hallway) && !istype(far_side, /area/station/maintenance))
    				continue
    			beyond |= far_name
    		if(!length(beyond) || length(beyond - closed_rooms))
    			continue

The Mining Office's Mining Dock Maintenance door is onto maintenance, so the Mining Office is never in the list.

The refusal, `cargo.ts:1218`:

          !mayPass(brain, ask.name, ask.room, ask.out)
        ) {
          ask.refused = true;
          brain.toTell.push({
            to: ask.name,
            line: `Sorry, ${firstName(ask.name)}, nobody here sent for you${ask.room ? ` to the ${ask.room}` : ''}, so I cannot let you in.`,

The janitor's words, `tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:1034` (and the same at :1064):

        text: `I am at the ${which}door of the ${door} about the mess${within ? ` in the ${place}` : ''}. C${ASKING_IN.slice(1)}, please?`,

## How it was found

Seen in the round log above, then read on master: `mayPass`, `boundBeyond` and `roomAskedIn` are as quoted (the only change to `mayPass` since `pre-night` is the `security: true` mark), and `learn_department` keeps maintenance doors, as LOGA-01's fix meant it to. Confidence is "likely", not "sure": I did not run the case, and I read the Cargo Bay mess as off Kathy's list from her prompt at 16:46:15, not from the code. Braden being shut in the Delivery Office at all came from Armando Reichard opening the Deliveries door at 16:45:41 "to let Braden Reade out of Cargo Bay", the same instant Kathy opened the Mining Office for him; why Armando did that is not clear from the logs and is not part of this finding.

## How to fix it

1. Give `DoorAsk` a `messIn?: string`. Where a PDA or spoken ask is read (`readsMessage` and `overhears` in `jobs/cargo.ts`), fill it from `/about the mess in the ([^.,!?]+)/` when the room it names is one of `ownRooms(brain)`. The words are the janitor's own fixed words (`janitor.ts:1034`, `:1046` and `:1064`), so this is reading our own message, not loose talk.
2. In `mayPass`, after `beyond`, if `messIn` is set, differs from `wanted`, `brain.areaMesses[messIn]` is set and `expectedCall(post, name, brain.now, messIn)` stands, return `{ name, room: wanted, out: false, beyond: messIn }`, as for `boundBeyond`. The `beyond` mark already makes the let-in a pass-through.
3. Carry `messIn` through `putAsk` the same way `room` is carried (PLAY-05).
4. Keep working: a janitor with no standing call to that room is still refused; LOGA-01's Delivery Office case still goes by `roomsThrough`.

## How to test the fix

- Simulator: add a scenario with a janitor called to the Mining Office only, its maintenance door made unreachable (start it shut in the Delivery Office), asking at the Deliveries door of the Cargo Bay. Check "coming to the Deliveries door of the Cargo Bay to let you in" and no "nobody here sent for you".
- Type check and lint.
- Next round, `pda.log`: no "nobody here sent for you to the Cargo Bay" answering a line with "about the mess in the" a room the same technician sent that janitor to.

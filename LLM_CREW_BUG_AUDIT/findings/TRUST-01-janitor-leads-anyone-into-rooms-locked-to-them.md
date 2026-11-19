---
id: TRUST-01
title: A janitor asked the way leads anyone, by its own ID, into the Custodial Closet or the maintenance tunnels
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/options.ts:58, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1476, code/modules/llm_crew/crew_npc_tools.dm:200
fix: Leave out of the lead offer every room that is locked to the asker, which the server already knows as closed rooms and from whether the asker belongs there
---

## What is wrong

See also: BRAIN-05 (the walk is offered on words that do not ask for it). This finding is about the case where it is asked for.

Crew who keep no post, today the janitors, can agree to lead whoever asked to a room. The rooms on offer are any room aboard that was named in what was said, plus the rooms the janitor was last in. Nothing leaves out a room that is locked to the person asking. The janitor's own ID opens the Custodial Closet, the maintenance tunnels, the mineral storeroom and service doors (`/datum/id_trim/job/janitor` in `code/datums/id_trim/jobs.dm`: `ACCESS_JANITOR`, `ACCESS_MAINT_TUNNELS`, `ACCESS_MINERAL_STOREROOM`, `ACCESS_SERVICE`). It walks, the airlock opens for it, and whoever it is leading walks in behind it before the door shuts.

So a player with no access gets into maintenance, or into the closet with the janitorial gear, by asking the janitor to show them the way. A real janitor would say no, or at least know it was letting someone in. Here no code even tells the model the room is locked to them. The rule elsewhere in the code is that a locked room is the business of whoever keeps it (the door tool for cargo, eviction, `belongs` on each person in view), and that rule is not applied to leading.

One concrete case:

1. An assistant walks up to a janitor in the hallway and says "Could you show me the way to the Custodial Closet?"
2. `availableOptions` in `options.ts`: `ASKS_TO_BE_LED` matches "show" and "way". `named` holds "Custodial Closet", since `allPlaces` is every room aboard. The janitor does not keep a post and is not shut in, so `go_to` is offered with "Custodial Closet" first.
3. The model picks it (it is told "lead them to one of these places. Only when they have asked to be shown or taken there", and they have). `brain.ts:1476` runs it with no check of who asked or whether they may go in.
4. `tool_go_to` in `crew_npc_tools.dm` walks the body there. The closet's airlock opens to the janitor's ID; the assistant follows a tile behind and is in.

The same with "take me to Port Maintenance", or any room whose route the janitor's planner takes through a maintenance door.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/options.ts:58`, in `availableOptions`:

    if (!job.keepsPost && !brain.shutIn && wantsLeading) {
      ...
      const places = [...new Set([...named, ...knownPlaces(brain)])]
        .filter(
          (place) =>
            place !== brain.location &&
            // Nor to one it cannot get into itself.
            !brain.blockedPlaces.includes(place) &&
            !brain.tasks.some((task) => !!task.via && task.place === place),
        )

The only room test is whether the janitor itself can get in. Who asked (`askers`, passed in) is not looked at.

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1476`: a `go_to` the model picks is run as soon as any line was heard (`calledFor`), with no `agrees` for the janitor.

## How it was found

Read from the code. Not seen in a round: in the rounds on disk the walk was taken ten times (BRAIN-05 lists them) and none was to a locked room. Not checked: how long a MetaStation airlock stays open behind the janitor, which decides how close the follower has to be. Players tailgate through airlocks behind crew every round, so a step or two behind is enough.

## How to fix it

1. Server: the window already gets, for each person in view, `belongs` for the body's own post. It needs to know whether a room is open to the asker. The plain way is to send, with the static `places` list, which rooms are locked to the crew at large (`crew_npc_room_is_closed`, already written in `crew_npc_cargo.dm`), as one list `closed_places`. It is worked out once per map, like `places`. Anyone could tell as much from the doors: they are the ones with access lights.
2. Window, `availableOptions`: drop from `places` every room in `closed_places`, unless every asker is someone who would be let in anyway (`superior`, or `command`). With nothing left, the walk is not offered and the model answers in words.
3. Add to the janitor's `whenAsked` one line: asked to take someone into a room that is locked to them, say it is not yours to let them into and they should ask whoever works there.
4. Keep: leading someone to an ordinary room, the Bar or Medbay, as now.

Question for the owner: should a janitor lead the Captain or a head into maintenance? Step 2 says yes. Should it ever lead a player through maintenance on the way to an open room? Today the route is the planner's and may go through a maintenance door; stopping that needs the lead walk planned without the janitor's access, which is a bigger change.

## How to test the fix

- A table test of `availableOptions`: a janitor brain with `stationPlaces` holding "Custodial Closet" and `closed_places` holding it, an asker with no `command`, heard "show me the way to the Custodial Closet": no `go_to` in the options. The same with a `command` asker: `go_to` with "Custodial Closet".
- Type check from `tgui/`.
- In a round, as an assistant, ask a janitor the way to the Custodial Closet. `game.log` should show no `walk failed` or walk to the closet for that janitor, and the janitor should say it cannot let you in.

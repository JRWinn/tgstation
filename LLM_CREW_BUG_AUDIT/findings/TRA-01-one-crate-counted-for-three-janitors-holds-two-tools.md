---
id: TRA-01
title: The head orders one crate for every three janitors short, but a crate of janitorial supplies holds only two things a janitor counts as proper tools
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:124, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:252, code/modules/cargo/packs/service.dm:27, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:45, tools/llm_crew/sim.ts:502
fix: Count a Janitorial Supplies Crate as good for two janitors (its mop and its spray cleaner), not three, and give the simulator's crate the rag the real one has
---

## What is wrong

The Head of Personnel works out how many crates to order from how many of its staff are short: `Math.ceil(people / PER_CRATE)`, with `PER_CRATE = 3`. So three janitors short of something to clean with get one crate.

The real Janitorial Supplies Crate (`/datum/supply_pack/service/janitor`) holds one mop, one spray cleaner and one rag, besides buckets, signs, a push broom, a trash bag and grenades. Of those, the janitor's code counts only the mop and the spray cleaner as worth having. A rag is a "poor tool" (`PROPER_SUPPLY` in `janitor.ts` leaves it out; `has_poor_tool` on the server says so), and a janitor with only a rag is still short and asks for "something better than a rag". Grenades and the broom are not cleaning tools at all (`CLEANING_SUPPLY`).

So one crate makes two janitors whole and leaves the third with a rag. That janitor is short again. Once it has looked round the closet and found nothing better, `supplyStep` reaches `needStep` and it sends its head "I need something better than a rag to clean with for my work" (its `toldHeadAt` was cleared by the "what you asked for has come" message). A second crate is then ordered, the Captain perhaps asked again, the shuttle sent again, and another janitor sent to the counter. The third janitor works with a rag for the ten minutes or so that takes.

Concrete case, the usual crew: three janitors and nothing in the Custodial Closet that the first meeting has not already taken. At the 2-minute meeting all three report "I need something to clean with". `orderFor` makes one line: `count: Math.min(4, Math.ceil(3 / 3))` = 1. The head sends "I need to order a crate of janitorial supplies for my staff, please." One crate comes. Jan unpacks it in the closet: the mop and the space cleaner go to the first two who reach them, the third takes the damp rag. It finds nothing better in the closet and sends its head "I need something better than a rag to clean with for my work. Could you get it ordered, please?". A second crate is ordered then, for something the first order was meant to cover.

The comment on `CLEANING_SUPPLY` shows the count was thought about once, when a rag was made to count as a tool ("with only a mop and a spray counted, a crate was good for two janitors"). Making the rag a poor tool afterwards put the count back to two, and `PER_CRATE` was not changed with it.

The simulator cannot show this. Its crate holds `['mop', 'space cleaner']` and no rag, and in the `crew` scenario only one janitor is short when the first order goes in.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:124`:

    /** How many people one crate of supplies is good for. */
    const PER_CRATE = 3;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:249`, in `orderFor`:

    lines.push({
      crate: supply.crate,
      what: supply.ordered,
      count: Math.min(CRATES_MAX, Math.ceil(people.length / PER_CRATE)),

`code/modules/cargo/packs/service.dm:27`, what the crate holds:

    contains = list(/obj/item/reagent_containers/cup/bucket = 3,
                    /obj/item/mop,
                    /obj/item/pushbroom,
                    /obj/item/clothing/suit/caution = 3,
                    /obj/item/storage/bag/trash,
                    /obj/item/reagent_containers/spray/cleaner,
                    /obj/item/rag,
                    /obj/item/grenade/chem_grenade/cleaner = 3,
                )

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:40`, what counts:

    const CLEANING_SUPPLY = /soap|space cleaner|mop$|\brag$/i;
    /**
     * Those of them that are worth having. A rag is a poor tool: ...
     */
    const PROPER_SUPPLY = /soap|space cleaner|mop$/i;

`code/modules/llm_crew/crew_npc_cleaning.dm:27`, `has_poor_tool`: a body whose working tool is a rag is short.

`tools/llm_crew/sim.ts:502`, the simulator's crate:

    'Janitorial Supplies Crate': { box: 'janitorial supplies crate', contents: ['mop', 'space cleaner'] },

## How it was found

Read from the code and the base-game supply pack. Not seen in a round: no round log read had three janitors short at once.

## How to fix it

1. In `head.ts`, set `PER_CRATE` to 2, and change its comment to say why: a crate holds one mop and one spray cleaner, and a rag does not count.
2. Better, keep the count beside the crate it is about: add `perCrate: 2` to the janitor entry in `SUPPLIES` and use `supply.perCrate` in `orderFor`. A future entry (light bulbs for the light replacer plan) will hold a different number.
3. In `tools/llm_crew/sim.ts`, give the simulator's crate the rag the real one has: `contents: ['mop', 'space cleaner', 'damp rag']`, so that the simulator gets the same mix as a round.
4. Check `CRATES_MAX` (4) still covers the crew: with `perCrate: 2`, eight janitors short is four crates.

## How to test the fix

- Type check from `tgui/`.
- Add a simulator scenario (or a variant of `crew`) in which all three janitors start with nothing and the closet is empty. Pass if the head's first order is for 2 crates, and if no janitor reports "something better than a rag" at the second meeting.
- In the next round's `pda.log`, find the head's "I need to order ..." line after a meeting at which three janitors reported a need: it should say "2 crates of janitorial supplies".

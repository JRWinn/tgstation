---
id: SEC-06
title: After a third baton hit the cuffs are swung inside the click cooldown, nothing happens, and it is reported as the person not standing still
kind: bug
severity: low
effort: small
confidence: sure
status: found
area: security
files: code/modules/llm_crew/crew_npc_security.dm:980, code/modules/llm_crew/crew_npc_security.dm:1013, code/modules/llm_crew/crew_npc_machines.dm:259, code/_onclick/click.dm:120
fix: Have click_as_body wait out body.next_move before it clicks, and say so when a click was not made
---

## What is wrong

A hit with the baton sets the body's click cooldown, as it does for a player: `user.changeNext_move(attack_speed)`, 0.8 seconds (`CLICK_CD_MELEE`). `ClickOn` drops any click made before that is up, silently:

    if(next_move > world.time) // in the year 2000...
        return

`click_as_body` does not look at `next_move`. It calls `ClickOn` and returns TRUE, so its caller believes a click was made.

In `baton_hits` a hit that lands is followed by `sleep(CREW_NPC_BATON_WAIT)` (2.5 seconds), but only `if(landed < most)`. The last hit allowed, the third in a `force` arrest, is followed by nothing: the proc returns at once and `make_arrest` goes straight to `put_cuffs_on`. That swings the cuffs 0.2 seconds later (`CREW_NPC_STRIKE_GAP`), inside the 0.8 seconds. The click is dropped. No cuffing starts, so `length(body.do_afters)` is 0 and the wait loop is skipped. For someone who is down it tries once more, 0.2 seconds on, still inside the cooldown, and that is dropped as well.

The answer sent back is "You could not get the cuffs on X: they would not stay still", reason `moved`, about someone lying stunned at its feet. The window counts a failed try (three of those and it "leaves them be" for 30 seconds and tells the Head of Security they "will not stand still").

One concrete case: someone in armour, or with baton resistance, who is still on their feet after two hits. Third hit at T. `put_cuffs_on`: `draw_item` returns at once (the cuffs are in the other hand already), `close_with` returns at once (they are adjacent), `click_as_body(person, null, 0.2 s)` clicks at T+0.2: dropped. Second go at T+0.4: dropped. FALSE.

The same hole is behind the "its baton did nothing when it touched them" branch: after a swing that connected and did nothing, the loop sleeps 0.5 seconds and swings again at 0.7, which is still inside 0.8, so one swing in two of that kind is thrown away out of its eight.

`start_pulling` also sets the cooldown (1 second, `CLICK_CD_GRABBING`), so any click added later right after a hold will be lost the same way.

## Where

`code/modules/llm_crew/crew_npc_security.dm:977`, in `baton_hits`:

    if(!QDELETED(baton) && baton.cell?.charge < charge_before)
        landed++
        baton_stopped = null
        if(landed < most)
            sleep(CREW_NPC_BATON_WAIT)
        continue

`code/modules/llm_crew/crew_npc_security.dm:1013`, in `put_cuffs_on`:

    if(click_as_body(person, null, CREW_NPC_STRIKE_GAP))
        var/waited = 0
        while(waited < CREW_NPC_CUFF_WAIT && ... && isnull(person.handcuffed) && length(body.do_afters))

`code/modules/llm_crew/crew_npc_machines.dm:259`, `click_as_body`, which returns TRUE whether or not `ClickOn` did anything:

    if(!body.can_perform_action(target, target.interaction_flags_click | SILENT_ADJACENCY))
        return FALSE
    body.face_atom(target)
    body.ClickOn(target, modifiers)
    return TRUE

`code/_onclick/item_attack.dm:203`: `user.changeNext_move(attacking_item.attack_speed)`.

## How it was found

Read from the code. Not seen in a round: it needs someone who takes three hits, and the rounds so far had a monkey that went down in two.

## How to fix it

1. In `click_as_body`, after the `gap` sleep and the `QDELETED` checks, wait for the body's own cooldown as a player has to: `if(body.next_move > world.time) sleep(body.next_move - world.time)`, then make the `QDELETED` and `can_perform_action` checks (they are already after the sleep: keep them after this one too). Cap the wait at a couple of seconds so a body in cuffs (`CLICK_CD_HANDCUFFED`) cannot stall a caller for long.
2. Also in `click_as_body`: `ClickOn` drops a second click in the same tick (`world.time <= next_click`). Nothing in the security file makes two in one tick today, but the same wait covers it: `max(body.next_move, body.next_click + 1)`.
3. No change is then needed in `baton_hits` or `put_cuffs_on`. The 0.2 second strike gap stays for the first swing after a step, which is what it was for.

This is one proc used by every job, so check the other callers do not depend on a dropped click (none should: a click that is dropped does nothing).

## How to test the fix

- Server compile on a side copy.
- In a round: give the target a riot suit, or have the officer make a `force` arrest of someone the player keeps standing with stimulants. `game.log` should show "hit ... with its baton 3 times" followed by "arrested", not by a second arrest a few seconds later.

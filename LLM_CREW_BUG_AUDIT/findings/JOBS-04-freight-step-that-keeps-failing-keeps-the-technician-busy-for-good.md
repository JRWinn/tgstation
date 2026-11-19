---
id: JOBS-04
title: A freight step that cannot be done, such as mail with the bag full, is never set aside, so the technician counts as busy with freight for good and never tidies or looks round again
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:69, tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:247, tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:111, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:911, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1028, code/modules/llm_crew/crew_npc_freight.dm:562
fix: Pass ok and the reason to afterFreight, block a freight task whose step has failed three times running for a few minutes (retryAt as pickups does), and let SEND go while the mail task is blocked
---

## What is wrong

Every freight task is opened and closed by `keep()` from the server's counts alone: `UNLOAD` while `toUnload > 0`, `MAIL` while `mailCrate`, `RECYCLE` while there are empties, `STOW` while `misplaced > 0`. None of them is ever blocked. When the step fails, the driver's back-off leaves that step alone for 20 seconds, then 40, up to two minutes (`fail` in `driver.ts`), and the task stays `open`. If the cause does not go away, the task is open for the rest of the round. (The 30-minute give-up in `syncTasks` drops it and `keep()` opens it again on the next update.)

An open freight task is what `freightInHand` (`cargo.ts:302`) looks for, and cargo gates its quiet-time work on it:

- `syncRounds(brain, ... && !freightInHand(brain) && ...)` (`cargo.ts:907`): it never looks in on its department again;
- `planTidying(brain, task, orderInHand(brain) || freightInHand(brain) || heldInHand(brain))` (`cargo.ts:1025`): tidying is "It can wait until your other work is seen to" for good;
- the walk back to the post (`away`, `cargo.ts:918`) is never opened while freight is in hand.

And `SEND` waits for `!freight.mailCrate` (`freight.ts:117`), so a mail crate that cannot be emptied also keeps the shuttle in the dock.

The ordinary way into this is mail. `take_mail` puts each addressed letter in the bag with `equip_to_storage`; when nothing fits it fails with "You have no room in your bag for the mail in the mail crate." (`crew_npc_freight.dm:562`). Letters for someone who never comes to the counter stay in the bag for the whole round: the recipient is sent one PDA message (`afterFreight` marks `mailTold` whether it went or not) and the `DELIVER` task then waits, blocked, for them to turn up. A backpack holds 21 weight of things and a letter weighs 2, less what the outfit packed. Each mail crate carries at most one letter for each living player, the rest junk (`populate` in `code/game/objects/items/mail.dm`), and in this project's rounds the one player is the Captain, who has no reason to walk to the cargo counter. After enough shuttle trips, the next mail crate cannot be emptied by that technician.

One concrete case: a round with one technician. The Captain has been sent "There is mail for you at cargo" several times over the round and never came. The technician's bag is full. A new mail crate is hauled off the shuttle. `MAIL` opens; `collect_mail` fails; `MAIL` stays open. From then on the technician never tidies the bay or the lobby, never looks in on the Delivery Office or the Warehouse, and, if a crate errand or a door ever takes it out to the lobby, `away` is false so no `POST` task takes it back to the bay. The supply shuttle is never sent back (`SEND` never opens), so the empties aboard it are never sold.

The same shape comes from any freight step the server keeps refusing: `UNLOAD` with "There is no room to put the crate" when the bay is full, `STOW` of a crate that cannot be moved (see SUP-04 for the server side of that), `CALL` while the shuttle is in flight (`send_shuttle` fails with "The supply shuttle is not here to send back" until it is idle). Of these only the mail and a crate that cannot be moved last: a full bay empties as crates are collected or recycled, and a shuttle in flight lands within minutes. (Checker's note.)

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:69`, the only way a freight task is opened or closed:

    function keep(brain: NpcBrain, kind: string, wanted: boolean): void {
      const task = findTask(brain, kind);
      if (wanted && !task) {
        addTask(brain, { kind, urgency: 'routine', source: 'own' });
      } else if (!wanted && task) {
        finishTask(brain, task);
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:247`: what is noted after a step, which never looks at whether it went:

    export function afterFreight(
      brain: NpcBrain,
      act: Action,
      task: Task | undefined,
    ): void {
      if (task?.kind === DELIVER && task.item && act.tool === 'message') {
        brain.mailTold[task.item] = brain.now;
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1912`, its one caller, which has `ok` and drops it:

    afterActing: (brain, act, task, ok) => {
      afterFreight(brain, act, task);

`code/modules/llm_crew/crew_npc_freight.dm:561`, in `take_mail`:

    if(!taken && !binned)
        return list(FALSE, left ? "You have no room in your bag for the mail in the [crate_name]." : "There is no mail in the [crate_name].")

## How it was found

Read from the code: all of `freight.ts`, the freight gates in `cargo.ts`, `fail` and `inBackoff` in `driver.ts`, `take_mail` on the server and `populate` in the base mail crate. How soon a bag fills was not measured (it depends on what the cargo outfit packs and how many shuttle trips a round has), hence `likely`. Not seen in a round.

## How to fix it

1. Give `afterFreight` the `ok` flag and the result `details` (or the result text) from `afterActing` in `cargo.ts`.
2. In `afterFreight`, when a step of `UNLOAD`, `MAIL`, `RECYCLE`, `STOW`, `CALL` or `SEND` fails, count it on the task (`task.fails`, cleared on a success). On the third failure running, set `task.retryAt = brain.now + FREIGHT_RETRY_DS` (about 1800, three minutes) and remember the reason on the task. Not on the first: a walk that fails once, or a crate that loses its grip once, is already left alone by the driver's own back-off for 20 seconds, and blocking `UNLOAD` for three minutes on one bad walk would slow every shuttle.
3. In `syncFreight`, after the `keep()` calls, block each freight task whose `retryAt` is still ahead (`blockTask(task, reason)`) and unblock it once it has passed, the way `syncPickups` does with its `retryAt`. A blocked task is not "in hand", so tidying, the look round and the walk back to the post go on meanwhile. `keep()` must not finish and re-add a blocked task: it only looks at whether one exists, so it will not.
4. In the `SEND` condition, let a `MAIL` task that is blocked not hold the shuttle: replace `!freight.mailCrate` with "no mail crate, or the mail task is blocked". The mail crate is in the bay, not aboard, so it does not stop the shuttle flying.
5. For mail in particular, the owner may want more: when the bag is full, put the uncollected mail for one person on the counter or in a locker, or send the recipient a second PDA message. That is a design question: what should a technician do with mail nobody comes for?

## How to test the fix

- Simulator: a cargo scenario where `collect_mail` always fails with "no room in your bag". Within a few minutes the technician must send `tidy` or `go_to` a look-in room, and `send_shuttle` once the rest is unloaded.
- Type check. In a long round, grep `game.log` for "no room in your bag" and check the same body still has `tidy` and look-in walks after it.
- A case for the second half: one failed `unload` walk followed by a success must not block `UNLOAD` at all.

## Check

Checked by Opus 5.5. Read `keep`, `syncFreight`, `afterFreight` and `freightInHand` in `freight.ts`; the cargo gates (`inHand`, `syncRounds(...)` at `cargo.ts:907-916`, `away` at 919-927, `planTidying(...)` at 1025-1029) and `afterActing` at 1911-1912, which takes `ok` and does not pass it on; `inBackoff` and `fail` in `driver.ts`; the 30-minute filter in `syncTasks` (`tasks.ts:154`), which keeps blocked tasks and drops open ones only for `keep()` to add them again. On the server: `mail_crate`, `tool_collect_mail` and `take_mail` (`crew_npc_freight.dm:231-565`). `mail_crate()` still finds a crate whose addressed letter did not fit, so `mail_crate` stays TRUE and `MAIL` stays open. In the base game, `populate` (`code/game/objects/items/mail.dm:283`) gives each mail crate at most one letter per living human in `GLOB.player_list`, which holds only mobs with a client, so NPCs get none and the Captain gets one a crate; letters are `WEIGHT_CLASS_SMALL` (2) and `/datum/storage/backpack` holds 21. Junk letters are dropped at the feet, not bagged, unless the body stands on the crate's tile or on the shuttle. So about eight uncollected letters fill a technician's bag, which wants a long round with the Captain never at the counter, never in a technician's view (`DELIVER` hands mail over to anyone in view). From then on the fault is as written: no tidying, no rounds, no walk back to the post, and `SEND` never opens. Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions a full bag or blocking freight tasks. Confirmed; the medium severity holds because a full bag needs a long round. I added the three-failures rule to the fix, since a block on the first failure would hold up ordinary unloading.

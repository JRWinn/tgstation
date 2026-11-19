---
id: SUP-07
title: Any PDA message to a person strikes off the first crate notice owed to them, so a note about mail cancels the word that their order has come in
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:709, tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:205, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:720
fix: Have the window say which notice a message is about and have tool_message strike off only a notice of that kind
---

## What is wrong

A technician keeps a list, `notices_owed`, of word it owes people about their crates: an order has come in ("arrived"), crates are still waiting ("waiting"), a crate is lost ("lost"). The window turns each into a task and the task ends when the notice is gone from the list.

`tool_message` strikes a notice off as soon as *any* message is sent to that person. It matches on the name alone. It does not look at what the message says or which notice it was for, and it takes the first one in the list.

The message that most often goes to the same person is the one about mail. Mail comes on the same shuttle as the order. The only people who get mail are players (`populate` in `code/game/objects/items/mail.dm` picks from `GLOB.player_list`), which in these rounds is the Captain, and the Captain is also who orders.

One case:

1. The Captain orders a crate through the Quartermaster. Maria places it with `for_name` the Captain and `via` the Quartermaster.
2. The shuttle docks. `order_arrived` adds `list("to" = "Zim Fire", "kind" = "arrived", "numbers" = list(12), "via" = "Quinn ...", "ref" = 3)`.
3. With a Quartermaster aboard, the word goes to it face to face first. The Quartermaster is in its office, so Maria's ORDER task is waiting on a knock. She gets on with the shuttle meanwhile: unloads, takes the mail out.
4. One letter is for the Captain. The DELIVER task sends `message` to "Zim Fire": "There is mail for you at cargo..."
5. In `tool_message`, the loop finds the "arrived" notice for "zim fire" and removes it.
6. In the window, `arrivedNotice(brain)` is now empty and `order_pending` is false, so `syncTasks` marks the ORDER task `reported` and closes it. Maria never tells the Quartermaster "order 3 has come in". The Quartermaster's book keeps order 3 as "given ... has not come in yet". The Captain is never sent crate number 12.

The crate is not lost for good: five minutes later the look over the bay owes a "waiting" notice, and that one carries the number. But the order is told late, by the wrong route, and the book is wrong.

The same loop makes smaller muddles with no mail in it. With two notices for one person, say "waiting" then "lost", the window's LOST task sends its message, the server strikes off the "waiting" one, the LOST notice is still there, and the "lost" message is sent a second time.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:707`, in `tool_message`:

    	var/wanted = LOWER_TEXT(trim(person_name))
    	var/datum/computer_file/program/messenger/target = messenger_named(wanted, own_messenger)
    	// Having tried is enough. Someone with no PDA cannot be told this way, and trying again would not change that.
    	for(var/list/notice as anything in notices_owed)
    		if(LOWER_TEXT(notice["to"]) == wanted)
    			notices_owed -= list(notice)
    			break

Compare `tool_word_passed` in `crew_npc_quartermaster.dm:349`, which does look at the kind:

    		if(LOWER_TEXT(notice["to"]) == wanted && (!istext(kind) || notice["kind"] == kind))

The mail message, `tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:205`:

          act: {
            tool: 'message',
            person: name,
            text: 'There is mail for you at cargo. Come by the counter in the Cargo Lobby when you can and I will hand it over.',
          },

The task closing, `jobs/cargo.ts:720` in `syncTasks`:

      } else if (order) {
        // The PDA message was the telling, so nobody is left waiting to hear.
        order.reported = true;
        finishTask(brain, order);
      }

A message to a janitor about a mess, and anything the model itself sends with the `message` tool, go through the same loop.

## How it was found

Read from the code. Not seen in a round: no `pda.log` was searched for a mail message sent while an arrival was still owed. That the removal is by name alone is certain. How often the mail message beats the arrival word depends on how long the technician takes to find the Quartermaster.

## How to fix it

1. Server, `handle_tool_call` in `crew_npc_tools.dm`: pass a third argument, `tool_message(arguments["person"], arguments["text"], arguments["about"])`.
2. Server, `tool_message`: strike a notice off only when `about` is one of `CREW_NOTICE_ARRIVED`, `CREW_NOTICE_WAITING`, `CREW_NOTICE_LOST`, and only a notice of that kind for that person:

       if(istext(about))
       	for(var/list/notice as anything in notices_owed)
       		if(LOWER_TEXT(notice["to"]) == wanted && notice["kind"] == about)
       			notices_owed -= list(notice)
       			break

   Keep it before the "cannot find that person" return, so that "having tried is enough" still holds for someone with no PDA.
3. Window, `jobs/cargo.ts`: add `about` to each message that pays a notice off: `about: 'arrived'` on the two arrival messages in `plan` (the one to the Quartermaster by PDA and the one to whoever ordered), `about: 'lost'` in the LOST branch of `planHeld`, `about: 'waiting'` in the REMIND branch. The mail message in `freight.ts` and the janitor call get none.
4. `tools/llm_crew/sim.ts` plays the server. Find where it answers the `message` tool and drops a notice, and make it go by `about` the same way, or the simulator will pass what the game fails.
5. `types.ts`: `about` is one more optional field on an action. Check `prompt.ts` so it is not offered to the model as a parameter.

What must keep working: a notice to someone with no PDA is still dropped after one try, as the comment says. The `word_passed` tool is unchanged.

## How to test the fix

- Type check. `sim.ts quiet` on the order scenarios and the `qm` scenario, a few runs each.
- A new simulator case: an order for the Captain through the Quartermaster, the Quartermaster out of sight, and a letter for the Captain in the same shuttle. After the mail message, the "arrived" notice must still be owed and the Quartermaster must still be told.
- Server compile to a side copy.
- In a round: order as the Captain, and check `pda.log` and `game.log`: the technician's "order N has come in" to the Quartermaster must come whether or not the mail message went first.

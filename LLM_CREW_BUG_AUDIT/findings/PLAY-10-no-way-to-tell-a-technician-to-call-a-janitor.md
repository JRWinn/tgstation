---
id: PLAY-10
title: The Captain cannot tell a cargo technician to call a janitor, and the technician says the same refusal twice word for word
kind: gap
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/orders.ts:22, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:218, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:788, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1508, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:169, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:202, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:270
fix: Add a call-a-janitor order to ORDERS that takes the NPC's own room when none is named and sends the janitor PDA by the existing call code, change the cargo prompt line to match, and check a reply against the NPC's own last few lines as unprompted remarks are
---

## What is wrong

A cargo technician cannot be told to send for a janitor. Its body sends for one only when the body itself has seen a mess in its own department. Nobody can ask for it, not even the Captain, who the prompt says it must obey. The model is told to refuse cleaning, is told its body calls janitors by itself, and has no order it can name to make the body do it. So it refuses, and nothing happens.

On top of that, nothing stops a reply being the same line as the one the NPC said a few seconds before. The check that does this is applied only to remarks nobody asked for.

The case from the round. Jace Richardson is a cargo technician at his post in the Cargo Bay, with the counter as his share of the work. Kailyn Patterson has the rooms. No mess is in Jace's view.

1. The Captain, two tiles away, says "its messy in here". The model is asked. Its prompt says cleaning is not its job. Its `work` field can only name "an order to go and look at a room and report back". It gives `"what": "nothing"` and says it is not its job.
2. The Captain says "Then ask for a janitor". The prompt is the same. There is still no order for this. The model gives `"what": "nothing"` again, and the very same line as before.
3. The line passes. It is a reply to someone, so `saidBefore` is never asked.
4. No janitor is sent a PDA message about the Cargo Bay. The Captain's order is lost, and he hears the same refusal twice.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/orders.ts:22`. The only order a superior can give anyone is to look at a room:

    export const ORDERS: Record<string, string> = {
      [LOOK]: 'an order to go and look at a room and report back',
    };

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:169`, in `workTold`. What the model may put in `work` is the job's own `takes` and `ORDERS`. Cargo has no `takes` (only `jobs/janitor.ts:831` has one: `takes: { [CLEAN]: A_MESS }`):

    const kinds = [
      ...Object.values(jobFor(brain.job).takes ?? {}),
      ...(fromSuperior ? Object.values(ORDERS) : []),
    ];

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:218`, in `whenAsked`. The model is told to refuse, with no way out:

    'You do not clean, fetch things or show people around: that would take you from your post. Asked to, say it is not your job. Cleaning is for the janitors.',

and, when the words touch on a mess (`OWN_WORK_WORDS` has `mess|messy|janitor`), that the body does it by itself:

    'The rest of your work your body does by itself: ... and sends a janitor a PDA message when there is a mess. ...'

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:788`. The only way a `tidy` task, the task that sends for a janitor, comes about is a mess the body has had in sight (`areaMesses`, from the server). It ends as soon as `areaMesses` has none for that room:

    for (const place of Object.keys(brain.areaMesses)) {
      if (!findTask(brain, TIDY, { place })) {
        addTask(brain, { kind: TIDY, place, urgency: 'routine', source: 'noticed' });
      }
    }

And even with a mess seen, after the Quartermaster's meeting `tidyStep` (`cargo.ts:1669`, the test at `cargo.ts:1701`) leaves the call to whoever has the rooms (`roomsKeeper`). That was Kailyn, not Jace. So nothing the Captain said to Jace could have reached the call code:

    const keeper = roomsKeeper(brain);
    if (keeper && keeper !== brain.name) {

The net that catches orders the model did not name (`workInWords`, `tasks.ts:270`) would not have caught it either, even with a call order in `ORDER_SOUNDS`. It gives up when no room is named, and "Then ask for a janitor" names none:

    if (!place || (fromSuperior && isMeetingOrder(brain, heard))) {
      return null;
    }

And `takeToldWork` (`tasks.ts:202`) turns down "nowhere you know", the room the model gave in the second reply:

    if (!kind || typeof where !== 'string' || !knowsPlace(brain, where)) {
      return null;
    }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1508`, the line filter. The repeat check is only for unprompted lines:

    return !(
      alone ||
      (dropped && speakers.length === 0) ||
      (unprompted && (isFiller(text) || saidBefore(brain, text)))
    );

with `const unprompted = speakers.length === 0 && !mustSay;` at `brain.ts:1479`. `saidBefore` (`brain.ts:871`) and its comment "People do not say the same line twice" exist, but a reply never reaches them. This is on purpose: the comment above the filter says "An answer to someone, or a line its work calls for, is said regardless." The round shows what that costs.

## How it was found

Seen in a played round, `data/logs/2026/11/19/round-15.44.36`.

`game.log`:

    [2026-11-19 22:11:45.352] GAME-SAY: zimfire/(Zim Fire) (mob_3015) "its messy in here" (Cargo Bay (76,149,2))
    [2026-11-19 22:11:48.816] GAME: Crew NPC *no key*/(Jace Richardson) (owner: zimfire) was told by its brain to say: Hey Zim! Cleaning isn't part of my job description, that's what the janitors are for. I'm just standing here taking orders from Tyson Jones! Want something specific ordered? Tell him instead!
    [2026-11-19 22:11:58.793] GAME-SAY: zimfire/(Zim Fire) (mob_3015) "Then ask for a janitor" (Cargo Bay (76,149,2))
    [2026-11-19 22:12:02.240] GAME: Crew NPC *no key*/(Jace Richardson) (owner: zimfire) was told by its brain to say: Hey Zim! Cleaning isn't part of my job description, that's what the janitors are for. I'm just standing here taking orders from Tyson Jones! Want something specific ordered? Tell him instead!

`crew_brain.log`, Jace's two decisions at 22:11:49 and 22:12:02 (prompt times 16:11:45 and 16:11:58). Both prompts carry "You answer to Zim Fire. What Zim Fire orders, you do ..." and offer only "an order to go and look at a room and report back" for `work`. Both list no mess in "You can see". Both replies give `"work": {"what": "nothing", ...}`. The second reply's context already holds the first line under "What has been said lately", and the model gave it back word for word.

`pda.log` has no message to a janitor about the Cargo Bay after 21:57:41 (Kailyn to Hayden Griffiths, about a cobweb Netta could not shift). The round's log ends at 22:14:51. So the order was not carried out by anyone in the three minutes left.

Then the code above was read: `ORDERS`, `workTold`, `takeToldWork`, `whenAsked`, the `tidy` task loop, `tidyStep` and the line filter in `brain.ts`.

A cobweb was still in the Cargo Bay at 22:11, out of Jace's sight: Tyson Jones's prompt at 22:12:09 lists "cobweb (a mess)" there. Kailyn had already sent Hayden Griffiths for that cobweb at 21:57:41 ("There is a mess in the Cargo Bay: cobweb. Netta could not shift it"). Not checked: whether Kailyn's call was still open at 22:11. It does not change the fault. Jace could not send for anyone, and could not say that someone was already coming.

Searched for the same fault. No finding covers it. Near ones:

- `CARGO-11`: the other technician never calls while the rooms keeper is gone. Same `roomsKeeper` test, but about a mess the body saw, not an order.
- `MEM-07`: a janitor told of a mess out of sight takes nothing on. Janitor side, `takeToldWork`.
- `PARSE-01`: "clean the bar" not read as a mess. Janitor side.

The planned "janitor call" in `LLM_CREW_PLAN_NO_CHEATS.md` section 4.3 is a different thing. It is about one technician's work list saying that a workmate has already sent for a janitor, and about what a janitor says when it asks to be let out. It does not plan a way for anyone to tell a technician to call one. This is not in any plan.

## How to fix it

1. In `jobs/orders.ts` add a second order beside `LOOK`, for example `CALL = 'call'`, with the words `'an order to send for a janitor to a room'`, and sounds for the net in `ORDER_SOUNDS`: `/\b(call|ask for|get|send for|fetch)\b[^.]*\bjanitors?\b/`. Any NPC with a PDA can carry it out, so it belongs in `ORDERS`, not in one job.
2. Let the order be taken with no room named. In `takeToldWork` (`tasks.ts:202`), for this order only, read `WORK_NOWHERE` (or a missing room) as the room the NPC is standing in, `brain.location`, since that is where the Captain was. In `workInWords` (`tasks.ts:270`), do not return early on no `place` before the `ORDER_SOUNDS` loop has had a try at this order, again with `brain.location` as the room. Without this, the case from the round ("Then ask for a janitor", no room named) is still lost by both the model path and the net.
3. Give it a step in `planOrders` (`orders.ts:110`, which now returns null for anything but `LOOK`). If the NPC has no PDA or no janitor on it (`brain.hasPda`, `brain.janitorsOnPda`), say so to whoever gave the order and finish. If its own `brain.janitorCalls[place]` already holds an open call, do not send another: tell the one who gave the order who was sent for, and finish. Otherwise send one janitor the same message `tidyStep` sends (`cargo.ts:1793`, "There is a mess in the X. Could you come and clean it up, please?"), naming who asked for it if the NPC did not see the mess itself. Then tell the one who gave the order who was sent for, and finish.
4. For a cargo NPC whose post is that room, also record the call in `brain.janitorCalls[place]`, so the janitor who comes is let in and not asked their business. A Captain's or head's order is not left to the rooms keeper: the `roomsKeeper` test in `tidyStep` must not apply to it. This can mean two calls for one mess, when the rooms keeper has sent for one already and the one told cannot know it. That is what a player would do too, and it is better than a lost order. The tidy loop at `cargo.ts:797` deletes `janitorCalls[place]` once `areaMesses` has none for the room; a call made on an order for a mess the NPC never saw must not be dropped by that before the janitor comes, or the janitor is shut out.
5. Change `cargo.ts:218` so that the model is not told only to refuse: "You do not clean ... Asked to, say it is not your job. Cleaning is for the janitors: if someone you answer to asks you to send for one, your body does." Keep it true: say it only once steps 1 to 3 are in. The line at `cargo.ts:222`, "sends a janitor a PDA message when there is a mess", also misleads a technician that does not have the rooms: say instead that whoever has the rooms sends for one.
6. In the line filter in `brain.ts`, check replies too, with a tighter test. A reply whose words match a line the NPC said in the last minute or so, almost whole (say 0.9 of its words, not `SAME_LINE_SHARE`'s 0.6), is not said as it stands. The owner should choose what happens then: ask the model once more with a note "You said that just now", or say nothing. I would ask once more, then say nothing, so a dead or stubborn model still cannot stall the body.

The no-cheats rule holds: the body sends a PDA message a player could send, to a janitor on its PDA list.

## How to test the fix

- Type check the window code.
- Add a simulator scenario in `tools/llm_crew/`: a Captain beside a cargo technician in its post, with a janitor on the PDA list. He says "its messy in here", then "Then ask for a janitor". Check that one PDA message goes to a janitor naming the Cargo Bay, that the Captain is told who was sent for, and that the janitor is let in when it knocks. Run it again with a second technician holding the rooms, to see that the one told still calls.
- Run it once with the stand-in model giving `"work": "nothing"` (or a dead model), so that only the net in `workInWords` can take the order. "Then ask for a janitor" names no room: check the order is still taken, for the room the technician stands in.
- Run it once where the technician has already called for that room, and check no second message goes and the Captain is told who is coming.
- Add a case where the stand-in model gives the same reply twice to one speaker, and check the second is not said as it stands.
- In the next round's `game.log`, grep for "ask for a janitor" or "call a janitor" from the Captain, and in `pda.log` for a technician's message to a janitor in the next few seconds. Grep `game.log` for two lines from one NPC with the same text within a minute.

## Check

Checked by Opus 5.5 against `round-15.44.36` and the window code at `99f4d33dd0e`. Confirmed.

What I read:

- `game.log` lines 1261 to 1272: the Captain's two lines and Jace's two replies, the same text both times, are as quoted. No other NPC acted on "Then ask for a janitor". Tyson Jones's meeting began at 22:12:09 and Jace reported "I have no work to speak of yet".
- `crew_brain.log` lines 1003 and 1008: Jace's two decisions. Both prompts hold the refusal line and the "your body ... sends a janitor a PDA message when there is a mess" line, and offer only the look order for `work`. Neither lists a mess in "You can see". The second prompt's "What has been said lately" ends with the first reply, and the model gave it back word for word, with `"where": "nowhere you know"`.
- `pda.log`: no technician message to a janitor about the Cargo Bay after 21:57:41 up to the end at 22:14:51. Kailyn's later messages are all about the Mining Office and the Bitrunning Den.
- The code: `ORDERS` and `ORDER_SOUNDS` in `jobs/orders.ts` hold only `LOOK`, and `planOrders` handles nothing else. `workTold` and `takeToldWork` in `tasks.ts`. Only `jobs/janitor.ts:831` has `takes`. The refusal line at `cargo.ts:218`, the tidy loop at `cargo.ts:787`, the `roomsKeeper` test at `cargo.ts:1701`, and the line filter at `brain.ts:1508`. All quotes match; some line numbers had drifted and are corrected above.

I looked for what would make it wrong. There is no other path from speech to a janitor call: a tidy task comes only from `areaMesses`, and the told-work path has no kind that maps to one. The repeat filter's skip for replies is deliberate (the comment says so), but the round shows the cost, so it stays in.

I found two holes in the proposed fix and mended them above (steps 2 and 4). A call order in `ORDER_SOUNDS` alone would not have caught this case, because `workInWords` returns early when no room is named, and `takeToldWork` turns down "nowhere you know". And a call made on an order for a mess the NPC never saw would be wiped by the tidy loop, which deletes `janitorCalls[place]` when `areaMesses` has nothing there, so the janitor who came would not be let in. I also added that the NPC should not send a second call when its own note already holds one.

Not a duplicate. The near ones are as the finder lists them, plus `GAP-19` (faults handed on between jobs, engineering side) and `ASYNC-07` (the `saidBefore` filter, for remarks). None covers an order to send for a janitor, or repeated replies. Strictly the repeated reply is a second fault and could be its own finding; it is kept here because the round shows both together and the fixes do not touch each other.

Severity medium holds: the Captain's order is lost, but it is a less common ask and the room is not left for good. Effort medium holds: one new order with a step, two gates in `tasks.ts`, two prompt lines and the filter, all in the window code. Kept the regex as proposed, though `get` in it is loose ("I get that the janitors are busy" would match); the owner may want to drop `get`.

Not checked: whether Kailyn's call for the Cargo Bay cobweb was still open at 22:11, and anything in the simulator. Nothing was built or run.

## Fix so far

Done on branch `p-cargo` (window code only; table `tools/llm_crew/cargo-play.ts`; not played):

- Steps 1 to 3: a `CALL` order in `ORDERS` and `ORDER_SOUNDS` (`jobs/orders.ts`), tried before the look order. `takeToldWork` takes it with no room, or "nowhere you know", as the room the NPC stands in, and `workInWords` tries it when no room is named (`tasks.ts`, `orderTakesHere`). Both read it only from the clauses that are orders, so "don't call a janitor" sends for nobody. `planCall` sends one janitor the PDA message ("There is a mess in the X[: what]. Y has asked for a janitor. Could you come and clean it up, please?"), then tells whoever gave the order who was sent for, face to face or by PDA. No PDA, no janitor on it, or its own call for that room still standing: it says so and sends nothing (`callNeedless`). It is for any NPC, not cargo alone, and the rooms keeper test in `tidyStep` does not apply to it.
- Step 4, part: a cargo NPC records the call in `janitorCalls` only when it knows of a mess in that room (`areaMesses`), so that the tidy loop can strike it out again. For a mess it has not seen nothing is recorded, and `mayPass` still lets a janitor in only for a mess in `areaMesses`: a janitor sent on an order to a cargo room whose mess no technician has seen may be refused at the door. Left as found.
- Step 5: both prompt lines in `whenAsked` changed.

Not done, held: step 6 (the reply repeat check) is in `brain.ts`, which another group owns. The change: in the line filter, a reply whose words match, 0.9 or more, a line the NPC itself said in the last minute is not said as it stands (owner to choose: ask the model once more, then say nothing).

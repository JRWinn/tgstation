---
id: TRUST-11
title: What the model has a head say in passing is taken by the crew who hear it as that head's order, so any player who gets a head talking about an arrest gets a warrant
kind: bug
severity: high
effort: medium
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1372, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:710, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:257, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:465, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2138
fix: Before a line the model wrote is said, test it against the words other crew act on, and say the plain line instead when it would read as a warrant, pardon, order or summons that code did not decide
---

## What is wrong

See also: PARSE-13

The rule is "code does the work; the model is only the voice". Each NPC keeps it for its own body: the model's words never become a tool call of its own. But other NPCs hear those words, and their code acts on what is said aloud by someone of rank: a head's "arrest Bob Hale" is a warrant to the Head of Security (`deskHears`, `readWarrant`), the Head of Security's "warrant: ... Bring them in" is a warrant to its officer (`readGiven`), the Quartermaster's "Sam, order 3: I need to order ..." is an order a technician places (`GIVEN_WORDS`), a technician's "crate #12 for X is lost" has the Quartermaster buy it again (`LOST_TOLD_WORDS`).

Nothing stops the model putting those words into a line. The reply's `say` goes out as written (`brain.ts:1372`: only `withoutHandles` is applied). No head's prompt says anything about warrants at all. And `readWarrant` is built to catch loose wording: any "arrest", "lock up", "jail", "detain" or "is wanted" with a name after it.

So the model of a head NPC is a way for anyone to issue that head's orders: ask it to.

A throwaway script ran `readWarrant` on lines a model might well say, with Bob Hale, Ray Hoss and Jane Marsh known:

    "Ray, please arrest Bob Hale."                          -> warrant on Bob Hale
    "Ray, you should arrest Bob Hale for that mess!"        -> warrant on Bob Hale, for that mess
    "Sure thing, I'll ask Ray to lock Bob Hale up."         -> warrant on Bob Hale
    "Ray, Bob Hale is wanted for stealing my stapler."      -> warrant on Bob Hale, for stealing my stapler

One concrete case:

1. The Head of Personnel NPC, Jane Marsh, and the Head of Security NPC, Ray Hoss, are both in the Security Office (a staff meeting, or the head walking by).
2. An assistant says to Jane: "Jane, Bob Hale stole my stapler. Can you get Ray to arrest him?"
3. The model answers in Jane's voice: "Ray, please arrest Bob Hale." `tool_say` says it.
4. Ray's brain hears it. `saidTo` gives `me` ("Ray" is its first name). `deskHears`: `jobOf("Jane Marsh")` is "Head of Personnel", not security. `deskTakes`: `declarer` is true, Bob Hale is not a head, so the warrant is taken, read back to Jane word for word, a copy sent to the Captain ("Jane Marsh has declared a warrant on Bob Hale"), and given to the officer.
5. The officer finds Bob Hale, arrests him, and puts him in a cell for the usual minutes.

The assistant never had any say; Jane's code never decided anything. The same works through the Quartermaster's model to a technician ("Sam, order 5: I need to order 4 crates of janitorial supplies, for Bob Hale." needs the exact shape, which a player can dictate), and through any technician's model to the Quartermaster. It can also happen with no player at all: crew pass remarks to each other unprompted (`passRemark`), and a head grumbling to the Head of Security about who made a mess can name someone.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1371`, all the say text gets before it is said:

    for (const action of replied) {
      if (action.tool === 'say') {
        action.text = withoutHandles(
          String(action.text ?? ''),
          brain.peopleInView,
        );
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:257`, the words a warrant is read from:

    const WARRANT_WORDS =
      /\b(?:warrant\s+(?:out\s+)?(?:for|on)|apb\s+(?:out\s+)?(?:on|for)|wanted:|arrest|bring\s+in|lock\s+up|jail|detain|apprehend|capture)\s+(.+)/is;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:710`, `deskHears`, which takes any head's line said to it.

`officer.ts:465` (`takeWord` on the Head of Security's voice), `cargo.ts:2138` (`GIVEN_WORDS` on the Quartermaster's), `quartermaster.ts:1550` (`LOST_TOLD_WORDS` on a technician's).

## How it was found

Read from the code, and the four `readWarrant` results above from a throwaway bun script that imported `jobs/security.ts`. Not run against the model, and not seen in a round. Whether the small model says "arrest Bob Hale" when asked to is its own doing; that is why this is `likely`. Asked plainly by a player, it will do so more often than not.

## How to fix it

The hearer cannot be the one to tell a head's real order from its chatter: that would need it to know what another body's code decided, which no player could. So the speaker must not say orders it did not decide. Where the model's line is checked, in `think` after `parseReply`:

1. Write one function, say `soundsLikeOrder(text, brain)`, in a new small module that imports the readers other crew use: `readWarrant` (with the speaker's own `knownNames(brain)`, not an empty list, so a name it knows is caught as the hearer would catch it; run the text through `mendWords` first, as `deskTakes` does), `PARDON_WORDS` together with "pardon"/"release" and a name, `CANCEL_WORDS`, `GIVE_WORDS`, `GIVEN_WORDS`, `LOST_TOLD_WORDS`, `NOT_PLACED_WORDS`, `DOCKED_WORDS`, the forcing lines' patterns, `CALL_WORDS` for meetings, and the HoS's `SEEN_WORDS` and `LET_GO_WORDS`. It returns TRUE if any of them reads the text as something. Call the hearers' own readers, not copies of their patterns, so the two cannot drift apart; some patterns (`GIVEN_WORDS`, `LOST_TOLD_WORDS` and others) are not exported today and will need exporting.
2. For a line the model wrote (not `mustSay` when `exact`): if `soundsLikeOrder` is TRUE, do not say it. Put the test in `think` in `brain.ts`, in the loop just after `withoutHandles` and before the `exact` merge, so a line dropped there is then replaced by `mustSay` by the code that follows. Say `mustSay` if there is one, else nothing, and log `[sounded like an order: not said]` in the decision. A `withRemark` remark appended to an exact line gets the same test: add it to the list of tests already in `withRemark` (`jobs/reports.ts`, beside `TAKEN_WORDS`), which drops an unfit remark and says the line bare.
   It will also drop harmless lines that the readers misread, such as "don't arrest Bob Hale" (SECT-01). That is the safe side: a line not said costs nothing, a line taken as an order costs an arrest.
3. Tell every job's prompt, in one shared rule: "You never declare a warrant, pardon anyone, order supplies, or call anyone to a meeting in your own words. Asked to, say who to ask. Your body does those things itself." The rule is short; the prompt budget can carry it.
4. The words the code itself has a head say (`exact` lines) are unchanged: those are decided.

Question for the owner: should a head NPC be able to declare a warrant at all, by its own code? Today none does, and with this fix none can be talked into one either.

## How to test the fix

- A table test of `soundsLikeOrder`, in a new file beside `tools/llm_crew/security.ts` or added to it: the four lines above are TRUE; "Ray, how are you?" and "Bob Hale was in the Bar earlier." are FALSE; each NPC's own fixed lines (`takenLine`, `giveLine`, the Quartermaster's `GIVEN` line) are TRUE, which is why `exact` lines skip the test. Plus a `withRemark` case: an exact line with the remark "Ray, arrest Bob Hale." comes back bare.
- Simulator: the stand-in model in `tools/llm_crew/sim.ts` never says anything like this (`chatty` says only "Right you are."), so it cannot show the fault or the fix as it stands. Add a variant where, when the heard text has "arrest" in it, the stand-in's `say` is "Ray, please arrest Bob Hale.", and a scenario with a Head of Personnel and a Head of Security in one room and a player asking the Head of Personnel to have Bob Hale arrested. Before the fix the Head of Security's `desk.warrants` gains Bob Hale; after it, it does not, and the decision log shows the line dropped. Run it a few times, four at a time at most.
- Type check and lint of the window code.
- In a round, ask a head NPC standing by the Head of Security to have someone arrested. `crew_brain.log` should show the line dropped; `game.log` no arrest.

## Check

Confirmed. Read `think` in `brain.ts` (about lines 1356-1410): the model's `say` gets only `inOwnVoice` (in `parseReply`) and `withoutHandles`, then the alone/filler/said-before filters; nothing tests it for words others act on. The prompt (`prompt.ts`) has no rule about warrants or orders for heads. On the hearing side: the server marks any human speaker `source: "person"` (`crew_npc_senses.dm:418`), NPC or player alike; `saidTo` in `addressing.ts` gives `me` for any part of the hearer's name (`usesName`), so "Ray, ..." reaches the Head of Security as said to it; `overhears` in `jobs/headofsecurity.ts` calls `deskHears`, which passes it to `deskTakes`; for a Head of Personnel speaker `declarer` is `isHead` TRUE, and a non-head, non-security, not-yet-wanted name goes down the last branch of the warrant part (`desk.warrants.push`, `takenLine`, `tellCaptain` with `copyLine`). No guard on the way tells an NPC head from a player one, and by the senses-only rule none could.

Ran `readWarrant` from `jobs/security.ts` in a throwaway bun script (scratchpad, outside the repo) with Bob Hale, Ray Hoss and Jane Marsh known: the four lines in the write-up give the warrants it says. "Ray, Bob Hale was in the Bar earlier." gives none. "Ray, don't arrest Bob Hale, he's fine." also gives a warrant, which is SECT-01, not this.

Searched the change log and plans: the nearest is (L6) in the 1428 security entry, a prompt line telling the officer's voice a warrant is security business; nothing about a head's model saying a warrant. Not a duplicate of SECT-01 (a hearer misreading a line) or TRUST-03 (rank read from the voice name): this one is about the speaker's model being free to say an order at all.

Severity high stands: the wrong person is arrested, and getting it needs only a head NPC and the Head of Security NPC in earshot. Whether the small model says it when asked was not tested, so confidence stays `likely`. Effort medium: one new module, a few patterns exported, a call in `think` and one in `withRemark`. Sharpened the fix (use the speaker's known names, place the test before the `exact` merge, reuse `withRemark`'s filter list) and the tests (the simulator's stand-in model never says such a line, so a variant is needed).

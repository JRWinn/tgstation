# Crew NPC plan: security bugs from the round of 2026-11-18, 14:28

Written 2026-11-18 from the round logged at `data/logs/2026/11/18/round-14.28.06`: MetaStation, read live three times between 14:37 and 14:54, on commit `3c948542`. The round was still running when this was written, so it covers its first 25 minutes. It was the first round with a Head of Security and a security officer. The owner asked for the security bugs only, grouped by severity, with the easiest to fix first inside each group, and a proposed change logged with each. **No code.**

Items marked **Seen** are from the logs. Items marked **Cause** say how sure I am. Items marked **Proposed** are mine and are not approved.

## Status

**Partly built 2026-11-18, about 15:40,** on the owner's "the previous guy's work should be commited so lets go". **Type check, server compile on a side copy, the table of cases and the simulator only. Not played in a round.** The top entry of `LLM_CREW_CHANGELOG.md` for that time says what was built and where.

- **Built:** the logging for C1 (not its fix), H1, H2, H3, H4, H5, M1, M2, M3, L1, L2. For M4, only the voice being told it cannot follow.
- **Not built:** C1's fix (the cause is still not known), H6, H7, H8, M4, L3, L4, and the weapons hand-out below.

Earlier: the owner, 2026-11-18: "no code until I say".

## What worked

So that the bugs are read against it:

- The warrant, in the words the code knows, was answered in the same second.
- All three other heads were sent the notice and answered inside a second.
- The warrant and three sightings were passed to the officer by PDA.
- All three heads read the list out at their staff meetings.
- A head, and later two janitors who had heard the list read out, sent security a sighting. The second janitor's, for the same room, was not passed on twice.
- The officer said the arrest line, and the game logged "attempted to handcuff". A body with no player can apply cuffs.
- The officer, shut out of its meeting by fire doors, sent its report by PDA.

## The bugs, in short

| # | Bug | Fix expected |
|---|---|---|
| **Critical** | | |
| C1 | The officer never gets a baton | Unknown until it is logged |
| **High** | | |
| H1 | Security does not feel being hit; 22 runtime errors at spawn | Easy |
| H2 | The officer leaves the suspect for the lockers | Easy |
| H3 | A staff meeting pulls the officer off the suspect | Easy |
| H4 | Nobody is told the warrant cannot be served | Easy |
| H5 | The officer sees the suspect and keeps walking | Medium |
| H6 | It stands and takes the beating | Medium |
| H7 | Fire doors stop it, and the alarm is on the far side of them: ask engineering | Hard |
| H8 | It cannot get into the Bar, and "the bar" means the wrong room | Hard |
| **Medium** | | |
| M1 | Plain wordings are not warrants | Easy |
| M2 | A sighting with no warrant is dropped in silence | Easy |
| M3 | Nothing answers what was not understood | Easy |
| M4 | "Follow me" does nothing | Hard |
| **Low** | | |
| L1 | The log reads "no a baton" | Trivial |
| L2 | The officer greets the suspect with news of the warrant | Easy |
| L3 | It calls the Captain by the wrong name | Easy to try, not sure to work |
| L4 | The Head of Security calls on its officer twice | Not looked into |

## Critical: no arrest by force can happen

### C1. The officer never gets a baton

- **Seen:** thirteen trips to the Security Locker Room between 14:29 and 14:53, each ending "found no a baton", standing at five different spots in the room. Its brain was told "You find no a baton there."
- **Cause: not found.** That message means the locker step ran and came away with nothing. Nothing logs which step inside it failed. Read against the game's code, each step looks right: a locked locker is unlocked by one click and opened by the next, opening spills a full security belt, and the belt holds a loaded baton.
- **Proposed, in two steps:**
  1. Log every way out of the locker steps with its reason: still locked after the click, not open after the click, no belt with a charged baton on the tile, belt would not come to hand, baton would not come out of the belt. `kit_from_locker`, `kit_from_belt` in `crew_npc_security.dm`. Then play one round, or stand and watch the officer at a locker.
  2. Fix what the log shows.
- **Nothing else about an arrest can be judged until this is fixed.**
- **Step 1 is built.** The next round's `game.log` will have a line starting "at the security officer's locker at" for each trip that comes to nothing, saying which step it was.

**The armoury is not the cause.** The owner saw that the Armory is locked to security staff and asked whether that was it. Read from the map on 2026-11-18:

- The officers' batons are not in the armoury. Each is in a belt in an officer's own locker, and all six of those lockers are in the Security Locker Room, which opens to an officer's ID. The officer stood next to them thirteen times.
- The armoury holds guns, spare disablers, riot gear, flashes and tear gas. It has no batons. It opens to the Head of Security and the Warden, not to officers, and it has a counter of its own: a "Weapon Distribution" window and a "Requests Window".
- The Head of Security's own locker, in its office, also has a full belt with a baton.

**The owner's ideas for handing weapons out, 2026-11-18,** asked as "solutions if so". None is needed to explain C1, and none is built. They are kept because they fit how the armoury is meant to work, and because one of them would get round C1 if the lockers cannot be made to work:

- The officer asks for a weapon, and the Head of Security goes and gets it.
- At the first meeting the Head of Security asks who still needs a non-lethal weapon.
- After the meeting it tells them to wait and brings the weapon to them, or has them follow.
- **TODO, the owner's:** lethal weapons are handed out only in high-level situations. Later.

**Proposed,** mine, if the owner wants it built:

1. An officer with no baton says so at the staff meeting, as any staff say what they are short of: "Joan, I have nothing to show yet. I need a stun baton."
2. The Head of Security tells it to wait in the Security Office, fetches a baton, and hands it over. Handing something to someone is already built.
3. Where it fetches it from is the catch. Its own locker and the officers' lockers are opened the same way, which is the step that fails in C1. The armoury has disablers but no batons, and a disabler is a gun. So this does not get round C1 by itself: it needs C1's logging read first.
4. Lethal weapons stay in the armoury. Nothing hands them out.

## High: the system does the wrong thing

Easiest first.

### H1. Security does not feel being hit

- **Seen:** Pun Pun hit the officer ten times with a revolver between 14:40:56 and 14:41:08. Its brain was told of none of them. `runtime.log` has "Cannot execute null.get idcard()" 22 times, all at spawn, two for each of the eleven bodies.
- **Cause, read in the code:** listening for blows is started while the body is being attached, before the controller knows its body. Asking for the job then fails, the answer comes back "not security", and the listening is never started for anyone. `start_security_senses`, called from `start_senses` in `crew_npc_senses.dm`; `job_title` in `crew_npc_cargo.dm`.
- **Proposed:** read the job from the body that is handed in, not from the controller's own. One small change. It also clears the 22 runtime errors.
- **What it gives back:** the baton at once for someone who hits back, the five minutes for resisting, and stopping someone with no warrant who joins in. None of that can work now.

### H2. The officer leaves the suspect for the lockers

- **Seen:** at 14:41:57, 14:44:18 and 14:48 it walked from beside Pun Pun to the locker room and back, about a minute each time, for nothing.
- **Cause, read in the code:** being short of a baton is a job of its own, due again every two minutes, and nothing weighs it against having the suspect in sight. `wantsKit`, `syncBeat` in `jobs/arrests.ts`.
- **Proposed:** it does not go for its kit while someone it has a warrant on is in sight, or was seen in the last two minutes. After three trips with nothing it waits five minutes, not two. Mostly moot once C1 is fixed.

### H3. A staff meeting pulls the officer off the suspect

- **Seen:** at 14:45:36 the Head of Security called its ten-minute meeting. The officer, standing next to Pun Pun in the Bar Lounge, answered "On my way to the Security Office" and set off. It told the monkey so: "I am currently compelled to attend a staff meeting ... before proceeding with your arrest."
- **Cause, read in the code:** the Head of Security holds off a meeting for two minutes after a new warrant or a sighting, and the last sighting was three minutes old. It does not know its officer has the suspect in sight. And a call to a meeting is an order the officer drops its work for. `leadIsFresh` in `jobs/desk.ts`; `syncMeetings` in `jobs/meetings.ts`.
- **Proposed:**
  - The officer does not leave for a meeting while someone it has a warrant on is in sight, by the arm, or was seen by it in the last two minutes. It sends its report by PDA, as it already does when it cannot get to the room.
  - The Head of Security holds off its meeting for five minutes after a sighting, not two.

### H4. Nobody is told the warrant cannot be served

- **Seen:** the officer had no baton all round, and at 14:37:03 could not get into the Bar. The Head of Security heard neither, and nor did the Captain. The Captain learned of both only because the officer's voice happened to mention them to its face.
- **Cause, read in the code:** there is a word for it ("I cannot bring in Pun Pun: ...") and the Head of Security already passes that word to the Captain. Nothing ever sends it. `outcomeLine` in `jobs/security.ts`.
- **Proposed:** the officer tells the Head of Security, once for each reason:
  - after three trips for its kit with nothing: "Joan, I cannot bring in Pun Pun: I have no baton."
  - when the room they were last seen in is locked to it: "Joan, I cannot bring in Pun Pun: I cannot get into the Bar."

### H5. The officer sees the suspect and keeps walking

- **Seen:** at 14:40:11 Pun Pun came into its view, 7 tiles off, while it was walking to the Aft Primary Hallway. It finished that walk, went on to the next hallway, and only walked up to Pun Pun at 14:40:46, when it happened on it again.
- **Cause, read in the code, two parts:**
  - The walk of the hallways and the walk up to the suspect are steps of the same job. The driver drops a walk only for a different, more pressing job, so it takes the officer to be "already about it". `orderToDrop` in `driver.ts`; `serveStep` in `jobs/arrests.ts`.
  - The officer does not note where it saw them itself. Only word from others counts as a sighting.
- **Proposed:**
  - Seeing them with its own eyes is a sighting: the room and the time are noted while they are in view.
  - A walk to look for someone is dropped the moment they are in sight. This touches the driver, which every job shares, so it wants care.

### H6. It stands and takes the beating

- **Seen:** from 14:40:56 to 14:41:57 the officer stood beside Pun Pun. The cuffs had been refused, it had no baton, and it went from 100 health to 70 in twelve seconds. A Medibot later healed it to 90.
- **Cause, read in the code:** with nothing it can do, its job is "cannot go on yet", and a job that cannot go on leaves the body where it stands. Nothing moves it out of reach.
- **Proposed:** when it cannot make the arrest and the suspect is within two tiles, it steps back out of reach and keeps them in sight. It needs H1 to know it is being hit. If it is hit again it backs off further.
- **A correction:** the change log says nothing aboard heals security. A Medibot does.

### H7. Fire doors stop it, and the alarm is on the far side of them

**Corrected 2026-11-18.** The first draft said the officer never tried to reset the alarm and that the cause was not looked into. That was wrong, and the owner said so: resetting a pulled alarm was built on 2026-11-17, and it ran here.

- **Seen:** Pun Pun pulled a fire alarm in the Starboard Primary Hallway at 14:44:28. The officer, in the Bar Lounge, was stopped by the fire doors at 14:45:51. **It went to reset the alarm four times** (14:45:55, 14:46:19, 14:46:35, 14:47:04) and each time was told "You could not get to it." After that the alarm was left alone: "You cannot get to a fire alarm for Starboard Primary Hallway" (14:49:20). Two janitors tried five times between them, the same way. The doors were still shut at 14:53.
- **Cause, read in the code and the log:** the reset works as built. The alarm is inside the hallway that is sealed, and everyone who tried was on the other side of its fire doors. A body cannot open a fire door. This is the limit noted when the reset was built: only someone shut in with the alarm can reach it.
- This is not only security's. It is here because a wanted monkey shut security out by pulling an alarm, twice in this round.

**The owner's direction, 2026-11-18. No code until the owner says.**

- **Decided:** whoever is stopped asks engineering to open the door.
- **Decided:** the asking goes up the chain and back down. Staff tell their head, the head asks the Chief Engineer, the Chief Engineer sends its engineer, and word comes back the same way.
- **Decided:** the Captain is copied in.
- **Decided:** engineering shuts the door again if it is not safe.

**What the game gives us,** read from the code on 2026-11-18, not seen in a round:

- The engineer's belt has a crowbar. A body can already take a tool from its belt by a click.
- A crowbar on a shut fire door opens it and holds it open for as long as whoever holds the crowbar stands next to it. When they step away the door shuts again by itself, if the alarm is still on.
- A crowbar on an open fire door shuts it. So a door can be shut again by hand.
- A fire alarm is reset by a right click on the alarm on the wall. Anyone can. That opens every fire door of the room, and the doors go on watching the air: they shut again by themselves if it is hot or cold.
- So the player's way with a pulled alarm is: pry one door, step in, reset the alarm on the wall.
- The engineering PDAs have an alarm program that lists fire alarms by room. Not checked: whether it tells a pulled alarm from a real one.

**Proposed,** all mine, to fit that direction:

1. **Asking.** A body stopped by fire doors, that has tried the alarm and cannot get to it, tells its head, once for a room: "Joan, the fire doors are shut in the Starboard Primary Hallway and I cannot get to the alarm." A head that is stopped itself starts at the next step.
2. **Head to head.** The head sends the Chief Engineer a PDA message, and the Captain a copy: "Tania, the fire doors are shut in the Starboard Primary Hallway and my staff cannot get to the alarm. Could you have them opened, please?" The Chief Engineer answers "Noted: the fire doors in the Starboard Primary Hallway." Several heads asking about one room make one job.
3. **Down.** The Chief Engineer gives it to its engineer, to its face or by PDA: "Lauren, fire doors: the Starboard Primary Hallway. Open them if it is safe."
4. **Finding it.** The request names the room. The engineer walks for that room and is stopped at one of its fire doors, which is where it needs to be. The server already tells a stopped body which room's doors stopped it.
5. **Safe or not.** Struck out by the owner as cheating, and replaced: see the owner's answers below. As first written: the server already knows whether an alarm was pulled by hand or set off by the air, and the engineer would not pry a door on a real one. **As decided:** it pries the door once, steps in if it can, and resets the alarm on the wall. If the door shuts again by itself, the room is flagged unsafe and left alone.
6. **Back up.** The engineer tells the Chief Engineer which it was: "Tania, the fire doors in the Starboard Primary Hallway are open: someone had pulled the alarm." Or: "... are staying shut: the air in there is bad." The Chief Engineer tells each head that asked, and the Captain. Each head tells whoever of its staff was waiting.
7. **The engine comes first.** The engineer does not leave the engine half lit for a fire door.

**The owner's answers to those, 2026-11-18:**

- **Decided: the engineer does not know whether an alarm is real.** I had written that the server already knows whether an alarm was pulled by hand or set off by the air, and that the engineer would not pry a door on a real one. The owner: "thats cheating". Step 5 above is struck out by this.
- **Decided: the door shutting itself is the answer.** "engineering will open it once and flag it as unsafe / kind of the same code as if they could reach the switch". So the engineer pries the door once. If the door shuts again by itself, the air is bad: it flags the room unsafe, reports that up the chain, and leaves it alone, as a room is already left alone when a reset alarm comes straight back.
- **Decided:** a room whose alarm is pulled again straight away is left alone for ten minutes. "sounds fair".
- **Decided:** half a minute of messages before the engineer sets off is fine.
- **The Bar.** The owner: "I am pretty sure he could get there with a crowbar". Read from the code and the map: a crowbar opens a fire door, and an airlock with no power. The Bar's two doors are powered airlocks, and the game answers a crowbar on one with "The airlock's motors resist your efforts to force it!" But the owner is right that the Bar can be got into: it is fenced off from the Bar Lounge by nothing but a row of tables, and anyone can climb a table in two seconds. The Bar's fire alarm is on its east wall, inside. A body cannot climb a table yet. That is the work the Bar needs, not a crowbar, and it is H8's as well.

**A cheat already in the code, found while reading this.** The reset rule built on 2026-11-17 uses the same knowledge the owner has just ruled out: every body that is stopped by fire doors is told by the server whether the alarm was pulled by hand, for the whole room, and resets only one that was (`crew_npc_alarm_was_pulled` in `crew_npc_doors.dm`). The honest way is the owner's: reset it once, and if the doors shut again, leave the room alone. That half is already built. **Proposed:** drop the server's say-so and keep the half that is honest. Not built: it is the owner's to say.

**Limits to know about:**

- A room whose own doors are locked to engineering, such as the Bar, cannot be got into through its doors. See "The Bar" above.
- With no engineering staff aboard, the head tells the Captain and nothing more happens.
- If the alarm is pulled again straight away, the rule already agreed stands: that room is left alone for ten minutes.
- A body cannot use a crowbar on a door yet. That is new work for hands, of the kind done for the wrench.
- The asking is six messages before anyone moves. Worked out, not measured: about half a minute, then the engineer's walk.

### H8. It cannot get into the Bar, and "the bar" means the wrong room

- **Seen:** the Captain wrote "Pun Pun has been in the Bar". The officer set off for the room called Bar, and at 14:37:03 found no way in: "Doors of Bar: ... locked to it". Pun Pun does live there, behind the counter. The room the crew drink in is the Bar Lounge.
- **Cause, read in the code and the log:** a security ID does not open the Bar. A room the officer cannot get into is left alone, and nothing else is tried.
- **Proposed, in two parts:**
  1. **Go as near as it can.** When the room they were last seen in is locked to it, it goes to a room it can enter that the locked room opens onto, and looks from there. For "Bar" that is the Bar Lounge, across the counter. The server already knows which room each door opens from.
  2. **Getting in.** It knocks, and someone who works there lets it in, by the rules already built for locked rooms. With nobody working there, as in the Bar now, it has no way in. That is the hard part, and it is left for later.
- Part 1 would have found Pun Pun in this round. Part 2 is what a hiding suspect needs.

## Medium: the Captain could not work it

Easiest first.

### M1. Plain wordings are not warrants

- **Seen:** "I want to put out an APB on Pun Pun" (14:30:26) and "Pun Pun is wanted" (14:34:55) did nothing. Only "Warrant for Pun Pun, for wrecking the Custodial Closet." (14:36:11) worked.
- **Cause, read in the code:** a warrant is known by "warrant for", "warrant on", "arrest", "bring in" or "lock up". `WARRANT_WORDS` in `jobs/security.ts`.
- **Proposed:** add "APB on", "APB for", "put out an APB", "is wanted", "wanted:", "pick up" and "find and arrest". Each gets a case in `tools/llm_crew/security.ts`.

### M2. A sighting with no warrant is dropped in silence

- **Seen:** "Pun Pun is in the bar" (14:31:00), sent before any warrant, got no answer.
- **Cause, read in the code:** a sighting is only read for names on the list.
- **Proposed:** word of where someone is, from the Captain or a head, naming someone it knows of who is not on the list, is answered: "Captain, there is no warrant on Pun Pun. To declare one, say: Warrant for Pun Pun."

### M3. Nothing answers what was not understood

- **Seen:** the two messages in M1 produced no reply and no turn of the Head of Security's brain at all.
- **Cause, read in the code:** a PDA message that no reader takes is dropped.
- **Proposed:** a PDA message to the Head of Security from the Captain or a head that it could not read is answered, once a minute at most: "Captain, I did not follow that. To declare a warrant, say: Warrant for a name, for a reason. To pardon: Pardon a name."
- M1 makes this rarer. It is still wanted: the Captain should never be left guessing.

### M4. "Follow me" does nothing

- **Seen:** the Captain said "Follow me" to the officer twice (14:39:21, 14:39:33). It answered "Aye, sir. I shall follow you" both times and did not move.
- **Cause, read in the code:** the only order anyone can be given is to go and look at a room. The voice agreed to something the body has no way to do.
- **Proposed:** a new order, for anyone who answers to whoever gives it: follow them until told "stay" or "that will do", or for two minutes. Until it is built, the voice is told it cannot follow and says so.
- This is not only security's, and it is the largest item here.

## Low: cosmetic

### L1. The log reads "no a baton"

- **Proposed:** "found no baton". One word, in `take_kit`.

### L2. The officer greets the suspect with news of the warrant

- **Seen:** at 14:40:12, from across the hallway: "Good day to you, sir; I am Roswell Mccullough of Security, and I have a warrant for your arrest regarding the Custodial Closet."
- **Cause:** everyone is greeted the first time they are met, and the voice knows of the warrant.
- **Proposed:** security does not greet someone it has a warrant on. The arrest line is the first thing they hear.

### L3. It calls the Captain by the wrong name

- **Seen:** "Thank you, Zim" (14:39:12) and "Aye, sir. I shall follow you, Captain Minnie" (14:39:35). Minnie is the Head of Security.
- **Proposed:** the voice is told, each time the Captain speaks to it, that this is the Captain and is called "Captain". Easy to try. The local model may still get it wrong.

### L4. The Head of Security calls on its officer twice

- **Seen:** at 14:35:20 it said its call for a report, and at 14:35:25 the voice said it again in other words.
- **Not looked into.** It is how every head's meeting is held, not security's own.

## Order I would build in

1. C1's logging, H1 and L1 together: they are small, and the next round then shows why there is no baton and whether a hit is felt.
2. M1, M2, M3: the Captain can then work it without being told the words.
3. H2, H3, H4, L2.
4. C1's fix, once the log shows the cause.
5. H5, H6, then part 1 of H8.
6. M4, H7 and part 2 of H8, each as its own piece of work.

## Not in this plan

- Bugs in the round that are not security's.
- Laws, and reactions by personality: the owner has put both off.

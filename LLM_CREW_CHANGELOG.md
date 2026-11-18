# Crew NPC change log

**Claude: read the top entry before you touch crew code, and add an entry when you change it.**

This is the running record of what has changed in the LLM crew NPC work, newest first. The plans (`LLM_CREW_PLAN_*.md`) say what was meant. This says what was done, how far it was tested, and what is still wrong.

## How to add an entry

- Put it at the top, under this section. One entry for one sitting's work.
- Head it with the date, a short title, and the commit hash, or "not committed".
- Say how it was tested, in these words: **type check**, **server compile**, **simulator**, **model tests**, **played in a round**. Leave out what was not done. "Not played" is the usual truth: say it.
- List what changed as what the crew now does, with the file or function to look in.
- List what is known and not fixed. A fault found and left is worth more here than a fix.
- If a round showed the fault, name its log folder (`data/logs/YYYY/MM/DD/round-HH.MM.SS`).
- Do not rewrite old entries. If one turns out wrong, say so in the new entry.

---

## 2026-11-18, 15:40: security bugs from the first round with a Head of Security (the commit that added this entry)

**Tested:** type check, server compile to a side copy (0 errors, 0 warnings), the table of cases in `tools/llm_crew/security.ts` (84 cases), simulator: all 44 scenarios with a quiet LLM pass, the new `nobaton` among them, and the seven security scenarios with a chatty and a dead LLM pass as well: 58 runs, none failing. **Not played in a round. No model tests.** A round was running, so the normal build was not run: **the game has none of this until `BUILD.cmd` is run between rounds.** The simulator runs none of the server code, so the two server changes (the locker logging and security feeling a hit) are compile-checked only.

**Round that showed the bugs:** `data/logs/2026/11/18/round-14.28.06` (MetaStation, read live for its first 25 minutes, on `3c948542`). It was the first round with security staff.

**Plan:** `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`: seventeen bugs by severity, each with a proposed change, and the owner's decisions about fire doors and weapons. The numbers below are the plan's. The owner said "lets go" after "no code until I say".

### What the round showed working

The warrant was answered in the same second. All three other heads got the notice and answered. The warrant and three sightings reached the officer. All three heads read the list out. A head and two janitors sent sightings. The game logged "attempted to handcuff", so a body with no player can apply cuffs.

### What the crew does now

- **(C1, logging only) Every trip to a locker that comes to nothing says which step failed**, in `game.log`: "at the security officer's locker at (110,174): the locker is still locked after a click to unlock it", and the like, with what the open locker put on its tile. `log_kit_step`, `kit_from_locker`, `kit_from_belt` in `crew_npc_security.dm`. **The fault itself is not fixed: its cause is not known.**
- **(H1) Security feels being hit.** The job is read from the body that is handed in while the controller is being given it, not from the controller's own, which is not set yet. `start_security_senses`; `job_title`, `works_in_security` take the body. This also clears 22 runtime errors at spawn.
- **(H2) The officer does not go to the lockers while it is after someone**: in sight, by the arm, or seen by it in the last two minutes. After three trips with nothing it waits five minutes, not two. `onLead`, `wantsKit` in `jobs/arrests.ts`.
- **(H3) The officer does not leave for a staff meeting while it is after someone.** It sends its report by PDA and stays: "I cannot come to the meeting: I am after someone on a warrant. I have nothing to show yet. I need nothing." `keptFromMeeting` on the job (`jobs/job.ts`), read in `syncMeetings` and `planMeetings` (`jobs/meetings.ts`). The Head of Security takes that report by PDA, and holds off its meeting for five minutes after a sighting, not two. `leadIsFresh` in `jobs/desk.ts`.
- **(H4) An officer that cannot serve a warrant says why, once for each reason:** "Joan, I cannot bring in Pun Pun: no baton." or "... no way into the Bar." The Head of Security tells the Captain: "Captain, Hale cannot bring in Pun Pun: no baton." `syncBeat` in `jobs/arrests.ts`; `deskOutcome`.
- **(H5) Seeing someone it has a warrant on is a sighting.** The room and the time are noted while they are in view. And a walk to look for them is broken off the moment they are in sight. `dropsWalk` on the plan, honoured in `orderToDrop` (`driver.ts`), which every job shares: it applies only where a job sets it, and only to a walk.
- **(M1) More wordings declare a warrant:** "put out an APB on Pun Pun", "Pun Pun is wanted", "Dana Reyes is wanted for theft", "Wanted: Pun Pun". `WARRANT_WORDS`, `WANTED_AFTER` in `jobs/security.ts`.
- **(M2) A sighting of someone with no warrant on them is answered:** "Captain, there is no warrant on Pun Pun. To declare one, say: Warrant for Pun Pun." From the Captain or a head only.
- **(M3) A PDA message from the Captain or a head that security can make nothing of is answered,** once a minute at most: "Captain, I did not follow that. To declare a warrant, say: Warrant for a name, for a reason. To pardon: Pardon a name." `deskNotFollowed`.
- **(M4, voice only)** The officer and the Head of Security are told they cannot follow anyone, and to say so. There is still no follow order.
- **(L1)** The log and the brain read "no baton", not "no a baton".
- **(L2) Security does not greet someone it has a warrant on.** `isWarrantOn`, in `shouldWake` (`brain.ts`).

### Corrections to the entry of 14:15

- **"Nothing aboard heals security" is wrong.** A Medibot healed the officer from 70 to 90 in the round.
- **"The officer fetches a baton from a locker" did not happen.** It went thirteen times and came away with nothing.

### Short of the no-cheats rule

- **Found in older code, not changed:** a body stopped by fire doors is told by the server whether the alarm was pulled by hand, for the whole room, and resets only one that was. `crew_npc_alarm_was_pulled` in `crew_npc_doors.dm`. The owner ruled the same knowledge out for engineering on 2026-11-18 ("thats cheating"). The plan proposes dropping it. It is the owner's to say.

### Not built

- **C1's fix.** The cause is not known. The next round's log should say.
- **H6:** stepping back from someone it cannot arrest. **H7:** asking engineering to open fire doors, up the chain and back, as the owner laid it out. **H8:** getting into the Bar. **M4:** a follow order. **L3**, **L4**.
- **Handing weapons out,** the owner's ideas: in the plan under C1.

### Known and not fixed

- **The officer still cannot make an arrest by force.** With no baton it tries the cuffs once and then stands by the suspect. It now says so, and stays.
- An officer with no baton that is being hit still stands there.
- The officer told to follow will now say it cannot, if the model does as it is told.
- "Wanted: Pun Pun" is also how the notice to the heads begins. Only whoever keeps the list reads warrants, and it does not read its own notice, so nothing comes of that today.
- A message to the Head of Security from the Captain that is only talk now gets "I did not follow that".
- The new scenario's monkey sits still. The walk broken off when someone comes into sight (H5) has no scenario that walks it.

---

## 2026-11-18, 15:00: faults and alterations from the 13:32 round (the commit that added this entry)

**Tested:** type check, server compile to a side copy (0 errors, 0 warnings), simulator: all 42 scenarios with a quiet LLM pass, the six security ones among them, and `nested` and `qm` with a chatty LLM and `qm` and `crew` with a dead one pass. The change of mop and bucket for a rag was added after that run: type check, compile, and the twelve scenarios with janitors in them again, all passing. **Not played in a round. No model tests. No new simulator scenarios.** A round (`round-14.28.06`, on `3c948542`) was running while this was built, so the normal build was left until the owner had closed the server: it was run at 15:07 (0 errors, 0 warnings, the bundle rebuilt), and the next round has all of this and the security work of the entry below. The simulator runs none of the server code and knows nothing of marked squares, door scores, kinds of mess or the brain window, so everything in a `.dm` file below is compile-checked only. On the brain side the new paths (a knock from inside with nobody on record, a head passing on "I am shut in", a call that names only cobwebs, the shuttle called in for empties) have no scenario that walks them: the old scenarios show only that nothing they cover broke. The brain window's new section was never drawn: it is type-checked only.

**Round that showed the faults:** `data/logs/2026/11/18/round-13.32.16` (MetaStation, 50 minutes, on `a8578281`). It was the first round played with door names, a carried bucket and the fixes from the 12:23 round, and most of those were seen to work: see the plan.

**Plan:** `LLM_CREW_PLAN_ROUND_1332.md`. The numbers below are the ones in it, which are the ones the owner and I used while the round ran. The owner said "write it up and code all changes we talked about".

### Two of my fixes from the 13:30 entry were wrong

- **"One asking takes a visitor all the way out" sent a janitor back into the room it had been let out of.** The next door was asked for while it was still on the threshold of the first, and the nearest door of the outer room was the one it was coming out of. It walked back in and was shut in the Bitrunning Den for forty minutes. Mended below (2).
- **A room it had twice found no way into stayed "blocked" after a door was opened for it.** Not seen to do harm, but it is what the 13:30 entry built. Left as it is.

### What the crew does now

Doors and being shut in:

- **(2) Being let out, a door that only leads into another room that is locked to them is not chosen.** `room_door_for` in `crew_npc_doors.dm` scores such a door last. The next door is asked for four seconds after the first is opened, not at once (`after` on `doorAsked`, `NEXT_DOOR_DS` in `jobs/cargo.ts`).
- **(4) Letting someone out strikes only the note that they are inside.** The call that brought them stands while the mess is there. `noteLetOut` in `expected.ts`. A janitor that stepped out and came straight back had been told "nobody here sent for you".
- **(4) A janitor does not walk out of a room while there is work in it that it can get on with.** The owner: "what if they can no longer clean it?" It leaves when what is left is done or is beyond what it holds. `decide` in `driver.ts`, where it walks back out.
- **(3) A knock from inside a locked room is answered whether or not anyone is down as being in there.** The body finds who is standing at the door. `SOMEONE_INSIDE` in `jobs/cargo.ts`, `shut_in_at_door` in `crew_npc_doors.dm`. Failing the name it was given, a janitor standing outside at the door is taken for whoever knocked (`janitor_at_door`).
- **(3) A door opened to let one person out lets out anyone else who is shut in the room.** `hold_door_for`.
- **(3) Someone shut in writes to whoever's ID opens the door, by the card they wear.** `door_keepers` only looked for a card inside the PDA, found none, and nobody was ever written to but the head.
- **(3) A head told "I am shut in" by one of its staff passes it to the Captain by PDA**, once for each person and room in five minutes. `readsMessage` in `jobs/head.ts`.

Meetings and standing about:

- **(6) Nobody waits in a doorway or on the same tile as someone else.** Sharing a tile now counts as being in the way (`on_top_of_someone`), and a body steps clear at most twice in one room before it waits where it is (`mayStepInside` in `driver.ts`): a janitor had stepped aside eight times in three minutes.
- **(6) A member of staff in the meeting room who cannot see its head walks up to another of its own trade who is there.** `meetingStep` in `jobs/meetings.ts`. One had stood by the door of the Bar Lounge, out of its head's sight, and been put down as absent.

Cleaning:

- **(5) Each mess is cleaned with whatever the body holds that suits it**: the spray for what washes off, the rag for what wants scrubbing. `tool_for_mess`, `could_shift` in `crew_npc_cleaning.dm`.
- **(5) A mop does not scrub.** `can_clean_mess` knows that cobwebs, rubble, decomposing garbage and gooey grey mass stay when the floor is washed (`is_mopped`), and that a spray only washes. A janitor with a wet mop had scrubbed at a cobweb and said it wanted a wet mop.
- **(5) What a janitor says is left is true**: "What is left (cobweb and rubble) needs scrubbing with soap or a rag", or, where that is not it, "The rest would not come off with my mop". `whatIsLeft` in `jobs/janitor.ts`; the server sends the kinds (`beyond_kinds_here`).
- **(5) A technician passes on what a mess wants only if whoever tried it said so**, and a mess two janitors could not shift is left thirty minutes, not ten. `tidyStep`, `DECLINED_AGAIN_DS`.
- **(13) A janitor called to a mess that is all of the scrubbing kind, with no soap or rag in its hands, changes what it holds.** With a mop and a bucket it takes both back to where the cleaning gear is kept, puts them down there, and takes up a rag or soap: the rag it put in its bag to carry the bucket, or one it knows the whereabouts of. The owner: "put the mop and bucket back in the janitor area and grab a wet rag for cob webs". With a hand free it only takes the rag up. It declines by PDA only if it knows of nothing to scrub with. When that mess is seen to it goes back for the mop, as a janitor with only a rag does. `changeForScrubbing`, `scrubberToHand`, `kindsCalled`, `SCRUB_KINDS` in `jobs/janitor.ts`; `tool_put_down` now puts down the thing named; `tool_pick_up` takes a thing out of the body's own bag or pocket before it looks anywhere else (`crew_npc_hands.dm`). The brain is told what the body has put away (`stowed`).

Finding its way:

- **(11) Exploring skips a room whose every door is locked to the body.** `pick_somewhere_new` in `crew_npc_tools.dm`.
- **(7) "None of your work can be got on with" now says why**, in the log: what stands in the way of each job, up to four.

Cargo's floor (the owner's alterations):

- **(16) Crates are stood on the marked squares of the bay floor.** `crew_npc_marked_squares` finds them by the paint on the tile; `free_square`, `storage_spot` in `crew_npc_freight.dm`. With no square free, or a bay that has none, a crate goes where it went before.
- **(17) A crate loose in the bay, off the squares, is put on one.** `misplaced_crates`. Not one that is open, with its contents on the floor round it.
- **(15) An empty brought back to the lobby is taken into the bay**, and **the shuttle is called in for empties**: when three wait, or one has waited ten minutes. `CALL` in `jobs/freight.ts`; `tool_send_shuttle` calls it in when it is away.
- **(14) Only a crate that came in on the shuttle goes back when it is empty.** `crew_npc_came_by_shuttle`, set when a crate is seen aboard with something in it. The station's own crates were being sold with the rest.

The brain window (the owner's alteration 1, built by a second session and looked over by me):

- **Every NPC's name and job are shown in the colour of its ID card.** A head goes by its department's colour, not command's. `crew_npc_card_color` in the new `crew_brain_rooms.dm`; `colors.ts`.
- **A "Locked rooms" section** lists the rooms that are locked to the crew at large and that one of the owner's NPCs may go into, each room's name in its department's colour and the names of those allowed in plain text. The station's locked rooms are worked out once a round; who is allowed where every thirty seconds.
- Names that are too dark to read on the window are lightened in the window only.

Small:

- **(12)** A bucket fill is logged once.

### Not built

- **(18) Selling loose things left on the marked squares when the shuttle comes.** The owner: "a future TODO".
- **(15) An order nobody collects is not yet sent back.**
- **(12) Mess calls still go one message a room.**
- **(8) The crate dropped at the lobby door.** In the round a technician was standing at its post just inside that door, and the crate could not pass it. Nothing asks it to move until the haul has been given up.
- **(10) The Warehouse.** Its only airlock opens from the tunnel and the bay side is shutters, but why no route is found by way of the tunnel is still not known. It is now left fifteen minutes after two failures, which is all.
- **(9) "No way out" of the crowded closet at the start of a round.** Cause not confirmed.
- **(13) The change of tools is only made for a call that names nothing but the scrubbing kinds**, or one passed on as needing soap or a rag. A janitor that finds a cobweb in a room it is mopping for other reasons still reports it as left, and does not go for its rag.

### Known and not fixed

- **None of the server side has been seen in the game.** In particular: that the paint on a tile can be read from its overlays, which is how the squares are found (if it cannot, nothing changes: crates go where they went); that the shuttle comes when it is called in; that the right door is chosen when someone is let out.
- A crate on a marked square that is within a tile of a door would be moved again. The bay on MetaStation has no such square.
- A head with no Captain on its PDA does nothing about staff who are shut in.
- The brain window's "Where" line is not coloured, only the room names in the new section.

---

## 2026-11-18, 14:15: a Head of Security and a security officer, warrants, arrests and the brig (the commit that added this entry)

**Tested:** type check, server compile to a side copy (0 errors, 0 warnings), the table of cases in `tools/llm_crew/security.ts` (72 cases), simulator: the six new scenarios (`warrant`, `arresthead`, `pardon`, `fight`, `hurt`, `nohos`), each with a quiet, a chatty and a dead LLM, all 18 runs pass; the 37 older scenarios, run once each with a quiet LLM, 36 pass. The one that failed, `aside` ("asked to step aside ... 8s after being asked"), failed 1 run in 4 on this code and 2 in 4 on a clean copy of the last commit, so it is not from this work. **Not played in a round. No model tests.** A round was running while this was built, so the normal build was not run: **the game and the brain window have none of this until `BUILD.cmd` is run between rounds.** The simulator runs none of the server code. Every click with a baton, a pair of cuffs, a locker or a cell timer in this entry is compile-checked only. Treat all of the server side as unproven until a round shows it.

**Plan:** `LLM_CREW_PLAN_SECURITY.md`. Its section 3.0 says who does what and where this build departs from the plan. The owner settled its seven questions as suggested ("just go with your gut") and said to add the head as well as the officer.

**Why:** the owner wants a way, as Captain, to have someone arrested and put in the brig. The bar's monkey was the reason.

### What the crew does now

The security staff:

- **The test crew has a Head of Security and one security officer.** Eleven bodies now. `spawn_test_crew` in `crew_npc_spawn.dm`; both are in the "Spawn Crew NPC" list too.
- The officer's post is the Security Office. The Head of Security has its office, and knows the Security Office as where its staff work. Both know the way to the Brig. `learn_security_places` in `crew_npc_security.dm`.
- A baton, cuffs, a flash and a gun count as tools of security's trade, so a full hand does not drop them. `trade_tool_types`.

Declaring a warrant (`jobs/desk.ts`, words in `jobs/security.ts`):

- **The Captain or a head of department declares a warrant to the Head of Security**, by PDA or to its face: "Warrant for Pun Pun, for wrecking the Custodial Closet." Also "arrest", "bring in", "lock up", "put a warrant out on". A time may be said: "ten minutes". Code reads the name, the reason and the time. `readWarrant`, `deskTakes`.
- **It answers word for word:** "Captain, I have that: a warrant for Pun Pun, for wrecking the Custodial Closet. 5 minutes." With "I do not know that name yet" for a name on nobody's PDA and never seen.
- Five minutes unless a time was said, and never more than fifteen.
- **Who cannot:** anyone but the Captain or a head is told to take it to their head. Nobody declares one on the Captain or on security's own staff. Only the Captain declares one on a head. A second warrant on someone who has one is not taken.
- A warrant a head declares is copied to the Captain by PDA.
- A warrant names by every word of the name, in order. "Pun Pun" names "Pun Pun III" and not "Pun Punch". `sameName`.
- **With no Head of Security aboard, the officer keeps the list itself**, in the same code. With one aboard, a warrant brought to the officer is sent on: "Captain, warrants go to Joan, the Head of Security." `jobs/officer.ts`.

The notice and the meetings (`jobs/desk.ts`, `jobs/wanted.ts`, `jobs/head.ts`):

- **Each time the list changes, every other head is sent the whole of it by PDA:** "Security notice. Wanted: Pun Pun, for wrecking the Custodial Closet. If you or your staff see them, send me where, at once." A long list goes out as several messages. `noticeLines`, the `NOTICE` task.
- Each head answers "Security notice received." One that has not answered in a minute is sent it once more. After that the Captain is told which head it did not reach.
- A head there is a warrant on is sent nothing while it stands.
- **Every head reads the list out at its staff meeting**, after the reports and before its own business, word for word: "Security is looking for Pun Pun. If you see them, send security a PDA message saying where." At every meeting while anyone is wanted, and once, "Security is looking for nobody now", when nobody is. `wantedMeetingStep`, called from `meetStep` in `jobs/head.ts`.
- Staff who hear it keep the list. Staff who were not called on at the meeting are sent it by PDA. `wantedOverhears`, `wantedAbsent`.

Sightings (`jobs/wanted.ts`):

- **Anyone who holds the list and sees someone on it sends security a PDA message:** "Security: Pun Pun is in the Bar." Once for each person and room in two minutes. Not while security is in sight, not about itself, and not about someone already in cuffs. It puts down no work for it. `syncWanted`.
- The Captain, or anyone, can send the same in their own words: a message that names someone wanted and a room, with "is in", "saw", "seen" or the like.
- **The Head of Security passes the newest sighting to its officer:** "Hale, Pun Pun was seen in the Bar."

The officer (`jobs/officer.ts`, `jobs/arrests.ts`):

- **Its first job is its kit.** It goes to a security locker, opens it with its own ID, and takes a stun baton out of the belt inside. `get_kit`; `tool_get_kit`, `kit_from_locker` in `crew_npc_security.dm`.
- **The Head of Security gives it the warrant**, to its face or by PDA: "Hale, warrant: Pun Pun, for wrecking the Custodial Closet. Bring them in, 5 minutes." To its face, it answers "The warrant, right away."
- It goes to where they were last seen and looks for twenty seconds. A sighting over five minutes old is not walked to. With none to follow it walks the rooms called "Primary Hallway", one after the other, and waits a minute and a half between walks.
- **Seeing them, it walks up and says:** "Pun Pun, you are under arrest, for wrecking the Custodial Closet. Stand still." Then it puts the cuffs on, which takes four seconds.
- **Someone who stays put for the cuffs is not hit.** A crew NPC always does: its body is held still the moment the arrest begins. `being_arrested`.
- **Someone who will not stay put gets the baton on the next try:** twice, a third time if still standing, then the cuffs. `make_arrest`, `baton_hits`, `put_cuffs_on`.
- Three tries that come to nothing and it leaves them be for two minutes, and says where it lost them. The warrant stands.
- **With the cuffs on it takes them by the arm to the first empty cell**, sets the timer, walks them in, steps out and starts it. A crew NPC has the cuffs taken off first. Anyone else is left in them. `tool_jail`, `put_in_cell`.
- **It tells the Head of Security:** "Joan, Pun Pun is in Cell 1 for 5 minutes." Said is not told: to its face it waits for "Hale, I have that". Out on the station it sends it by PDA. The Head of Security tells the Captain and whoever declared the warrant, and the heads are sent the new list.
- The server counts arrests. The officer reports them at its staff meeting: "Joan, I have made 1 arrest. I need nothing." `work_arrests`; the new tally in `jobs/reports.ts`.

Fighting back (`securityFeels`, `syncBeat` in `jobs/arrests.ts`; `on_struck`, `on_grabbed`, `on_kit_gone` in `crew_npc_security.dm`):

- **Security staff are told who hits, shoves or takes hold of them, and who takes their baton.** Nobody else is.
- **Someone under a warrant who does any of that gets the baton at once, and five minutes more:** "Captain, Pun Pun is in Cell 1 for 10 minutes, 5 of them for resisting arrest."
- Someone with no warrant on them who does it is stopped with the baton and not arrested. The Captain is told who.
- **Under half its health the officer breaks off:** "Joan, I could not take Pun Pun. I am hurt." It uses no force again until told to. Someone who stays put for the cuffs it still arrests.
- **The Head of Security then serves the warrants itself:** it fetches a baton and goes after them. It tells the Captain. It does the same with no officer aboard. Otherwise it lays a hand on nobody.
- The Captain saying "try again" to the Head of Security sets both making arrests again.
- A prisoner in another's cuffs is left to whoever cuffed them. Found by the simulator: the hurt officer took hold of the Head of Security's prisoner.

Being arrested, for a crew NPC (`crew_npc_security.dm`):

- It stops, lets go of anything it is pulling, and stands still. It goes where it is taken. In the cell it can talk and do nothing else, until the cell's timer stops. It goes by the timer, not by a clock of its own. `custody_tick`.
- Left in cuffs with nobody to take them off, it works them off the way a player does.
- **Security do not question or put out anyone who is in a cell with its timer running.** `belongs_in_post` in `crew_npc_guarding.dm`.

Pardons (`deskTakes`, `strike` in `jobs/desk.ts`):

- **The Captain pardons:** "Pardon Pun Pun." Also "release", "free", "let go" with the name of someone there is something against. Only the Captain.
- It ends a warrant not yet served, an arrest under way, or time in a cell. The officer is told "Hale, Pun Pun is to be let go: the Captain has pardoned them", lets go or stops the cell's timer, and says "Joan, Pun Pun is free." `tool_free`, `set_free`.
- The Captain is answered "Captain, Pun Pun is pardoned." Whoever declared the warrant is told. The pardoned person is told if they are in sight.
- A head can take back a warrant of its own: "Cancel the warrant on Pun Pun."

Trespass (`wantedAfterActing`, `declareTrespass` in `jobs/wanted.ts`):

- **A body that tries to put someone out of its room and cannot tells its head:** "Quin, I could not put Pun Pun out of the Cargo Bay."
- **The head declares a warrant for trespass**, by PDA to security, in the words the Captain would use. Once in ten minutes for one person, and not while security is already looking for them.

The Head of Security's meeting (`jobs/headofsecurity.ts`):

- In the Security Office, called aloud, thirty seconds in and every ten minutes after, with every other head's steps. It closes with who is still wanted. The Captain is sent the same, and who is in the cells.
- It calls none within two minutes of a new warrant or a sighting.

### Short of the no-cheats rule

- **The cell timer is set by sending it what its window would send**, as the body, standing at it. The owner decided this for machine windows on 2026-11-18. `work_timer`.
- **Cuffs are taken off by taking the steps the strip window takes**, with its checks and its four seconds, since the game will not open that window for a body with no player. This is the same kind of stand-in. The owner has not been asked about this one. `take_cuffs_off`.
- A crew NPC left in cuffs resists by the game's own resist call, which is what the Resist button does.
- The few steps into a cell and out of it are taken a tile at a time by the body's own `Move`, not by the walk the rest of the crew code uses. `walk_steps`.

### Not built

- **Laws.** The reason on a warrant is whatever was said. The owner will write laws later.
- **Reactions by personality.** Every crew NPC goes quietly. The owner wants this later.
- A crew NPC that sees security lying still does not tell anyone.
- Nothing answers a sighting, and nothing new gets the officer into a locked room.
- The officer does not go back to a cell for its cuffs. It takes another pair from a locker.
- The records console, security glasses, the radio, and Officer Beepsky: plan section 5.
- The new lines have no cases in `tools/llm_crew/voice.ts`.

### Known and not fixed

- **None of the server side has been seen in the game.** In particular:
  - that a click from a body with no player swings a baton, puts cuffs on, unlocks and opens a locker, and takes a baton out of a belt;
  - that two baton hits hold a monkey still for the four seconds of the cuffs;
  - **that the officer gets out of the cell and starts the timer before a prisoner who can still walk follows it out.** This is the step I trust least. If the prisoner is out when the door shuts, the timer is stopped again and the arrest is tried again;
  - that the prisoner comes through the cell door behind the officer;
  - that the timer and the strip steps accept the body as their user;
  - that the cells are found: they are worked out from each timer's flasher, three tiles each on MetaStation, read from the map;
  - that the game tells the body when it is bitten or shoved.
- **Pun Pun will fight back, and may win.** Hit, it turns on whoever hit it 85 times in 100. It goes for a weapon, the officer's baton included, and it puts a downed target in a disposal unit. Nothing aboard heals security. Look for it in the first round.
- **Do not set a crew NPC to "Arrest" at a records console.** Officer Beepsky will cuff it and leave it. It will work the cuffs off, slowly.
- Staff learn of a warrant at their head's next meeting, up to ten minutes late, and learn it is over just as late. In the simulator two janitors sent word of the monkey after it had served its time. The Head of Security ignores word about someone not on its list.
- Each spotter sends its own message. Two janitors in one room send two.
- The Head of Security's first meeting is thirty seconds in. A warrant declared before that puts it off by two minutes.
- With the PDA down nothing reaches security, and the notice reaches no head.
- A sighting names the room. In a wide room the officer may look for twenty seconds and not see them.
- The officer walks only rooms with "Primary Hallway" in the name.
- A pardon said to the officer, with a Head of Security aboard, is sent on and not acted on.
- The Head of Security cannot open a cell its officer shut unless it can see the prisoner in it. It tells the officer.
- "free" and "release" are pardon words only with the name of someone wanted or held. "Pardon" always is.
- Trespass warrants can only start with staff who put people out of their rooms: cargo, engineering and now security. Janitors do not.
- The simulator's monkey is simple. It does not run from a baton or take one.

---

## 2026-11-18, 13:30: faults from the 12:23 round, door names, and water carried in a bucket (the commit that added this entry)

**Tested:** type check, server compile to a side copy (0 errors, 0 warnings), simulator: all 36 scenarios with a quiet LLM passed, and `nested` and `qm` with a chatty and a dead LLM. Three of those four passed. `nested` with a dead LLM failed "the cargo technician ends at the post", the check the entry below lists as flaky on the committed code. **Not played in a round. No model tests. No new simulator scenarios.** The full build was run at 13:31, after the round had ended (0 errors, 0 warnings, the bundle rebuilt), so the next round has all of this. The simulator runs none of the server code and knows nothing of buckets, door names or crates in doorways, so everything in a `.dm` file below is compile-checked only, and on the brain side the new paths (a door named, a bucket fetched and filled, the next door opened unasked, an order given again to the same technician) have no scenario that walks them. Lint still reports the folder's old formatting findings, in files this work did not touch as well.

**Round that showed the faults:** `data/logs/2026/11/18/round-12.23.07` (MetaStation, read live from 12:24 to 12:58, on `5df46541`). It was the first round in which the engine was lit and an order went from a staff meeting to an unpacked crate. There is no plan file for this work: the owner asked for a numbered list of the faults with a fix under each, and then "get started on all of them". The numbers below are the ones in that list.

### What the crew does now

Waiting at a door, and cargo's doors:

- **(1) A janitor that has knocked and sent word waits at that door**, for a minute, whatever other calls it has. `asked` on the plan from `letInStep` in `jobs/janitor.ts`, and `isAskedWait` in `workInOrder` (`tasks.ts`), which puts that wait ahead of everything but an emergency. Before, the wait ranked below every other call it could walk to, so with two calls it asked at each door in turn and was at neither when it was opened.
- **(9) A door is called by its name.** The server works out what each door of a room is called: the name on it, or, where that is only the room's name, where it opens from ("the Cargo Lobby door of the Cargo Bay"). `crew_npc_door_label` in `crew_npc_doors.dm`. A janitor says it in its PDA message and aloud ("I am at the Quartermaster Maintenance door of the Cargo Bay about the mess..."), a knock carries it, the technician says it back ("I am coming to the Quartermaster Maintenance door of the Cargo Bay") and opens that door. `doorCalled` and `doorNamed` in `jobs/janitor.ts`; `readsMessage` and the `DOOR` step in `jobs/cargo.ts`; `room_door_for`.
- **(9) Speech carries the door the speaker is standing at.** Anyone, a player too, who asks for a door while within two tiles of one is heard as asking for that one, by the name on it. This was the owner's idea. `near_door` in `on_pre_hear` (`crew_npc_senses.dm`); read where a door is asked for aloud in `jobs/cargo.ts`.
- The technician no longer goes by the door an NPC last meant to stand at unless it is a door of the room asked about and the NPC is still at it. `room_door_for`.
- **(8) One asking takes a visitor all the way out.** Let out of a room that lies inside another locked room, the next door is opened for them unasked, unless there is a mess in the outer room that they have not said is beyond them. `afterActing` in `jobs/cargo.ts`.
- **(19) Someone who sends word that they are at the door, asking to be let in, is not taken to be inside.** A door opened for a janitor who had walked off left them down as let in, and they were told "nobody here sent for you" when they came back. `mayPass`.
- **(4) Only the technician who has the rooms sends for janitors**, once the Quartermaster has divided the work. `tidyStep`. The other waits 45 seconds, not 15, before answering a door that is the keeper's (`KEEPER_WAIT_DS`).

Crates:

- **(17) A crate moved because it shut the body's way stays in the room or tunnel it lay in.** `clear_spot_for` in `crew_npc_grip.dm`. A stray crate from the tunnel had been hauled into the Custodial Closet.
- **(17) A crate square in front of a door shuts that door**, however much room there is beside it. `crew_npc_crate_shuts_way`.
- **(3) Only an airlock counts as a door the body's own ID opens.** Shutters did, having no access set. `crate_in_the_way`.
- **(6) A crate is only moved if it lies nearer to where the body was going than the body does.** `crate_in_the_way(heading_for)`.

Rooms and names:

- **(2) A room that goes by exactly the name asked for is the one meant**, visited or not. `find_known_place` in `crew_npc_tools.dm`.
- **(6) A room it has twice found no way into is left for fifteen minutes**, and a door being opened for it does not wipe that. `blocked_tries`, `is_blocked_place`, `ways_reopened`.

Cleaning and water:

- **(10) Giving up a kind of mess is counted per room.** `stubborn_kinds` in `clean_mess` is keyed by room and kind. This was my fault from the 12:00 entry: counted for the whole station, two failures anywhere meant one miss wrote off a room.
- **(7) Wetting is honest.** The mop is held to the sink a click at a time until it is full or no more comes. The `add_reagent` top-up is gone. `wet_mop` in `crew_npc_cleaning.dm`.
- **(7) A janitor with a mop goes for a bucket it knows of**, fills it at a water tank or a sink (20 units a click, 70 in all), carries it in its other hand, and wets the mop from it (5 units a click). A rag is put away to make the hand free. `held_bucket`, `fill_bucket`, `water_for_bucket`, `water_to_hand`; the `wantsBucket` and `bucketToFill` steps in `jobs/janitor.ts`; `free_a_hand`.
- **(7) A mop bucket or a janitorial cart with water in it, in sight, is used to wet the mop**: one right-click.
- **(16) A dry mop is not "only a rag".** `has_poor_tool`. A janitor holding a dry mop and a rag told its head it needed something better than a rag, and a second crate was ordered.

Orders and speech:

- **(15) An order given and not acknowledged is given again to the same technician.** `giveStep` in `jobs/quartermaster.ts`. The technician's "Order N, right away." is said at once, word for word (`exact`, `whileBusy`).
- **(12) "Crate N is out in the lobby for you" is kept 20 seconds**, not two minutes. `keepMs` on `toTell`.
- **(5) Only a person is answered.** Speech from an animal or a robot with no player behind it is marked `animal` and never wakes the LLM. `on_pre_hear` in `crew_npc_senses.dm`.

### Not built

- **(7) The cart is not pulled about.** A janitor uses a cart's water only where the cart stands, and does not fill one. Pulling it needs what crates have: taking hold again when it catches, and parking it clear of doors. The "my mop has run dry, I will be back" line and the door reopened without a second call (plan 4.3) are not built either. Being short of a bucket is not yet told to the head.
- **(8) A janitor does not yet finish all its calls inside a department before leaving it.**
- **(9) The call does not name the door to come to**, and the janitor still chooses its own: "Come to the Cargo Lobby" was answered at a tunnel door in the round.
- **(17) A head told "I am shut in" by one of its staff does nothing about it.**
- **(13)** Idle chatter: left for later, on the owner's word. **(14)** "placed by \*null\*": nothing to fix.

### Known and not fixed

- **None of the server side has been seen in the game.** In particular: that a held bucket can be clicked with the mop in the other hand; that a click on a water tank with a bucket fills it; that the right-click on a cart wets the mop; that an errand to the body's own tile ends at once; and that the door a label names is found.
- **(11)** A janitor went back to a room seven seconds after a clean failed there. Cause not found.
- **(18)** A crate was dropped five times at the Cargo Lobby shutters with someone standing beside it. Not looked into.
- A janitor swapped between two doors every three seconds for half a minute (12:34:13). Fix 1 should stop it once it has asked at one. Why two calls it has not yet asked about alternate is not known.
- A call to the Bitrunning Den, asked for at the Cargo Bay door, was refused. It looks as though the janitor and the technician do not agree on which room the Den is reached through. Not run down.
- A body shut in a small room by a crate in front of the door may still have nowhere to put it: the closet in the round had a cart, a tank and two crates in nine tiles.
- The Chief Engineer's coded lines and the parrot: Poly had learned them and was saying them back by the end. Nothing to do about that.
- With both hands taken by a mop and a bucket, anything that needs a free hand puts the bucket away or down first. It then goes for a bucket again. Not seen, but likely.

---

## 2026-11-18, 12:00: eleven faults from the 09:12 round (the commit that added this entry)

**Tested:** type check, server compile to a side copy (0 errors, 0 warnings), simulator: all 37 scenarios with a quiet LLM, and eight of them (`crew`, `qm`, `nested`, `office`, `vouch`, `qmbig`, `qmquiet`, `qmpaper`) with a chatty and a dead LLM. 54 of 56 runs passed. `nested` with a dead LLM failed "the cargo technician ends at the post", the check the entries below list as flaky: the committed code failed it in three runs of four here. `qm` with a chatty LLM failed "no janitor keeps walking at a room it cannot get into" once (four tries at the Cargo Bay where three are allowed), then passed three times out of three, as the committed code did. I did not run that one down. It may be mine: a janitor that drops a call now keeps the mess as its own, and the simulator, unlike the server, goes on listing a locked room as messy. **Not played in a round. No model tests. No new simulator scenarios.** The simulator runs none of the server code, so everything in a `.dm` file below is compile-checked only. On the brain side the new paths (a clean that fails, a meeting call not heard, the Captain's unclear answer, the Quartermaster's own crate by PDA, "I cannot shift it") have no scenario that walks them: the old scenarios show only that nothing they cover broke. The new wordings were checked against the lines from the round by a throwaway script (21 cases), which is not kept.

**Round that showed the faults:** `data/logs/2026/11/18/round-09.12.44` (MetaStation, 20 minutes, on `6b378160`).

**Plan:** `LLM_CREW_PLAN_ROUND_0912.md`. Its Status section says where what was built differs. The owner said "write in all your fixes" without answering the six choices in its section 7, so they were built as written there.

### What the crew does now

Janitors (the worst of it: three janitors walked between the same two rooms for most of the round):

- **A visit settles a room.** A mess the body cannot shift, or cannot get to, is passed over there and then, and it goes on to the next one it remembers in the room. It reports when eight are cleaned, twelve have failed, or none is left to try. `more_to_clean` in `crew_npc_cleaning.dm`, called from `finish_errand` in `crew_npc_hands.dm`.
- **Twice beaten by one kind of mess, it gives up that kind in that room** and does not scrub at each of the rest to find out. `clean_mess`, `stubborn_kinds`.
- **A clean that fails holds back the whole job for that room, walk and all**, for 20 seconds and longer each time. Before, only the scrubbing was held back, so the walk to the room was ready again the moment the body was anywhere else. `jobKey` in `driver.ts`.
- A body still scrubbing when its eight seconds are up is given eight more. A mess given up a moment before it came off was reported as beyond it, then as cleaned. `clean_mess`.
- **What would not come off with one thing is tried again with another.** The list of messes a body has given up on is cleared when the kind of thing it holds to clean with changes. Before, it was kept for good, so oil a rag would not shift was never tried with soap. `mind_what_it_holds`.

"I cannot shift it" (`jobs/janitor.ts`, `jobs/cargo.ts`):

- **Sending it ends the call on the janitor's side too.** The job is dropped, and the mess goes back on its list as its own, to wait until it holds something else. Before, it kept the call, came back to the door minutes later, and was told nobody had sent for it.
- **One line, true of the whole room.** With some of it cleaned: "I have done what I can in the Cargo Lobby. The rest needs soap or a wet mop." Not "cannot shift" and then "cleaned up".
- **A technician calls one more janitor and says what the mess wants**: "Lance could not shift it: it needs soap or a wet mop. Could you come and clean it up if you have one, please?" A janitor with neither sends back "I have no soap or wet mop either, so I cannot shift the mess in the Cargo Bay." and stays where it is. After two have said so the mess is left for ten minutes. `tidyStep`, `JANITORS_TRIED`.
- Word that a mess is beyond someone is never read as a call to it. `beyondRoom`.
- A mess another janitor only spoke of is not a call: nobody is owed word of it. `syncTasks` in `jobs/janitor.ts`.

The Captain's answer and the order book (`jobs/quartermaster.ts`):

- **With an order waiting on the Captain, something the Captain says or writes about an order that is no plain yes or no, and names no crate, is asked about**: "Zim, is that a yes or a no to order 2: 1 Janitorial Supplies Crate?" Aloud if it was said, by PDA if it was written, twice at most for one order. Before, it was taken for a new order and answered "I cannot order that". `askWhatWasMeant`.
- More words count as yes: "place it", "place that order", "put it through", "buy it", "get it", "go on".
- **An order that is no longer a big purchase goes ahead without the Captain.** Each time it looks at an order that is waiting, it works out again whether it still needs the Captain's say. If not, the book gets "No longer a big purchase: approved by me." and the Captain a PDA. `clearOrders`.
- An order held for no answer is named in every meeting report to the Captain: "Order 2 is still waiting on your say." `supplyReport`.

The Quartermaster's own crate:

- **A technician who cannot find the Quartermaster sends word of the Quartermaster's own order in the words it would have said**: "Bryan, order 1 has come in: crate #1779 (Bureaucracy Crate)." `arrived` in `jobs/cargo.ts`.
- **The Quartermaster reads that from a PDA as it does from speech**, and reads the line meant for whoever ordered the same way. Told that a crate of its own is still waiting, with nothing in its book about it coming in, it takes that as the word. Then it goes and opens it. `noteDocked`, `noteOwnCrate`.

Staff meetings called aloud (`jobs/head.ts`, `jobs/meetings.ts`; the Quartermaster's and the Chief Engineer's):

- **The head walks up to within four tiles of the nearest of its staff before it calls.** Those within six tiles when it calls are called. Anyone in sight but further off is walked up to and called again. Anyone out of sight is sent the PDA call the Head of Personnel uses. `meetStep`, `meetingSaid`.
- It walks up to someone standing well off before it calls on them for their report.
- **Staff called on by name for their report, by a head they answer to, give it, whether or not they heard the meeting called.** `meetingsOverhear`.
- The Quartermaster's report counts as there only those who reported, and with no report given says "No reports given." in place of "No crates in or out to count yet." `supplyReport`, `supplyClosing`.

Cargo's doors (`jobs/cargo.ts`):

- **Once the Quartermaster has divided the work, the doors go with the rooms.** Whoever has the rooms answers an ask said aloud, or a knock. The other leaves it, unless the first is out of sight and fifteen seconds have gone by. A PDA message is answered by whoever it was sent to. `doorIsMine`, `roomsKeeper`.
- The other technician's voice is told the door is not its to open, and not to say nobody sent for them.
- **Nobody is let out unasked until they have been in a room three minutes** with the mess gone. Asked, by a knock, a word or a PDA, they are let out at once, as before. `LEFT_INSIDE_DS`.

A crate in the way (`crew_npc_grip.dm`):

- **A body moves a crate from a doorway only if its own ID opens a door the crate lies by.** `crate_in_the_way`.

Things put in a hand (`crew_npc_hands.dm`, `crew_npc_senses.dm`):

- **The cause was Pun Pun, not the crew.** The game's monkey behaviour puts what it holds into the hand or pocket of whoever is near (`code/datums/ai/generic_behaviors/give.dm`; Pun Pun's chance is 30).
- **A body that finds something in its hand that it did not pick up puts it down**: on a table or rack it is standing by, by a click on it, or at its feet. It is told "You find a salt shaker in your hand that you did not pick up." A tool of its trade it keeps. So is anything one of the crew hands it. With its hands busy it waits. `on_item_in_hand`, `put_down_unasked_item`.

The log:

- **A walk the planner finds no route for writes a second line to `game.log`**: whether the game's other pathfinder finds a way, how each door of the room stands for that body, and the first thing in the way on the straight line there. For the Warehouse, which a technician twice found no way to. `log_no_route` in `crew_npc_tools.dm`.
- "found a X in its hand that it did not pick up" and "put down the X it had not picked up".

The voice:

- The Quartermaster is told who the Captain is by name, that the Captain's say is what a waiting order waits on, and never to send the Captain to their head of department. It is told when it has its order book. `cues` in `jobs/quartermaster.ts`.
- An order that is cleared or given is said to be "going ahead".
- A technician is told whose each held crate is, and that it holds none for anyone not named. `cues` in `jobs/cargo.ts`.
- An order given by number, and the yes-or-no question to the Captain, take no remark after them. `withRemark` in `jobs/reports.ts`.
- **Having answered a fellow NPC, a crew member does not answer them again for three minutes unless asked a question.** Two technicians at one post answered each other's "I am going to look in on..." all round. `hearSpeaker` in `brain.ts`.

### Where my fault list was wrong

- "Captain p3" was never said aloud. The brain log keeps the model's raw reply, and I read that. What was said was "Captain Zim": the handle was already put right before speaking. Nothing was changed for it.
- The Chinese character was in a reason given for a choice of job, not in speech. Nothing was changed for it.

### Not built

- **A knock is still answered by name.** The plan had the technician go to the door and open it to see who is there. The door tool is built round a named person from end to end (`tool_open_door`, `hold_door_for`), and holding a door is one of the cheats still to be taken out (`LLM_CREW_PLAN_NO_CHEATS.md`). Rewriting it blind seemed worse than leaving it. The two wrong-name knocks in the round both came from a janitor returning to a call it had already answered, which is mended above.
- "A walk once begun is finished" needed nothing: the driver already leaves a walk alone unless an emergency order comes.
- A thing put in a pocket is not noticed.
- Technicians still put any empty crate on the shuttle, the station's trash cart and freezer among them.
- No new simulator scenarios.

### Known and not fixed

- **None of the server side has been seen in the game.** In particular: that a click with the thing in hand puts it on a table; that the equip signal fires for what Pun Pun gives and not for something the body takes out of a locker in the middle of an errand; that going on to the next mess from inside `finish_errand` behaves; that `do_afters` is still set while a mop is at work.
- The Warehouse fault has no cause yet. The new log line should give one.
- The Captain saying anything with "order", "crate", "supplies", "budget" or "credits" in it while an order waits is asked "is that a yes or a no", twice at most. "How are the crates?" will get that question.
- "It needs soap or a wet mop" is still what a janitor says of any mess it could not shift, whatever the real reason. A janitor holding a mop is taken to have what is wanted, though a wet mop failed on something in the round.
- A technician called by PDA to a meeting that was called aloud sends "On my way", and if it misses the meeting sends its report by PDA. The Quartermaster does not read either.
- A janitor let into a locked room and finished there now has to find it is shut in before it asks out: one failed walk, then the door. Before, the door was opened for it unasked.
- With the technician who has the rooms in sight but busy, the other does not answer a door at all.
- A line that only looks like a question ("is it?") still gets an answer between two NPCs.
- Who a line is spoken to. The Captain, two tiles from the Quartermaster, was heard by a technician seven tiles away as speaking to her. Not looked into.

---

## 2026-11-18, 11:00: a Chief Engineer and a station engineer who light the engine (the commit that added this entry)

**Tested:** type check, server compile (0 errors, 0 warnings), the table of cases in `tools/llm_crew/engine.ts` (86 cases), simulator (the five new scenarios, each in quiet, chatty and dead modes: all 15 runs pass; of the 32 older scenarios, run once each in quiet mode, the first nine had passed when this was committed and the rest were still running). **Not played in a round. No model tests.** The simulator runs none of the server code and its crystal is a toy. Every click on a real machine in this entry is compile-checked only. Treat all of the server side as unproven until a round shows it.

**Plan:** `LLM_CREW_PLAN_ENGINEERING.md`. Its six questions were settled by the owner on 2026-11-18, all as suggested. This is its stage 1.

**Why:** nothing on MetaStation makes power at round start, the batteries last about nine minutes at full draw, and rounds go dark at about fifteen. No crew NPC ran the engine.

### What the crew does now

The engineering staff:

- **The test crew has a Chief Engineer and one station engineer.** Nine bodies now. `spawn_test_crew` in `crew_npc_spawn.dm`; both are in the "Spawn Crew NPC" list too.
- The engineer's post is Engineering. The Chief Engineer has its office, and knows Engineering as where its staff work. Both know the way to the engine room. `learn_engineering_places` in `crew_npc_engineering.dm`.
- Neither looks in on the engine room or the chamber on a quiet round of its department. It is no place to stand about once the engine is lit.
- The engineer's tools count as tools of its trade, so a full hand does not drop its wrench. `trade_tool_types` in `crew_npc_inventory.dm`.

The meeting and the order:

- **The Chief Engineer holds a staff meeting in Engineering, called aloud, thirty seconds in and every ten minutes after.** It is one more `MeetingWay`, like the Quartermaster's. `ENGINE_WAY` in `jobs/chiefengineer.ts`.
- **At the first one it gives the engineer the engine, to its face, word for word:** "Sam, the engine is yours. Light it now, please." The engineer answers "The engine, right away." With no answer in a minute the order is given again. `lightStep` in `jobs/chiefengineer.ts`; `takeWord` in `jobs/engineer.ts`; the words are in `jobs/engineering.ts`.
- **With no word from anyone two minutes in, the engineer starts by itself.** `syncTasks` in `jobs/engineer.ts`.

Lighting the engine:

- **The engineer works down a list of 21 steps on 16 machines, the three emitters last.** The list is data, for MetaStation's engine room only: `METASTATION` in `jobs/engine.ts`. It was traced from the map's pipes. The wiki's steps leave the loop broken on this map, at the filter with nothing set and at Mix Bypass.
- **An emitter is never the next step while any other step is undone**, whatever order a list is written in. `nextLightingStep` in `jobs/engine.ts`.
- A step that does not take is tried once more. Then the job stops, the emitters are not touched, and the Chief Engineer is told which step: "Ada, I cannot light the engine: the nitrogen canister will not connect." The Chief Engineer tells the Captain by PDA.
- An engine room whose machines do not match a list is not lit: "I do not know this engine."
- When it is lit the engineer tells the Chief Engineer and goes back to its post.

Working a machine (`crew_npc_machines.dm`, all new):

- **One new tool, `work_machine`.** The body walks to the machine, stands next to it, and does what a player does. `tool_work_machine`, `work_machine`.
- A pump or filter is turned on or off by the ctrl-click, and a pump set to full by the alt-click. An emitter is switched by a click with an empty hand. `click_as_body`, `turn_machine`, `set_pump_full`, `switch_emitter`.
- **A canister is wrenched onto its connector with the body's own wrench.** The wrench comes out of the belt by a click, is used by a click, and goes back by a click. `connect_canister`.
- Each of them looks first, and does nothing to a machine that is already as asked.
- Each machine set is counted. The engineer reports the count at its staff meeting: "Ada, that is 21 machines set. I need nothing." `work_machines_set`; the new tally in `jobs/reports.ts`.
- Engineering staff are told the engine room's machines by name, and how each is set only while it is in view. `crew_npc_engine_machines`, `engineering_state`.

The batteries and the watch:

- **The Chief Engineer sets the three batteries itself**, straight after the first meeting: input to full, output to 190 kW. It works nothing in the engine room. `charge_battery`; the `BATTERIES` task in `jobs/chiefengineer.ts`.
- **It knows the engine only from the engine monitor on its PDA**, and that needs the station's network. `engine_reading` in `crew_npc_engineering.dm`.
- **Integrity under 95 percent: "Sam, the engine is losing integrity. Emitters off, now."** Said to the engineer's face if it is in sight, sent by PDA if not. It is an emergency task: the engineer drops what it is doing. The Captain is told by PDA when the order is given and again when the emitters are off. The engine is not lit again unless someone the Chief Engineer answers to says "light the engine".
- A sound crystal with no energy in it, two minutes or more after it was lit, means the emitters have stopped. The engineer is sent to switch them on again, at most once in five minutes.
- **Said is not told.** What the engineer tells the Chief Engineer is not passed on until it hears "Sam, I have that." After 25 seconds it walks up and says it again. After two tries, or twenty seconds at its post with the Chief Engineer not in sight, it goes by PDA. `tellChief` in `jobs/engineer.ts`.
- Each meeting closes with the engine's state and reading, and the Captain is sent the same.

### Short of the no-cheats rule

- **The batteries and the engine air alarm are set through the machine's own handler, not through a window.** The game will not open a window for a body with no player. The body stands at the machine and the reach, power and lock checks are made first. The owner decided this on 2026-11-18: "Send what the window would send." `work_window` in `crew_npc_machines.dm`.

### Known and not fixed

- **None of the server side has been seen in the game.** In particular:
  - that a body with no player can make the ctrl-click and alt-click;
  - that the walk finds a place to stand for "Gas to Chamber" and "Gas to Filter", which can only be reached from one tile between the two chamber doors;
  - that a click takes the wrench out of the belt and a click puts it back;
  - that the window stand-in is accepted by the battery's and the air alarm's handlers;
  - that the PDA gives a reading at all. If it never does, the Chief Engineer never orders the emitters off;
  - that the emitters' beams reach the crystal. That is worked out from the map's reflectors, not seen.
- **Radiation.** The engineer goes in as dressed, before the engine is lit, and stays out after. The emitters-off order sends it back into a lit engine room. The owner decided this for stage 1. Look for radiation in the round's log.
- **The engineer now has a post behind locked doors, so the locked-room rules apply to Engineering.** It may question, or put out, someone with no engineering access that it finds there, and that could take it off the engine in the first minutes. Not tried in the simulator.
- With no engineer aboard nothing lights the engine. The Chief Engineer does not do it itself.
- The Chief Engineer does not go to the engine room to see for itself. With the power gone it has no reading and knows nothing.
- 95 percent, "no energy" and the two-minute wait are my numbers. What a healthy lit crystal reads on this code has not been looked at.
- Only MetaStation has a list. On any other map the engineer says it does not know the engine.
- The list is tied to the names on the map. A pump renamed there breaks it, and the engineer then says it does not know the engine.
- The new lines have no cases in `tools/llm_crew/voice.ts`.
- The engineer does not knock at the Chief Engineer's office door. It sends word by PDA.

---

## 2026-11-18, 09:40: the mail chute again, a janitor left shut in, and a door nobody could reach (the commit that added this entry)

**Tested:** type check, server compile (0 errors, 0 warnings), simulator (all 32 scenarios; `aside` failed once on "steps aside within a few seconds" and passed five times out of five when run again; it failed one run in five on the code before this change). **Not played in a round.** Built at 09:37, after the round that was running had ended. The simulator runs none of the server code. Three of the five fixes here are server code and mend fixes of mine that compiled and passed the simulator last time and did not work in the game. Treat them as unproven until a round shows them.

**Round that showed the faults:** `data/logs/2026/11/18/round-08.26.02`, the first round on `6e249e9e`.

### What that round showed about `6e249e9e`

Worked: the order chain. Order to unpacked crate in five and a half minutes; "Lance, I have that." three seconds after the technician spoke; one janitor sent for the crate; every door opened once; no janitor walking at the lobby airlock.

Did not work:

- **The mail chute fix never ran.** It listened for the body having moved. The base AI controller listens for the same thing on the same body and registers after, so it took the place of mine. Seven "movable_moved overridden" runtimes at spawn said so. The Quartermaster went down the chute twice.
- A new runtime from the locked-room check when the body was inside the pipes.
- Coming out of the pipes was logged as "came out of the Service Deliveries".

### What the crew does now

Slippery floors, by sight (`crew_npc_senses.dm`):

- **A body knows of a slippery thing only if it has seen it.** Oil, a peel, soap, foam: things that lie on a tile and can be seen. It keeps each one it sees in mind, and also knows of one on the tile in front of it if that tile can be seen. `remember_slippery`, `knows_slippery`, `slippery_seen`.
- **A floor that is only wet from a mop it does not know of**, and slips on like anyone, unless its shoes grip. The owner decided this. (The game does draw a faint sheen on a wet tile. The crew ignore it.)
- For a step onto a tile it knows is slippery it slows to a walk first: the step begun at a run is not taken, and the next one is, at a walk. It runs again on the step after. `mind_its_step`, now on the before-move signal, which nothing else of the controller's listens for.
- A bin, a chute, a pipe or what carries a body along one all count as the disposal pipes, for the line said on coming out. `look_around`.
- Whether a room is locked to a body is not worked out while it is off the floor. `locked_out_of` in `crew_npc_guarding.dm`, `place_locked_to_body` in `crew_npc_cleaning.dm`, `crew_npc_doors_of` in `crew_npc_doors.dm`.

Someone shut in (`driver.ts`, `jobs/cargo.ts`, `expected.ts`):

- **Shut in, a body goes to the door out even if it is already standing at a door.** Standing at one it had asked to be let in at is not standing at the way out. In the round the janitor knocked where it stood, and the technicians heard "knocking at the door of Cargo Bay, from outside", which they only answer for someone they sent for. Now its knock is at the door it came in by and says "from inside". `nextStep` in `driver.ts`.
- **A technician seeing someone "somewhere else" strikes them from that one room, not from every room.** In the round a door of the Cargo Bay was opened for a janitor who stayed in the Delivery Office. He was put down as in both, then seen in the Delivery Office and struck from both, and nobody knew to let him out. `noteLetOut` in `expected.ts`, `syncTasks` in `jobs/cargo.ts`.
- Seen standing in another of its locked rooms than the one it had them down for, a technician notes that room.
- **A PDA message that says "let me out" and names one of cargo's locked rooms is gone by**, with no note of the sender having been let in. The technician goes to that door. The server opens it only if the sender is found standing inside. `doorSought` in `jobs/cargo.ts`.

Finding a door (`tool_go_to_door` in `crew_npc_doors.dm`):

- **A body making for the door into a room tries each door for a way to it, best first, three at most.** In the round every janitor called to the Delivery Office made for the door that opens from the Security Post, which none of them can reach: 11 failed walks. A door that opens from a room locked to it is still reported as before, so that it asks at that room first. Each door passed over is logged: "found no way to X, a door into Y, and looks for another".

### Known and not fixed

- **None of this has been seen in the game.** In particular: that the before-move listener fires for a crew body's steps and that refusing one step does not stall its walk; that `oview(1)` leaves out a tile that is too dark to see; that the door tool, which now waits while routes are tested, behaves when it is called again meanwhile (it returns without a word, as exploring does).
- A body being walked out by the arm that is pulled at oil it knows of refuses one step like any other. Whoever has it by the arm may lose their grip.
- A knock from inside a locked room, by someone the department has no note of and cannot see, still opens nothing: a knock does not say who, and the door tool needs a name. The PDA message that follows the knock does.
- The door tool finds a person it cannot see by name, and reads which door another crew body wants straight from that body. Both are knowledge a technician would not have. Not changed.
- Every door opened for someone is still opened by code and held by switching off its closing (item 8 of `LLM_CREW_PLAN_NO_CHEATS.md`). The hold shared between two people in `6e249e9e` is built on that and goes when it does.
- Freeing a hand (`free_a_hand`, `6e249e9e`) was not exercised in the round. It puts the thing in the bag by a direct call, not a click on the bag.
- No janitor has soap or a wet mop. The oil in the Cargo Bay and the Delivery Office is called for and never cleaned.
- Pun Pun gets into locked rooms and gets away from whoever tries to walk it out. **That is wanted.** Do not fix it.
- No simulator scenario covers a body that is shut in while standing at an inner door, or a record struck from two rooms. The simulator's own door and knock are simpler than the game's.

---

## 2026-11-18, 09:20: crates that get away, and crates in the way (the commit that added `crew_npc_grip.dm`)

**Tested:** type check, server compile (0 errors, 0 warnings), simulator: all 30 scenarios with a quiet LLM, and the ten cargo and Quartermaster ones with a chatty and a dead LLM. 49 of 50 runs passed. The one that failed, `qmwait` on "the cargo technician ends at the post", passed four times out of four when run again, and failed once in four on the code before this change: the technician is on its five-minute round when the run stops. **Not played in a round.** The simulator does not run the server code and has no crates that move. Everything a crate does here (getting away, being taken up again, being pulled or pushed clear) is compile-checked only and has never been seen to work.

**Round that showed the fault:** `data/logs/2026/11/18/round-00.56.30`. Two crates were dropped at the dock within 12 seconds, and both technicians were shut aboard the supply shuttle for five minutes. Lost grips are in every logged round, and not only at the dock: `round-01.53.17` had three.

**Plan:** `LLM_CREW_PLAN_DROPPED_CRATES.md`. Its Status section lists where what was built differs from what was planned.

### What the crew does now

A crate that gets away (`code/modules/llm_crew/crew_npc_grip.dm`, new; called from `walk_finished` in `crew_npc_tools.dm`):

- **A body that loses its grip goes back and takes hold again.** Three times for one haul; the fourth time the crate gets away, the haul is given up. This holds for every kind of haul: off the shuttle, empties aboard, out to the lobby, a collected crate, an empty taken back, and a crate being moved from a door. `crate_got_away`, `go_back_for`, `take_up`.
- If someone was standing in the way, it takes hold first, is told who (so it asks them to step aside, as before), and waits three seconds before setting off. `wait_for_way`.
- The brain is told "You lost your grip on the crate. You are going back to take hold of it again." as a plain event. The LLM is not woken, and the brain window is told the body is busy throughout. `seeing_to_crate`, read in `crew_brain_link.dm`.
- **A crate that will not come is not walked away from.** It is put on the nearest spot clear of doors on the body's own side of it, by pulling. If there is nowhere in sight, the body goes straight back the way it came. `put_clear`, `clear_spot_for`, `haul_clear`.
- **If pulling fails it is pushed**, by walking into it, across open floor only and six tiles at most. `push_direction`, `push_clear`.
- The haul is then reported as failed, with where the crate was left: "You have left it in Supply Shuttle, clear of the doors." `put_clear_finished`, `gave_up_report`.
- A haul that ends with no way through counts towards the body knowing it is shut in, as a failed walk already did. `finish_haul`.

A crate in the way:

- **Anyone whose walk ends with no way through looks for a loose crate jammed in a doorway**: on a door's own tile, or beside a door in a passage one tile wide. It has to see the crate, or the door it lies by. It moves the crate clear as above and then takes up its walk, or its own haul, again. Once a minute at most. `clear_the_way`, `crate_in_the_way`, `crew_npc_crate_shuts_way`.
- An empty crate lying by a door aboard the docked shuttle now counts as a crate left by a door, and is moved to the middle of the deck. Before, it counted as sent back and nobody touched it. `misplaced_crates` and `haul_freight` in `crew_npc_freight.dm`.

The log. All in `game.log`, as "Crew NPC ... ":

- "lost its grip on the X (tool). The crate was left at ...; the body was at .... Next to the crate: ...".
- "is going back to take up the X again: try N of 3".
- "has given up hauling the X (tool: reason) and is putting it clear of the doors. It lies at ...".
- "put the X clear of the doors at ..., by pulling it" or "by pushing it", or "could not get the X clear of the doors".
- "found no way to PLACE (tool) and is moving the X clear: it lies at ..., shutting a doorway".

The Quartermaster is the guide (`jobs/cargo.ts`, `jobs/quartermaster.ts`, the words in `jobs/supply.ts`):

- A technician who gave a haul up tells the Quartermaster, the way other word is passed: "Ada, I could not get crate #4521 off the shuttle. It is in the Supply Shuttle, clear of the doors." It tells of one crate once in five minutes. `syncWontCome` and `wontComeStep` in `jobs/cargo.ts`; `gaveUp` is set in `ingest` in `brain.ts`.
- The Quartermaster answers "I have that", walks up to another technician and says: "Cora, crate #4521 is in the Supply Shuttle and Vik could not get it off the shuttle. See to it, please." With only one technician it says "Vik, try crate #4521 again in a little while, please." `crateHeldUp` and `sendStep` in `jobs/quartermaster.ts`.
- Whoever is told "See to it, please." has the shuttle and the rooms as well as their own part of the work for five minutes. `leftTo` in `jobs/cargo.ts`.
- Told of the same crate a second time, the Quartermaster sends whoever ordered it a PDA message that it is held up.
- A technician's PDA message to the Quartermaster that it is shut in has the Quartermaster send another technician the same way. `readsMessage` in `jobs/quartermaster.ts`.
- A technician's voice is told when it has given a crate up, where the crate is, and not to say it is on its way. `cues` in `jobs/cargo.ts`.

### Known and not fixed

- **Nothing here has been seen in the game.** In particular: that a crew body walking into a crate pushes it (read from `PushAM` in `living.dm`), that setting off for the crate again from inside `walk_finished` behaves (it is done 0.2 seconds later, by a timer), and that the spot picked to put a crate clear is one the body can walk to.
- A crate lying between two shut doors, with the body on the far side of both, is not found: the body sees neither the crate nor the door it lies by.
- With two doorways jammed at once, the second is cleared a minute after the first, on the next walk that fails.
- Any crew body will move a crate out of a doorway when its walk fails near one, even if a locked door was the real reason. The crate has to be on a door tile or in a one-tile passage by a door, so this should be rare. Not seen either way.
- Whether a technician shut aboard the shuttle ever sends "I am shut in" is not known. That path (`drive` in `driver.ts`) was written for locked doors and first goes to stand at a door.
- With no other technician to send, the Quartermaster does not go itself.
- The Quartermaster's "try it again" changes nothing in whoever hears it. They try again by themselves after the usual wait.
- A crate that would not come is not written in the order book.
- A technician who cannot walk to the Quartermaster, being shut aboard the shuttle, cannot say a crate would not come. It goes on trying to reach the Quartermaster's door until the word is five minutes old, then drops it. Nothing about it goes by PDA.
- The simulator's "the cargo technician ends at the post" check fails now and then in `qmwait` as well as `nested`, for the same reason. It did before this change.
- New simulator scenario `qmstuck` only. The simulator's own `unload` is made to fail by hand in it: it tests what the brains say and do, not the crate.
- No voice cases on the real model for the new lines.

---

## 2026-11-18, morning: fixes from the first round with a Quartermaster (the commit that added this file)

**Tested:** type check, server compile (0 errors, 0 warnings), simulator (all 31 scenarios pass). **Not played in a round.** The simulator does not run the server code, so the server-side fixes below are compile-checked only.

**Round that showed the faults:** `data/logs/2026/11/18/round-01.53.17` (MetaStation, 34 minutes). It ran a build from before the last of the Quartermaster work in `1939a113`.

### What the crew does now

Orders and crates:

- **Said is not told.** A technician with word for the Quartermaster (an order has come in, a crate is waiting, a crate is lost) waits to hear "Jameson, I have that." Until then the word is not passed on. With nothing back in 25 seconds it walks up and says it again. After two tries it sends the PDA to whoever ordered itself. `tellQuartermaster` in `jobs/cargo.ts`; the answer is in `overhears` in `jobs/quartermaster.ts`; the words are `WORD_HEARD` in `jobs/supply.ts`.
- The Quartermaster's "I have that" is said word for word and whatever its body is doing. `toTell` entries can now be `exact` and `whileBusy` (`types.ts`, `drive` in `driver.ts`).
- A head stops asking for an order once cargo says a crate of it is still waiting, not only on "your order has come in". `readsMessage` in `jobs/head.ts`.
- A head gives whoever it sent for a crate five minutes before it sends someone else. `sendFor` in `jobs/head.ts`.
- A crate to collect comes before a mess the same person was called to. `workInOrder` in `tasks.ts`.

Cargo's doors:

- A technician no longer tells a janitor "nobody here sent for you" when that janitor may come in and is only waiting a turn, or has just been told "I am coming". `syncTasks` in `jobs/cargo.ts`.
- A door just opened for someone is not opened again, the same way, for 15 seconds. `doorWanted` in `jobs/cargo.ts`.
- A door held open for two people shuts behind the later one, not the first one through. `hold_door_for` and `watch_door` in `crew_npc_doors.dm`.
- Someone let into locked rooms who wants out waits at the door they came in by. They try another way out every two minutes, not every 20 seconds. `drive` in `driver.ts`, `ingest` in `brain.ts`.

Janitors:

- With both hands full, a body puts what is not a tool of its trade (or an empty spray) in its bag, or on the floor, before it picks something up. `free_a_hand` in `crew_npc_hands.dm`.
- A mess seen in a room that is locked to the body is not its to go to. It goes when someone who works there calls it. `mess_places` in `crew_npc_cleaning.dm`.

The mail chute (fix 1 of `LLM_CREW_PLAN_NO_CHEATS.md`):

- A body walks, not runs, wherever its next step may be onto a slippery tile, unless its shoes grip. `mind_its_step` in `crew_npc_senses.dm`.
- A body that is not standing on a floor (in a pipe, a locker, a crate) senses nothing until it is out. Coming out of the disposal pipes is said in its event list and in `game.log`. `look_around` in `crew_npc_senses.dm`.

### Not the crew's fault

- **PDA messages stop when station power goes.** In that round every "Your PDA would not send the message." begins at 26 minutes, and `pda.log` has no line after it. A meeting with one of three staff there, a report never sent, and a technician calling one janitor six times in five minutes were all this.
- A random event turned the gravity generator off at 30 minutes, and nothing turns it back on.

### Known and not fixed

- The route planner sends a janitor inside the Cargo Bay to the lobby airlock, which is locked to it (11 failed walks stopping at 77,146). Cause not found. The fix above only stops the janitor walking at it over and over.
- No janitor had soap or a wet mop, so the oil in the Cargo Bay was never cleaned and technicians called for it every ten minutes. Needs the water work in `LLM_CREW_PLAN_NO_CHEATS.md` section 4.4.
- A janitor asked face to face to open a door its own ID opens only talks. It has no way to open a door for someone.
- Janitors do not put anyone out of their own rooms. The owner wants them to: Pun Pun got into the Custodial Closet and set off a cleaner grenade.
- A technician found no route from the Cargo Bay to the Warehouse, twice. Not looked into.
- The Quartermaster's order book never showed the order as come in. That should follow from "said is not told". Not checked.
- The simulator's `nested` scenario fails now and then on "the cargo technician ends at the post": the technician is on its five-minute round when the run stops. It did so on `1939a113` too (1 run in 6), and more often after these changes in one batch (4 in 6). The door sequence in the failing run was right.

---

## 2026-11-18, 02:27: the Quartermaster (`1939a113`)

**The entry above builds on this one.** This was written after it, at the owner's request, for the commit before this file existed. Where the two differ, the one above is later and is how things are now: it changed how a technician passes word to the Quartermaster.

**Tested:** type check, server compile (0 errors, 0 warnings), simulator (every scenario passed in the last full run, in quiet, chatty and dead-LLM modes, except `nested`), and the tables of cases in `tools/llm_crew/book.ts` and `reports.ts`. **Not played in a round. No model tests.** The simulator does not run the server code, so everything in `crew_npc_quartermaster.dm` is compile-checked only.

**Plan:** `LLM_CREW_PLAN_QUARTERMASTER.md`. Its section 1 lists what the owner decided, and items marked **Mine** are my choices.

### What the crew does now

Orders:

- **Every order goes through the Quartermaster.** A head, or the Captain, sends it by PDA. The Quartermaster numbers it and sends back "Noted, order 3: ...". `takeOrder` in `jobs/quartermaster.ts`; the head's side is `requisitionStep` in `jobs/head.ts`.
- A technician takes no order from anyone else while there is a Quartermaster. A head who tries is told once to send it by PDA. `offers` and `overhears` in `jobs/cargo.ts`.
- The Quartermaster never places an order. It walks up to a technician and gives it face to face, word for word: "Cora, order 3: I need to order ..., for Hop Kins." The technician's body reads it from those words and answers "Order 3, right away." `giveStep` in `jobs/quartermaster.ts`; `GIVEN_WORDS` in `jobs/supply.ts`; the `GIVEN` task in `jobs/cargo.ts`.
- Nothing between the Quartermaster and a technician goes by PDA. A technician with word for it (an order has come in, a crate is waiting, a crate is lost) says so in person, and knocks at its office door if it is not in sight. `tellQuartermaster` in `jobs/cargo.ts`; the `KNOCK` task in `jobs/quartermaster.ts`.
- The Quartermaster passes that word on to whoever ordered, by PDA. A lost crate it has ordered again, once, as a new order. `overhears` and `crateLost` in `jobs/quartermaster.ts`.
- A head whose order gets no "Noted" in three minutes takes it to the counter and adds "The Quartermaster has not answered." A technician told that serves it as before. `QM_SILENT` in `jobs/supply.ts`.
- An order placed for the Quartermaster carries who it is for, who gave it and its book number. `tool_order` and `order_arrived` in `crew_npc_cargo.dm`.

The order book:

- It is a sheet of paper on the Quartermaster's clipboard, named "order book". Its first job of the shift is to fetch a sheet from the nearest paper bin it can reach. `tool_get_paper` and `take_paper` in `crew_npc_quartermaster.dm`.
- Each order gets a line when it is taken and a line each time something happens to it. Lines begin "Order 3." because paper sets a line beginning "3." as a numbered list item. `BOOK` in `jobs/quartermaster.ts`; `tool_note` in `crew_npc_quartermaster.dm`.
- To write, the clipboard has to be in a hand and a pen in its clip. The pen comes out of the PDA. `ready_to_write` in `crew_npc_quartermaster.dm`.
- With nothing in its head and writing in the book, as after the brain window is reopened, it reads the book and carries on. `readBook` in `jobs/quartermaster.ts`.
- If it finds no paper it orders a Bureaucracy Crate for itself and opens that crate itself once it is off the shuttle. `orderForItself` in `jobs/quartermaster.ts`; `tool_open_own_crate` in `crew_npc_quartermaster.dm`.

Money:

- Every order is paid from cargo's one budget. The Quartermaster knows the budget and prices only from the budget program on its PDA. `cargo_budget` and `crate_costs` in `crew_npc_quartermaster.dm`.
- A purchase of more than 1,000 credits, or more than half of what is free, is put to the Captain by PDA with the numbers, ending "Yes or no?". It asks twice, three minutes apart, then holds the order and tells whoever ordered. With no Captain aboard it clears it itself. `clearOrders` and `readAnswer` in `jobs/quartermaster.ts`.
- An order the budget cannot cover is held, not refused, until the money is there.

The supply staff:

- The Quartermaster holds a staff meeting in the bay thirty seconds into the shift and every ten minutes after, called aloud. `SUPPLY_WAY` in `jobs/quartermaster.ts`; `aloudCall` in `jobs/meetings.ts`.
- How a staff meeting is held is now shared by both heads. `MeetingWay`, `syncMeeting` and `meetStep` in `jobs/head.ts`.
- Technicians report crates in and crates out since their last report, from the server's counts. `work_crates_in` and `work_crates_out`, counted in `crew_npc_freight.dm` and `crew_npc_held.dm`; the two new tallies in `jobs/reports.ts`.
- At the first meeting it divides the standing work: the counter, the shuttle and the rooms. A technician leaves another's part alone while that workmate is about. `dutyStep` in `jobs/quartermaster.ts`; `dutiesFor` in `jobs/supply.ts`; `dutyOf` and `leftTo` in `jobs/cargo.ts`.
- The test crew spawned at round start has a Quartermaster. `spawn_test_crew` in `crew_npc_spawn.dm`.

### Known and not fixed

- **Short of the no-cheats rule:** taking the sheet from the bin, clipping it to the clipboard and writing a line are done by direct code, under the same conditions as a player's clicks, not through the clicks themselves. `take_paper` and `tool_note` in `crew_npc_quartermaster.dm`.
- The half rule asks the Captain about nearly every early order: the budget is 500 to 1,000 credits then and a crate is 400. That is the rule as the owner decided it.
- The counter itself is not given to one technician. Whoever is asked still hands over a crate or opens the door. Only shuttle and room work is left to whoever has it.
- "Crates out" counts crates put out for collection plus empties put aboard the shuttle. That is my reading of "in and out".
- The Quartermaster has no way to know a technician, or anyone, is dead. A dead Quartermaster is found out only by its not answering.
- In the simulator the full-crew scenario `qm` failed once in 16 runs, on the older check that the bay door is not opened over and over for a janitor. It did not recur and the cause was not found.
- The simulator counts cargo's budget only when a Quartermaster is aboard. Without one, a three-crate order early in a round passes in the simulator and would be refused by the real server.
- The second supply meeting falls at the very end of the longest simulator run, so it is only partly exercised.
- The Quartermaster's own lines have no cases in `tools/llm_crew/voice.ts`.
- Mining and the bitrunners are the Quartermaster's too, and are not at its meeting.

---

## Earlier work

One line each, from the commit subjects. Each plan file has a Status section with the detail.

| Date | Commit | What |
|---|---|---|
| 2026-11-18 02:27 | `1939a113` | A Quartermaster who takes every order, keeps an order book, and runs the supply staff. Plan: `LLM_CREW_PLAN_QUARTERMASTER.md`. |
| 2026-11-18 00:55 | `0e3ef1d6` | Nobody gets stuck in a doorway at a staff meeting. Plan: `LLM_CREW_PLAN_MEETING_FOLLOWUPS.md`. |
| 2026-11-17 23:56 | `44828dae` | Getting out of locked rooms, eviction orders, stepping aside, and crates kept clear of doors. Plan: `LLM_CREW_PLAN_SECURE_AREAS.md`. |
| 2026-11-17 22:54 | `ee409a95` | Staff meetings with reports, the Captain kept informed, and mixed orders. |
| 2026-11-17 21:47 | `2b3c1f4c` | Cargo holds ordered crates for collection instead of delivering. |
| 2026-11-17 20:47 | `d2670102` | Heads, guarding, orders, meetings, and a simpler brain window. |
| 2026-11-17 10:00 | `82810bef` | LLM-voiced crew NPCs: janitors and a cargo technician. Brief: `LLM_CREW_BRIEF.md`. |

Planned and not built: `LLM_CREW_PLAN_NO_CHEATS.md` (all but the mail chute), `LLM_CREW_PLAN_DROPPED_CRATES.md`, `LLM_CREW_PLAN_LIGHTS.md`.

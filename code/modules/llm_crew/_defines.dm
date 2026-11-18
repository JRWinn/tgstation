/// How many tiles away a crew NPC notices people.
#define CREW_NPC_VISION_RANGE 7
/// How often a crew NPC checks who is in view.
#define CREW_NPC_LOOK_INTERVAL (1 SECONDS)
/// How long someone must stay out of view before seeing them again counts as a new sighting.
#define CREW_NPC_SIGHT_MEMORY (15 SECONDS)
/// The most kinds of thing a crew NPC reports as in view at once.
#define CREW_NPC_THINGS_MAX 30
/// How many recent sense events each crew NPC keeps for its brain window.
#define CREW_NPC_EVENT_HISTORY 30

/// Blackboard key: the person the body has been told to walk to.
/// crew_npc.bt.json uses this string directly, because the tree compiler only reads defines from code/__DEFINES.
#define BB_CREW_NPC_WALK_TARGET "BB_crew_npc_walk_target"
/// How long a walk up to a person may take before the body gives up.
#define CREW_NPC_WALK_TIMEOUT (30 SECONDS)
/// How long a walk to another part of the station may take before the body gives up.
#define CREW_NPC_TRAVEL_TIMEOUT (3 MINUTES)
/// The longest route, in tiles, a crew NPC will plan.
#define CREW_NPC_MAX_PATH_LENGTH 250
/// Blackboard key: the container the body is on its way to look inside. Also written out in crew_npc.bt.json.
#define BB_CREW_NPC_STORAGE_TARGET "BB_crew_npc_storage_target"
/// Blackboard key: the thing the body is on its way to act on. Also written out in crew_npc.bt.json.
#define BB_CREW_NPC_ERRAND_TARGET "BB_crew_npc_errand_target"
/// How many brain log records one player's window may send within CREW_NPC_TOOL_WINDOW.
#define CREW_NPC_LOG_RECORD_LIMIT 40
/// The longest a field of a brain log record may be, in characters.
#define CREW_NPC_LOG_FIELD_LENGTH 6000
/// The longest the fixed part of an NPC's prompt may be in the brain log, in characters.
#define CREW_NPC_LOG_CARD_LENGTH 12000
/// How many ways out of a room have to come to nothing before a crew NPC takes itself to be shut in.
#define CREW_NPC_SHUT_IN_AFTER 2
/// How long a crew NPC leaves alone a room it could not find a way into.
#define CREW_NPC_BLOCKED_PLACE_TIME (5 MINUTES)
/// The most messes a crew NPC keeps track of at once.
#define CREW_NPC_MESSES_REMEMBERED 300
/// How many tiles from its post a crew NPC standing at it may wander.
#define CREW_NPC_POST_LEASH 2
/// How long a crew NPC waits before trying again to step back to its post.
#define CREW_NPC_POST_RETURN_COOLDOWN (20 SECONDS)
/// Not a tool the brain can call: marks the walk a body makes on its own back to its spot at its post.
#define CREW_TOOL_RETURN "return_to_post"
/// How often a crew NPC that has ordered supplies checks on the shuttle.
#define CREW_NPC_SUPPLY_CHECK (5 SECONDS)
/// How long a crew NPC waits for ordered supplies before deciding they are not coming.
#define CREW_NPC_SUPPLY_TIMEOUT (6 MINUTES)
/// How long a crew NPC lets the supply shuttle sit unable to leave before it gives the order up.
#define CREW_NPC_SUPPLY_HELD_UP (30 SECONDS)
/// How close a crew NPC has to get to someone it cannot reach, such as across a counter, for that to do.
#define CREW_NPC_NEAR_ENOUGH 4
/// Longest PDA message a crew NPC may send, in characters. Longer text is cut off.
#define CREW_NPC_MESSAGE_MAX_LENGTH 200
/// Most kinds of mess in one room that a crew NPC names when it tells a janitor of them.
#define CREW_NPC_MESSES_NAMED 3
/// The fewest messes that must lie close together before a crew NPC will spend a cleaner grenade on them.
#define CREW_NPC_GRENADE_MIN_MESSES 6
/// How far, in tiles, a cleaner grenade's foam is counted on to reach.
#define CREW_NPC_GRENADE_RADIUS 2
/// How close, in tiles, a crew NPC gets to a mess before throwing a grenade at it.
#define CREW_NPC_GRENADE_THROW_DISTANCE 4
/// The most messes a crew NPC cleans in one go.
#define CREW_NPC_MESSES_PER_CLEAN 8
/// How long a crew NPC scrubs at one mess before giving up on it.
#define CREW_NPC_CLEAN_TIME (8 SECONDS)
/// The most containers a crew NPC looks inside in one search of a room.
#define CREW_NPC_STORAGE_PER_SEARCH 6
/// How long before a container, or a room's storage, is worth a second look.
#define CREW_NPC_STORAGE_RECHECK (5 MINUTES)
/// How long a crew NPC spends trying to reach one container before moving on.
#define CREW_NPC_REACH_TIMEOUT (20 SECONDS)
/// How long a crew NPC holds a container open while it looks inside.
#define CREW_NPC_LOOK_TIME (0.8 SECONDS)
/// Percent chance that exploring goes back to storage due a second look when there are still new rooms to find.
#define CREW_NPC_REVISIT_CHANCE 20
/// How many rooms a crew NPC tests a route to each time it looks for somewhere new to explore.
#define CREW_NPC_EXPLORE_TRIES 4
/// Longest thing a crew NPC may say in one go, in characters. Longer text is cut off.
#define CREW_NPC_SAY_MAX_LENGTH 200
/// Shortest gap between two things a crew NPC says.
#define CREW_NPC_SAY_COOLDOWN (4 SECONDS)
/// How many tool calls a crew NPC accepts from its brain within CREW_NPC_TOOL_WINDOW.
#define CREW_NPC_TOOL_CALL_LIMIT 8
/// The period CREW_NPC_TOOL_CALL_LIMIT is counted over.
#define CREW_NPC_TOOL_WINDOW (10 SECONDS)

/// Tool name: speak aloud.
#define CREW_TOOL_SAY "say"
/// Tool name: walk up to a person in view.
#define CREW_TOOL_WALK_TO "walk_to"
/// Tool name: walk to a room the body has been in before.
#define CREW_TOOL_GO_TO "go_to"
/// Tool name: walk to a part of the station the body has not been in.
#define CREW_TOOL_EXPLORE "explore"
/// Tool name: settle down where the body is and take a break.
#define CREW_TOOL_REST "rest"
/// Tool name: look inside the storage in the room the body is in.
#define CREW_TOOL_SEARCH "search"
/// Tool name: pick up an item in view, or take one from a container the body has looked inside.
#define CREW_TOOL_PICK_UP "pick_up"
/// Tool name: put down what the body is holding.
#define CREW_TOOL_PUT_DOWN "put_down"
/// Tool name: hand what the body is holding to a person in view.
#define CREW_TOOL_GIVE "give"
/// Tool name: clean up the messes in view with what the body is holding.
#define CREW_TOOL_CLEAN "clean"
/// Tool name: check the custodial locator on the body's PDA for where cleaning gear is.
#define CREW_TOOL_LOCATE "locate"
/// Tool name: order a crate of supplies at the supply console. Cargo staff only.
#define CREW_TOOL_ORDER "order"
/// Tool name: fetch an ordered crate off the supply shuttle and bring it out to the Cargo Lobby.
#define CREW_TOOL_BRING "bring_out"
/// Tool name: haul the next loaded crate off the supply shuttle into the bay. Cargo staff only.
#define CREW_TOOL_UNLOAD "unload"
/// Tool name: take the mail out of a mail crate and keep it until it is collected. Cargo staff only.
#define CREW_TOOL_MAIL "collect_mail"
/// Tool name: hand someone in view the mail the body holds for them.
#define CREW_TOOL_HAND_MAIL "hand_mail"
/// Tool name: put a crate with nothing left in it aboard the supply shuttle. Cargo staff only.
#define CREW_TOOL_RECYCLE "recycle"
/// Tool name: send the supply shuttle back. Cargo staff only.
#define CREW_TOOL_SEND "send_shuttle"
/// How long a look at what is on the supply shuttle and in the bay is good for.
#define CREW_NPC_FREIGHT_CHECK (2 SECONDS)
/// Tool name: stop walking for a moment, because the body is about to talk with someone.
#define CREW_TOOL_HOLD "hold"
/// Tool name: open the door of the post for someone. Cargo staff only.
#define CREW_TOOL_DOOR "open_door"
/// How long a body stops for when it is about to talk: long enough to find the words.
#define CREW_NPC_TALK_HOLD (4 SECONDS)
/// How long a body stays put after it has said something.
#define CREW_NPC_TALK_PAUSE (2.5 SECONDS)
/// The source of the trait that holds a body still while it talks.
#define CREW_NPC_TALK_TRAIT "crew_npc_talk"
/// How long a door opened for someone is held open.
#define CREW_NPC_DOOR_HELD (15 SECONDS)
/// How far from its post, in tiles, a body looks for the door someone wants opened.
#define CREW_NPC_DOOR_SEARCH 12
/// How many rooms a body tries to find a way to before it concludes it is shut in.
#define CREW_NPC_SHUT_IN_ROUTES 3
/// How near, in tiles, someone has to be to be the one standing in the way.
#define CREW_NPC_IN_THE_WAY_RANGE 3
/// Tool name: put away the next thing lying about in the work area.
#define CREW_TOOL_TIDY "tidy"
/// How long a look at what is lying about in the work area is good for.
#define CREW_NPC_TIDY_CHECK (3 SECONDS)
/// Most things on one table or rack top before it counts as full.
#define CREW_NPC_SURFACE_ROOM 4
/// How long a thing that could not be put away is left alone before it is tried again.
#define CREW_NPC_TIDY_GIVE_UP (5 MINUTES)
/// Most things lying about that are counted. Past this it is simply a lot.
#define CREW_NPC_TIDY_COUNTED 20
/// Tool name: go and stand at the door into a room, or out of the room the body is in.
#define CREW_TOOL_TO_DOOR "go_to_door"
/// How near a door, in tiles, a body has to be to count as standing at it.
#define CREW_NPC_AT_DOOR 2
/// How often a door held open for someone is checked to see whether they are through.
#define CREW_NPC_DOOR_WATCH (0.4 SECONDS)
/// Tool name: take someone who has no business in the body's post by the arm and walk them out.
#define CREW_TOOL_EVICT "throw_out"
/// How far from the door, in tiles, a spot to leave them at is looked for.
#define CREW_NPC_EVICT_REACH 5
/// How far past the door, in tiles, they are left: they trail a step behind whoever walks them out.
#define CREW_NPC_EVICT_PAST_DOOR 3
/// How long walking someone out may take, and how long they go along with it.
#define CREW_NPC_EVICT_HOLD (40 SECONDS)
/// How long one PDA message to a janitor from a post stands as that post's call for one.
#define CREW_NPC_CALL_STANDS (10 MINUTES)
/// TRUE if a walk started by this tool has the body hauling something, or someone, behind it.
#define CREW_NPC_HAULS(tool) (tool == CREW_TOOL_BRING || tool == CREW_TOOL_UNLOAD || tool == CREW_TOOL_RECYCLE || tool == CREW_TOOL_EVICT || tool == CREW_TOOL_TAKE_BACK)
/// Tool name: send someone a PDA message.
#define CREW_TOOL_MESSAGE "message"
/// Tool name: throw a cleaner grenade into a thick patch of mess.
#define CREW_TOOL_GRENADE "grenade"

/// Tool name: get clear of where the body is.
#define CREW_TOOL_FLEE "flee"

/// How much health someone must lose between two looks for a crew NPC to notice they have been hurt.
#define CREW_NPC_HARM_NOTICED 8
/// The least time between two reports that the same person has been hurt.
#define CREW_NPC_HARM_REPORT_GAP (4 SECONDS)
/// How much force a held item needs for a crew NPC to see it as a weapon.
#define CREW_NPC_WEAPON_FORCE 8
/// Kind of harm a crew NPC can notice: someone has been hurt.
#define CREW_HARM_HURT "hurt"
/// Kind of harm a crew NPC can notice: someone has gone down.
#define CREW_HARM_COLLAPSED "collapsed"
/// Kind of harm a crew NPC can notice: someone has died in view.
#define CREW_HARM_DIED "died"
/// Kind of harm a crew NPC can notice: someone found lying still, alive or not known to be dead.
#define CREW_HARM_DOWN "down"
/// Kind of harm a crew NPC can notice: someone found dead.
#define CREW_HARM_BODY "body"

/// Sense event kind: someone, perhaps the body itself, has come to harm.
#define CREW_SENSE_DANGER "danger"
/// Sense event kind: the outcome of something the body was told to do.
#define CREW_SENSE_ACTION_RESULT "action_result"
/// Sense event kind: a person has newly come into view.
#define CREW_SENSE_PERSON_IN_VIEW "person_in_view"
/// Sense event kind: the body heard someone speak nearby.
#define CREW_SENSE_SPEECH_HEARD "speech_heard"
/// Sense event kind: the body looked at a container and saw what it holds, or found it locked.
#define CREW_SENSE_STORAGE_SEEN "storage_seen"
/// Sense event kind: a message arrived on the body's PDA.
#define CREW_SENSE_PDA_MESSAGE "pda_message"
/// Sense event kind: something the body knows without having seen it, such as the way to its post.
#define CREW_SENSE_KNOWLEDGE "knowledge"
/// Tool name: knock at the door the body is standing at, for whoever is on the other side of it.
#define CREW_TOOL_KNOCK "knock"
/// How near a door, in tiles, a crew NPC has to be to hear someone knock at it.
#define CREW_NPC_KNOCK_RANGE 9
/// Tool name: go to the fire alarm of a room where someone has pulled it, and reset it.
#define CREW_TOOL_RESET_ALARM "reset_alarm"
/// How far, in tiles, a body looks for the fire door that has stopped it.
#define CREW_NPC_FIRE_DOOR_RANGE 7
/// How long a fire alarm the body could not get to is left out of its reckoning.
#define CREW_NPC_ALARM_RETRY (5 MINUTES)
/// Tool name: haul the crate that was tipped out at a delivery back to the bay.
#define CREW_TOOL_TAKE_BACK "take_back"
/// The most crates of one thing a single order may be for.
#define CREW_NPC_ORDER_MAX 4
/// How long after a round starts the standing test crew is spawned, so that whoever owns them has a body by then.
#define CREW_NPC_AUTOSTART_DELAY (10 SECONDS)

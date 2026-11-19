---
id: HAND-03
title: An asterisk anywhere in a line turns the words before it into an emote, and the crew do not hear them
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: tools
files: code/modules/llm_crew/crew_npc_tools.dm:148, code/modules/mob/mob_say.dm:177, code/modules/mob/living/living_say.dm:120, code/modules/llm_crew/crew_npc_senses.dm:391
fix: Take every asterisk out of the text in tool_say before it is said, not only the ones at the start
---

## What is wrong

`tool_say` strips the characters that would change how a line is said, but only from the start of the line. The game also looks for an asterisk anywhere in what is said: everything before the first `*` becomes a "custom say emote" (it is shown in place of "says"), and only what comes after it is the speech. If nothing comes after it, the whole line is shown as an emote and nothing is said.

The local model writes asterisks: for an action ("*nods*"), and for emphasis ("**12**"). The window only throws a line away when the whole of it is `*...*` (`isFiller` in `prompt.ts`). Nothing in the window or the server takes an asterisk out of the middle or the end.

Three cases, by the code:

1. The model's line is `On my way, Captain. *salutes*`. The leading-characters regex does nothing. In `/mob/living/say`, `check_for_custom_say_emote` cuts at the first `*`: the emote is "On my way, Captain. " and the message is "salutes*". On screen: `Maria Williams On my way, Captain. , "Salutes*"`. Every crew NPC in earshot hears "salutes*" as what Maria said, and that is what goes to their brains.
2. The line is `Crate **12** is in the lobby for you.` The emote is "Crate ", the message is "*12** is in the lobby for you." The hearer is told Maria said "*12** is in the lobby for you."
3. The line is `I will get to it right away*`. Nothing follows the asterisk, so `MODE_CUSTOM_SAY_ERASE_INPUT` is set. It is shown as an emote, "Maria Williams I will get to it right away". Crew NPCs do not hear it at all: `on_pre_hear` returns on that flag ("Custom emotes are not speech"). A hand-off said aloud to a workmate is lost, while the speaker's brain and `game.log` ("was told by its brain to say: ...") both have it as said.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:146`, `tool_say`:

    var/static/regex/line_breaks = regex(@"[\r\n\t]+", "g")
    // Plain speech only: these prefixes would turn it into a radio message, an emote, a whisper or a special say mode.
    var/static/regex/say_prefixes = regex(@"^[\s;:.,*#%!^]+")
    text = line_breaks.Replace(text, " ")
    text = say_prefixes.Replace(text, "")

`code/modules/mob/living/living_say.dm:118`, `/mob/living/say`:

    message = get_message_mods(message, message_mods)
    saymode = SSradio.get_available_say_mode(src, message_mods[RADIO_KEY])
    if(!forced && (isnull(saymode) || saymode.allows_custom_say_emotes))
    	message = check_for_custom_say_emote(message, message_mods)

`code/modules/mob/mob_say.dm:177`:

    /mob/proc/check_for_custom_say_emote(message, list/mods)
    	var/customsaypos = findtext(message, "*")
    	if(!customsaypos)
    		return message
    	...
    	mods[MODE_CUSTOM_SAY_EMOTE] = copytext(message, 1, customsaypos)
    	message = copytext(message, customsaypos + 1)
    	if (!message)
    		mods[MODE_CUSTOM_SAY_ERASE_INPUT] = TRUE
    		message = "an interesting thing to say"

`code/modules/llm_crew/crew_npc_senses.dm:390`, `on_pre_hear`:

    // Custom emotes are not speech.
    if(message_mods[MODE_CUSTOM_SAY_ERASE_INPUT])
    	return

## How it was found

Read from the code, both sides: `tool_say`, the base `say`, and a search of the window code for anything that removes an asterisk (there is none: `inOwnVoice` and `withoutHandles` in `prompt.ts` do not, and `isFiller` only matches a line that is nothing but `*...*`). Not looked for in a round log by the finder; the checker found it in five rounds (see `## Check`). To check one: `grep -n "told by its brain to say:.*\*" game.log`.

## How to fix it

1. In `tool_say`, after the line breaks are replaced, take out every asterisk: add `var/static/regex/asterisks = regex(@"\*+", "g")` and `text = asterisks.Replace(text, "")`. Do it before the prefix strip and the trim, so a line that was only "*nods*" becomes "nods" (the window's `isFiller` already drops those, so this is the belt to its braces).
2. Better still, drop a whole `*...*` span when it stands at the start or the end of the line, since there it is an action and not words: `regex(@"^\s*\*[^*]*\*\s*|\s*\*[^*]*\*\s*$", "g")` first, then the lone asterisks. "On my way, Captain. *salutes*" is then said as "On my way, Captain." Do not drop a span in the middle of a line: the model uses them for emphasis, and in the logs "you call *this* cool?" and "Tell me if *you* need cleaning supplies" would lose the word that carries the sense. Those keep the word and lose only the asterisks. Run this before `say_prefixes`, which today strips the first asterisk of "*I* shake slightly" and leaves "I* shake slightly" (seen in a round, below).
3. If the text is empty after that, answer as the proc already does for an empty line ("You open your mouth but have nothing to say.").
4. Do the same in the window, so the brain's own record of what it said matches what was said. The model's `say` goes through `inOwnVoice` in `parseReply` (`prompt.ts:348`) and then `withoutHandles` (`brain.ts:1373`); either will do. Lines the code writes word for word (`exact`) have no asterisks and need nothing.
5. Leave `|`, `+` and `_` alone: they only make text slanted or bold in chat and change no words.

## How to test the fix

- Server compile to a side copy, type check for the window change.
- `tools/llm_crew/addressing.ts` style: add three cases to a table for `inOwnVoice` (the three lines above) and check the output has no asterisk.
- In a round: `grep -n "\*" game.log | grep "told by its brain to say"` should find nothing after the fix; before it, each hit is a line that was garbled or not heard.

## Check

Read `tool_say` (`crew_npc_tools.dm:140-170`): only `^[\s;:.,*#%!^]+` is stripped, then the line goes to `body.say`, which for a human is `/mob/living/say` (`living_say.dm:105-130`). It is not `forced`, so `check_for_custom_say_emote` (`mob_say.dm:177-189`) runs: it cuts at the first `*` anywhere, the ban check is skipped (a crew body has no ckey), and an empty remainder sets `MODE_CUSTOM_SAY_ERASE_INPUT`, which `on_pre_hear` (`crew_npc_senses.dm:390`) drops. The window has no asterisk handling: `isFiller` (`prompt.ts:323`) only drops a whole-line `*...*`, and `inOwnVoice` and `withoutHandles` leave asterisks in. No change log or plan entry mentions it.

Seen in rounds as well as read: `grep "told by its brain to say:.*\*"` finds eight lines in five rounds. Each `GAME-SAY` beside it shows the split, for example `round-15.14.49` 21:23:50, "Cool? Greyson, you call *this* cool? ..." said as the emote "Cool? Greyson, you call " and the speech "this* cool? ...", and four lines in `round-10.00.41` from 16:01:44, where the model's "*I* shake slightly ..." lost its first asterisk to `say_prefixes` and was said as the emote "I" with the rest as speech.

Ran: a throwaway bun script, outside the repo, of the two regexes in fix step 2 on the three lines in the write-up and the logged ones. All come out with no asterisk; the emphasised words are kept; "*nods*" comes out empty (step 3 then answers "nothing to say"); "*I* shake slightly" becomes "shake slightly", which is acceptable. Changed: fix step 2 now drops a span only at the start or end of a line, since dropping every `*...*` span would have cut the emphasised words seen in the logs; step 4 names where the window cleans the model's line. Severity medium and effort small kept. Not run: the DM compiler.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 8f3022ebf05.

- HAND-03 (server part): part done. tool_say (crew_npc_tools.dm) drops a *...* action at the start or end of a line, then every other asterisk, before the prefix strip. 'On my way, Captain. *salutes*' is said as 'On my way, Captain.'. 'you call *this* cool?' keeps 'this'. '*nods*' becomes empty and gets 'nothing to say'. Left: tgui/packages/tgui/interfaces/CrewBrain/prompt.ts inOwnVoice (or brain.ts withoutHandles): apply the same two steps, so the brain's record of what it said matches what was said: first the regex /^\s*\*[^*]*\*\s*|\s*\*[^*]*\*\s*$/g replaced with '', then /\*+/g replaced with ''. Add a table (e.g. tools/llm_crew/say-asterisks.ts) with the three lines from the finding, checking no asterisk is left and the emphasised words are kept.

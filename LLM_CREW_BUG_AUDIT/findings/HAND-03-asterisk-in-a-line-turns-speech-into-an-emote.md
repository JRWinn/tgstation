---
id: HAND-03
title: An asterisk anywhere in a line turns the words before it into an emote, and the crew do not hear them
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
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

Read from the code, both sides: `tool_say`, the base `say`, and a search of the window code for anything that removes an asterisk (there is none: `inOwnVoice` and `withoutHandles` in `prompt.ts` do not, and `isFiller` only matches a line that is nothing but `*...*`). Not looked for in a round log. To check one: `grep -n "told by its brain to say:.*\*" game.log`.

## How to fix it

1. In `tool_say`, after the line breaks are replaced, take out every asterisk: add `var/static/regex/asterisks = regex(@"\*+", "g")` and `text = asterisks.Replace(text, "")`. Do it before the prefix strip and the trim, so a line that was only "*nods*" becomes "nods" (the window's `isFiller` already drops those, so this is the belt to its braces).
2. Better still, drop a whole `*...*` span, since it is an action and not words: `regex(@"\*[^*]*\*", "g")` first, then the lone asterisks. "On my way, Captain. *salutes*" is then said as "On my way, Captain."
3. If the text is empty after that, answer as the proc already does for an empty line ("You open your mouth but have nothing to say.").
4. Do the same in the window (`inOwnVoice` in `prompt.ts`), so the brain's own record of what it said matches what was said.
5. Leave `|`, `+` and `_` alone: they only make text slanted or bold in chat and change no words.

## How to test the fix

- Server compile to a side copy, type check for the window change.
- `tools/llm_crew/addressing.ts` style: add three cases to a table for `inOwnVoice` (the three lines above) and check the output has no asterisk.
- In a round: `grep -n "\*" game.log | grep "told by its brain to say"` should find nothing after the fix; before it, each hit is a line that was garbled or not heard.

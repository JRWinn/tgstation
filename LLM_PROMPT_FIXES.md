# NPC prompt fixes: note for Claude Code

Written 2026-11-17 from outside the codebase. It is based on **one captured prompt and reply** (Fitz Stroh, Cargo Technician, an idle small-talk moment in the Cargo Bay with the Captain in view). I have not read the brain code, so check each point against how the prompt is actually assembled before changing anything.

Jordan's goal: the NPCs come across as dumb. He wants to fix the three problems below, shrink the prompt, and then try again, on the local model and on Claude Haiku 5.5.

## What the sample showed

1. **Too many standing rules.** The system prompt carries about 30 rules, many phrased as "never" or "do not". The sample came to roughly 14,000 characters in total. Small models lose track of long rule lists.
2. **The reply format is not enforced.** The spec requires "think" first, but the replies were `{"say":"Nothing.","move":{"tool":"stay"}}`. The model skipped fields and spoke the word "Nothing." aloud when it meant to stay silent.
3. **Notes are duplicated.** "Vinnie Scherer is in Cargo Bay with good reason" is stored twice with slightly different wording, and both repeat what the "where you last saw people" list already holds.

## Step 0: measure first

Before changing the prompt, save 20 or so real prompts with the replies they got, covering different situations (greeting, being asked for supplies, rude remark, idle moment, intruder). Build a small replay script that sends a saved prompt to a chosen model and prints the reply. Every change below should be judged by replaying the same set, and the same set lets Jordan compare models side by side. Log the token count of every call.

## Fix 1: enforce the reply format

- Ollama accepts a JSON schema in the request's `format` field. The Claude API offers structured outputs and tool use. Use whichever applies so that required fields cannot be skipped.
- Make silence an explicit value, for example `"say": null`. Do not rely on the model leaving a string empty. Also drop spoken lines in code when they are obviously not speech ("Nothing.", "...").
- Ask only for fields that apply to the event. The idle prompt offered a single move, `stay`, and still asked the model to choose one. When there is one option, fill it in from code and leave it out of the prompt and the schema.
- Consider a separate small schema per event type (idle remark, reply to speech, first meeting) so each call asks for less.

## Fix 2: clean up notes

- Deduplicate when a note is written: normalize the text and compare it with existing notes, and reject or merge near-matches.
- Separate lasting facts (who someone is, how the NPC feels about them, gossip) from passing state (who is where right now). Passing state already lives in the last-seen list and should not also become notes.
- Replace notes that describe a state instead of appending a new one.
- Cap the number of notes sent per call and prefer the ones about people currently in view.

## Fix 3: compress the prompt

The main idea: **send the rules that matter for this event, not the whole rulebook every time.**

- **Core block, always sent:** identity, personality, how to speak (one or two sentences, first person, names not handles, say only what is true). Aim for a short paragraph and five or six rules.
- **Situation blocks, sent only when relevant:** ordering rules when someone asks for something; trespass rules when a stranger is in the post; small-talk guidance when it is an idle moment.
- **Automatic body behavior:** about a third of the rules describe things the body does without the LLM deciding (doors, mail, unloading, tidying, calling a janitor). The LLM only needs these so it can speak truthfully. Move them out of the standing rules and into the report as one line when the behavior is happening or about to.
- **Merge repeats.** "Answer when spoken to" appears in the rules and again in the "say" field description. The handle rule appears twice. "Do not order unasked" and "wait to be asked" are one rule.
- **State rules positively** where possible. "Call people by name" works better than "never say a handle".
- **Trim history.** The earlier turns repeat the full small-talk instruction each time. Keep only the lines the NPC said.
- **Check whether the sense-event log is being sent.** The capture ended with 30 numbered events. If that is only the debug window, ignore this. If it goes to the model, send only the last few that matter.
- **Order for caching:** fixed text first, changing text last.

## Fix 4: stop asking when there is nothing to say

The capture is an idle prompt: "If you feel like it, say something." The only person in view was someone the NPC dislikes, and the only topic available was a mess it could do nothing about, so it restated the mess.

- Decide in code whether an idle remark is worth a model call: a cooldown, someone new or liked in view, or something new having happened. Otherwise make no call.
- The "You have already said … say nothing like that again" list puts the old lines back in front of the model. Give recent lines as plain context and reject near-repeats in code.

## Suggested order

1. Step 0: capture set and replay script.
2. Fix 1: quickest win, removes a whole class of failures.
3. Fix 2: small, contained.
4. Fix 3: the largest change; do it one block at a time and replay after each.
5. Fix 4.
6. Replay the capture set on the local model and on Claude Haiku 5.5, and show Jordan the replies side by side.

## Not verified

- Whether the format is already partly enforced and the model is ignoring it some other way.
- Whether the 30-event log is part of the prompt.
- How much of the dumbness remains after these fixes. That is what the replay set is for.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  Box,
  Button,
  Collapsible,
  LabeledList,
  NoticeBox,
  Section,
  Stack,
} from 'tgui-core/components';

import { useBackend } from '../../backend';
import { Window } from '../../layouts';
import {
  chooseModel,
  getBrain,
  getModel,
  getVersion,
  ingest,
  OLLAMA_URL,
  setAct,
  stopSession,
  subscribe,
} from './brain';
import { setStationPlaces } from './memory';
import { describeFeeling } from './relationships';
import { describeTask } from './tasks';
import type { Data, Npc, NpcBrain, Task } from './types';

const OLLAMA_CHECK_TIMEOUT_MS = 5000;

type LlmStatus =
  | { state: 'checking' }
  | { state: 'ok'; models: string[] }
  | { state: 'error'; message: string };

async function fetchOllamaModels(): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OLLAMA_CHECK_TIMEOUT_MS,
  );
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama answered with HTTP ${response.status}`);
    }
    const body: { models?: { name: string }[] } = await response.json();
    return (body.models ?? []).map((model) => model.name);
  } finally {
    clearTimeout(timeout);
  }
}

export const CrewBrain = () => {
  const { act, data } = useBackend<Data>();
  const npcs = data.npcs ?? [];
  const [llm, setLlm] = useState<LlmStatus>({ state: 'checking' });
  // Re-render whenever a brain changes state.
  useSyncExternalStore(subscribe, getVersion);

  const checkLlm = useCallback(() => {
    setLlm({ state: 'checking' });
    fetchOllamaModels()
      .then((models) => {
        chooseModel(models);
        setLlm({ state: 'ok', models });
      })
      .catch((error: Error) =>
        setLlm({ state: 'error', message: `${error.name}: ${error.message}` }),
      );
  }, []);

  useEffect(() => {
    checkLlm();
  }, [checkLlm]);

  useEffect(() => {
    setAct(act);
  }, [act]);

  // Closing the window stops all thinking; the NPCs carry on with default behavior.
  useEffect(() => stopSession, []);

  useEffect(() => {
    setStationPlaces(data.places ?? []);
    ingest(data.npcs ?? [], data.now);
  }, [data]);

  return (
    <Window title="Crew Brain" width={560} height={680}>
      <Window.Content scrollable>
        <Section
          title="Local LLM"
          buttons={
            <Button icon="sync" onClick={checkLlm}>
              Check again
            </Button>
          }
        >
          <LlmStatusLine status={llm} />
          <Box color="label" mt={1}>
            Using model {getModel()} at {OLLAMA_URL}. While this window is open
            your NPCs think with it; close the window and they only wander.
          </Box>
        </Section>
        {npcs.length === 0 && (
          <NoticeBox>You do not own any crew NPCs right now.</NoticeBox>
        )}
        {npcs.map((npc) => (
          <NpcSection key={npc.id} npc={npc} brain={getBrain(npc.id)} />
        ))}
      </Window.Content>
    </Window>
  );
};

const LlmStatusLine = (props: { status: LlmStatus }) => {
  const { status } = props;
  switch (status.state) {
    case 'checking':
      return <Box color="average">Checking for Ollama…</Box>;
    case 'ok':
      return (
        <Box color="good">
          Ollama is reachable. Installed models:{' '}
          {status.models.length > 0 ? status.models.join(', ') : 'none'}
        </Box>
      );
    case 'error':
      return (
        <Box color="bad">
          Could not reach Ollama from this window ({status.message}).
        </Box>
      );
  }
};

const BRAIN_STATUS_TEXT = {
  idle: 'Idle',
  queued: 'Waiting for the LLM',
  thinking: 'Thinking…',
} as const;

/** Most tasks that cannot go on yet which are listed one by one. */
const WAITING_TASKS_SHOWN = 2;

/**
 * The tasks worth listing: everything that can be got on with or was just finished, and the first
 * few that are waiting on something. A janitor can know of a dozen rooms it cannot do anything
 * about yet, and a dozen lines saying so bury the one it is working on.
 */
function shownTasks(tasks: Task[]): Task[] {
  let waiting = 0;
  return tasks.filter(
    (task) => task.state !== 'blocked' || ++waiting <= WAITING_TASKS_SHOWN,
  );
}

const NpcSection = (props: { npc: Npc; brain?: NpcBrain }) => {
  const { npc, brain } = props;
  const newestFirst = [...npc.events].reverse();
  const decision = brain?.lastDecision;

  return (
    <Section
      title={`${npc.name}${npc.job ? `, ${npc.job}` : ''} (${npc.id})`}
      buttons={
        <Box inline color={npc.awake ? 'good' : 'bad'}>
          {npc.awake ? 'Sensing' : 'Not sensing'}
        </Box>
      }
    >
      <LabeledList>
        <LabeledList.Item label="Personality">
          {brain ? brain.card.label : 'Not picked yet'}
        </LabeledList.Item>
        {brain && brain.feelings.size > 0 && (
          <LabeledList.Item label="Feels">
            {[...brain.feelings.entries()].map(([name, feeling]) => (
              <Box key={name} color={feeling.score > 0 ? 'good' : 'bad'}>
                {name}: {describeFeeling(brain, name)}
                {feeling.why ? ` (${feeling.why})` : ''}
              </Box>
            ))}
          </LabeledList.Item>
        )}
        <LabeledList.Item label="Location">
          {npc.location || 'Unknown'} ({npc.place_kind})
        </LabeledList.Item>
        <LabeledList.Item label="Doing">
          {npc.doing || 'Nothing in particular (wandering)'}
        </LabeledList.Item>
        <LabeledList.Item label="Can see">
          {[
            ...(npc.people_in_view ?? []).map(
              (person) =>
                `${person.name}${person.job ? `, ${person.job}` : ''} (${person.handle})`,
            ),
            ...(npc.things_in_view ?? []).map((thing) =>
              thing.count > 1 ? `${thing.name} x${thing.count}` : thing.name,
            ),
          ].join(', ') || <Box color="label">Nothing of note.</Box>}
        </LabeledList.Item>
        {/janitor|custodian/i.test(npc.job) && (
          <LabeledList.Item label="Can clean with">
            {npc.cleaning_tool || <Box color="bad">Nothing</Box>}
          </LabeledList.Item>
        )}
        {npc.post && (
          <LabeledList.Item label="Post">
            {npc.post}
            {npc.order_pending ? ' (a crate is on order)' : ''}
            {npc.crate_waiting
              ? ` (${npc.crate_waiting} waiting on the shuttle)`
              : ''}
          </LabeledList.Item>
        )}
        {brain && brain.tasks.length > 0 && (
          <LabeledList.Item label="Tasks">
            {shownTasks(brain.tasks).map((task) => (
              <Box
                key={task.id}
                color={
                  task.state === 'done'
                    ? 'good'
                    : task.state === 'blocked'
                      ? 'average'
                      : undefined
                }
              >
                {task.state === 'done'
                  ? 'Done'
                  : task.state === 'blocked'
                    ? 'Waiting'
                    : 'To do'}
                {task.urgency === 'routine' ? '' : ` (${task.urgency})`}:{' '}
                {describeTask(brain, task)}
                {task.blockedOn ? `. ${task.blockedOn}` : ''}
              </Box>
            ))}
            {brain.tasks.length > shownTasks(brain.tasks).length && (
              <Box color="label">
                and {brain.tasks.length - shownTasks(brain.tasks).length} more
                waiting on something
              </Box>
            )}
          </LabeledList.Item>
        )}
        <LabeledList.Item label="Remembers">
          {brain
            ? `${brain.places.size} places, ${brain.people.size} people, ${[...brain.places.values()].reduce((total, place) => total + place.storage.size, 0)} containers`
            : 'Nothing yet'}
        </LabeledList.Item>
        <LabeledList.Item label="Brain">
          {brain ? BRAIN_STATUS_TEXT[brain.status] : 'Idle'}
        </LabeledList.Item>
        <LabeledList.Item label="Last step">
          {brain?.lastRoutine ? (
            <>
              <Box color="label">
                {brain.lastRoutine.time}, taken by code, with no LLM call:
              </Box>
              <Box>{brain.lastRoutine.text}</Box>
              <Box color="good">{brain.lastRoutine.act}</Box>
            </>
          ) : (
            'None yet'
          )}
        </LabeledList.Item>
        <LabeledList.Item label="Last thing said">
          {decision ? (
            <>
              <Box color="label">
                {decision.time}, took {(decision.ms / 1000).toFixed(1)}s
                {decision.promptTokens
                  ? `, prompt ${decision.promptTokens} tokens`
                  : ''}
                , in response to:
              </Box>
              <Box style={{ whiteSpace: 'pre-wrap' }}>{decision.trigger}</Box>
              {decision.error ? (
                <Box color="bad">LLM call failed: {decision.error}</Box>
              ) : (
                <Box color="good" style={{ whiteSpace: 'pre-wrap' }}>
                  {decision.calls.length > 0
                    ? decision.calls.join('\n')
                    : 'Chose to do nothing.'}
                </Box>
              )}
            </>
          ) : (
            <Box color="label">None yet.</Box>
          )}
        </LabeledList.Item>
        <LabeledList.Item label="Notes">
          {brain && brain.notes.length > 0 ? (
            brain.notes.map((note, index) => <Box key={index}>{note}</Box>)
          ) : (
            <Box color="label">None yet.</Box>
          )}
        </LabeledList.Item>
      </LabeledList>
      {decision && (
        <Collapsible
          title={`Everything the LLM was sent for that decision (${decision.sent.length} messages)`}
        >
          {decision.sent.map((message, index) => (
            <Box key={index} mb={1}>
              <Box color="label">{message.role}</Box>
              <Box style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Box>
            </Box>
          ))}
        </Collapsible>
      )}
      <Box bold mt={1} mb={0.5}>
        Sense events
      </Box>
      {newestFirst.length === 0 && (
        <Box color="label">No sense events yet.</Box>
      )}
      <Stack vertical>
        {newestFirst.map((event) => (
          <Stack.Item key={event.seq}>
            <Box inline color="label" mr={1}>
              #{event.seq} {event.time}
            </Box>
            {event.text}
          </Stack.Item>
        ))}
      </Stack>
    </Section>
  );
};

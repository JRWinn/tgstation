/**
 * Everything the window knows about one NPC, for looking into why it did what it did: what it can
 * see, its tasks, what the LLM was asked and sent, and the sense events behind it all. The window
 * shows this for one NPC at a time, and only when asked.
 */
import {
  Box,
  Button,
  Collapsible,
  LabeledList,
  Section,
  Stack,
} from 'tgui-core/components';

import { describeFeeling } from './relationships';
import { describeTask } from './tasks';
import type { Npc, NpcBrain, Task } from './types';

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

export const NpcDetails = (props: {
  npc: Npc;
  brain?: NpcBrain;
  onClose: () => void;
}) => {
  const { npc, brain, onClose } = props;
  const newestFirst = [...npc.events].reverse();
  const decision = brain?.lastDecision;

  return (
    <Section
      title={`${npc.name}${npc.job ? `, ${npc.job}` : ''} (${npc.id})`}
      buttons={
        <>
          <Box inline mr={1} color={npc.awake ? 'good' : 'bad'}>
            {npc.awake ? 'Sensing' : 'Not sensing'}
          </Box>
          <Button icon="times" onClick={onClose}>
            Close details
          </Button>
        </>
      }
    >
      <LabeledList>
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
            {npc.held_crates?.length
              ? ` (holding ${npc.held_crates.map((crate) => `#${crate.number}`).join(', ')} for collection)`
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
        <LabeledList.Item label="Last choice">
          {brain?.lastChoice ? (
            <>
              <Box color="label">
                {brain.lastChoice.time}, asked of the LLM, took{' '}
                {(brain.lastChoice.ms / 1000).toFixed(1)}s
                {brain.lastChoice.promptTokens
                  ? `, prompt ${brain.lastChoice.promptTokens} tokens`
                  : ''}
                :
              </Box>
              <Box style={{ whiteSpace: 'pre-wrap' }}>
                {brain.lastChoice.asked}
              </Box>
              {brain.lastChoice.error && (
                <Box color="bad">LLM call failed: {brain.lastChoice.error}</Box>
              )}
              <Box color="good">{brain.lastChoice.outcome}</Box>
            </>
          ) : (
            <Box color="label">
              None yet. It is asked when there is more than one job to pick
              from.
            </Box>
          )}
        </LabeledList.Item>
        <LabeledList.Item label="Last LLM reply">
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
          title={`Everything the LLM was sent for that reply (${decision.sent.length} messages)`}
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

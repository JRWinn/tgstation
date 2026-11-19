import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { Box, Button, Icon, NoticeBox, Section } from 'tgui-core/components';

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
import {
  cardColor,
  cardColorsByName,
  departmentColor,
  sortLockedRooms,
} from './colors';
import { NpcDetails } from './Details';
import { setStationPlaces } from './memory';
import { describeTask } from './tasks';
import type { CarriedItem, Data, LockedRoom, Npc, NpcBrain } from './types';

const OLLAMA_CHECK_TIMEOUT_MS = 5000;
/** How many NPCs are shown side by side. */
const CARDS_PER_ROW = 5;
/** The colour of a tool of the NPC's trade, and of the key that says so. */
const TRADE_COLOR = '#ffc94d';

type LlmStatus =
  | { state: 'checking' }
  | { state: 'ok'; models: string[] }
  | { state: 'error'; message: string };

async function fetchOllamaModels(): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_CHECK_TIMEOUT_MS);
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
  /** The NPC whose full details are open underneath the cards, if any. */
  const [detailsOf, setDetailsOf] = useState<string | null>(null);
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

  const detailed = npcs.find((npc) => npc.id === detailsOf);

  return (
    <Window title="Crew Brain" width={1360} height={780}>
      <Window.Content scrollable>
        <StatusBar status={llm} crew={npcs.length} onCheck={checkLlm} />
        {npcs.length === 0 && (
          <NoticeBox>You do not own any crew NPCs right now.</NoticeBox>
        )}
        <div style={GRID_STYLE}>
          {npcs.map((npc) => (
            <NpcCard
              key={npc.id}
              npc={npc}
              brain={getBrain(npc.id)}
              detailsOpen={npc.id === detailsOf}
              onDetails={() =>
                setDetailsOf(npc.id === detailsOf ? null : npc.id)
              }
            />
          ))}
        </div>
        {detailed && (
          <Box mt={1}>
            <NpcDetails
              npc={detailed}
              brain={getBrain(detailed.id)}
              cardColors={cardColorsByName(npcs)}
              onClose={() => setDetailsOf(null)}
            />
          </Box>
        )}
        <Box mt={1}>
          <LockedRooms rooms={data.locked_rooms} />
        </Box>
      </Window.Content>
    </Window>
  );
};

const GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${CARDS_PER_ROW}, minmax(0, 1fr))`,
  gap: '8px',
  alignItems: 'stretch',
};

const BAR_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '4px 8px',
  marginBottom: '8px',
  background: 'rgba(0, 0, 0, 0.33)',
  borderRadius: '4px',
};

/** One line across the top: whether the LLM can be reached, how many crew there are, and the colour key. */
const StatusBar = (props: {
  status: LlmStatus;
  crew: number;
  onCheck: () => void;
}) => {
  const { status, crew, onCheck } = props;
  return (
    <div style={BAR_STYLE}>
      <LlmStatusLine status={status} />
      <Box color="label">
        {crew} crew. They think only while this window is open.
      </Box>
      <Box style={{ marginLeft: 'auto' }}>
        <span style={TRADE_CHIP_STYLE}>Gold</span>
        <Box inline color="label">
          is a tool of their trade
        </Box>
      </Box>
      <Button icon="sync" onClick={onCheck}>
        Check LLM
      </Button>
    </div>
  );
};

const LlmStatusLine = (props: { status: LlmStatus }) => {
  const { status } = props;
  switch (status.state) {
    case 'checking':
      return (
        <Box color="average">
          <Icon name="circle-notch" spin mr={1} />
          Checking for Ollama…
        </Box>
      );
    case 'ok':
      return (
        <Box color="good">
          <Icon name="circle" mr={1} />
          Ollama ready, using {getModel()}
        </Box>
      );
    case 'error':
      return (
        <Box color="bad">
          <Icon name="triangle-exclamation" mr={1} />
          Could not reach Ollama at {OLLAMA_URL} ({status.message})
        </Box>
      );
  }
};

/** What the dot beside an NPC's name says about its brain: the words, and the colour. */
function brainState(
  npc: Npc,
  brain?: NpcBrain,
): { text: string; color: string; busy: boolean } {
  if (!npc.awake) {
    return { text: 'Not sensing', color: 'bad', busy: false };
  }
  switch (brain?.status) {
    case 'thinking':
      return { text: 'Asking the LLM', color: 'blue', busy: true };
    case 'queued':
      return { text: 'Waiting for the LLM', color: 'average', busy: false };
    default:
      return { text: 'Ready', color: 'good', busy: false };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the body is in the middle of, in a few words. */
function describeDoing(npc: Npc): string {
  if (npc.doing) {
    return capitalize(npc.doing);
  }
  return npc.resting ? 'Taking a break' : 'Nothing in particular';
}

/**
 * What is on the NPC's mind: the reasoning behind the step it last took, and, if it picked one job
 * over the others on its list, which and why.
 */
function describeThinking(brain?: NpcBrain): { step: string; why: string } {
  if (!brain) {
    return { step: '', why: '' };
  }
  const choice = brain.choice;
  const chosen = choice?.why
    ? brain.tasks.find(
        (task) => task.id === choice.task && task.state !== 'done',
      )
    : undefined;
  return {
    step: brain.lastRoutine?.text ?? '',
    why:
      choice && chosen
        ? `Chose to ${describeTask(brain, chosen)} first: "${choice.why}"`
        : '',
  };
}

const CARD_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.33)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '4px',
  padding: '8px',
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const CARD_OPEN_STYLE: CSSProperties = {
  ...CARD_STYLE,
  border: '1px solid rgba(255, 255, 255, 0.45)',
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '6px',
  paddingBottom: '6px',
  marginBottom: '2px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
};

const NpcCard = (props: {
  npc: Npc;
  brain?: NpcBrain;
  detailsOpen: boolean;
  onDetails: () => void;
}) => {
  const { npc, brain, detailsOpen, onDetails } = props;
  const state = brainState(npc, brain);
  const thinking = describeThinking(brain);
  const inventory = npc.inventory ?? [];
  const inHands = inventory.filter((item) => item.where === 'hand');
  const carried = inventory.filter((item) => item.where !== 'hand');

  return (
    <div style={detailsOpen ? CARD_OPEN_STYLE : CARD_STYLE}>
      <div style={HEADER_STYLE}>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Box bold fontSize="15px" color={cardColor(npc)}>
            {npc.name}
          </Box>
          <Box color={cardColor(npc)}>{npc.job || 'No job'}</Box>
          <Box color="label">{brain?.card.label ?? 'No personality yet'}</Box>
        </Box>
        <Box textAlign="right">
          <Button
            icon="magnifying-glass"
            selected={detailsOpen}
            tooltip="Everything about this one: tasks, what the LLM was sent, sense events"
            onClick={onDetails}
          />
          <Box color={state.color} fontSize="11px" mt={0.5}>
            <Icon
              name={state.busy ? 'circle-notch' : 'circle'}
              spin={state.busy}
            />{' '}
            {state.text}
          </Box>
        </Box>
      </div>

      <Field icon="location-dot" label="Where">
        <Box bold>{npc.location || 'Unknown'}</Box>
      </Field>

      <Field icon="person-walking" label="Doing">
        {describeDoing(npc)}
      </Field>

      <Field icon="brain" label="Thinking">
        {thinking.step ? (
          <Clamped text={thinking.step} lines={6} />
        ) : (
          <Box color="label">Nothing yet</Box>
        )}
        {thinking.why && (
          <Box color="label" mt={0.5}>
            <Clamped text={thinking.why} lines={3} />
          </Box>
        )}
      </Field>

      <Field icon="comment" label="Last said" time={brain?.lastSaid?.time}>
        {brain?.lastSaid ? (
          <Box italic>
            <Clamped text={`"${brain.lastSaid.text}"`} lines={4} />
          </Box>
        ) : (
          <Box color="label">Nothing yet</Box>
        )}
      </Field>

      <Field icon="check" label="Last job" time={brain?.lastJob?.time}>
        {brain?.lastJob ? (
          <Clamped text={capitalize(brain.lastJob.what)} lines={3} />
        ) : (
          <Box color="label">None finished yet</Box>
        )}
      </Field>

      <Field icon="hand" label="Holding">
        <ItemChips items={inHands} empty="Empty hands" />
      </Field>

      <Field icon="box-open" label="Inventory">
        <ItemChips items={carried} empty="Nothing" />
      </Field>
    </div>
  );
};

const ROOMS_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${CARDS_PER_ROW}, minmax(0, 1fr))`,
  gap: '8px 16px',
  overflowWrap: 'anywhere',
};

/**
 * The rooms that are locked to the crew at large and that at least one of these NPCs is allowed
 * into, each with who. The room's name is in its department's colour. The names under it are not
 * coloured: it is the room that is being looked up here, not the people.
 */
const LockedRooms = (props: { rooms?: LockedRoom[] | null }) => {
  const { rooms } = props;
  return (
    <Section title="Locked rooms">
      {!rooms ? (
        <Box color="label">Still working out which rooms are locked.</Box>
      ) : rooms.length === 0 ? (
        <Box color="label">No locked room has anyone allowed in yet.</Box>
      ) : (
        <div style={ROOMS_STYLE}>
          {sortLockedRooms(rooms).map((room) => (
            <div key={room.name} style={{ minWidth: 0 }}>
              <Box bold color={departmentColor(room.department)}>
                {room.name}
              </Box>
              <Box>{room.allowed.join(', ')}</Box>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
};

const LABEL_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '10px',
  fontWeight: 'bold',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '2px',
};

/** One labelled piece of what is known about an NPC, with the time it dates from if it has one. */
const Field = (props: {
  icon: string;
  label: string;
  time?: string;
  children: ReactNode;
}) => {
  const { icon, label, time, children } = props;
  return (
    <Box mt={1}>
      <Box color="label" style={LABEL_STYLE}>
        <span>
          <Icon name={icon} mr={0.5} />
          {label}
        </span>
        {time && <span style={{ fontWeight: 'normal' }}>{time}</span>}
      </Box>
      {children}
    </Box>
  );
};

/** Text cut off after so many lines, so that one long line does not stretch a whole row of cards. Hover for the rest. */
const Clamped = (props: { text: string; lines: number }) => (
  <div
    title={props.text}
    style={{
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: props.lines,
      overflow: 'hidden',
    }}
  >
    {props.text}
  </div>
);

const CHIP_STYLE: CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  margin: '0 3px 3px 0',
  borderRadius: '3px',
  border: '1px solid transparent',
  background: 'rgba(255, 255, 255, 0.08)',
  lineHeight: '1.4',
};

const TRADE_CHIP_STYLE: CSSProperties = {
  ...CHIP_STYLE,
  color: TRADE_COLOR,
  fontWeight: 'bold',
  background: 'rgba(255, 201, 77, 0.14)',
  border: '1px solid rgba(255, 201, 77, 0.6)',
};

/** Clothing is the least of what a body has on it, so it is shown faintest. */
const WORN_CHIP_STYLE: CSSProperties = {
  ...CHIP_STYLE,
  color: 'rgba(255, 255, 255, 0.5)',
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.12)',
};

const WHERE_TEXT: Record<CarriedItem['where'], string> = {
  hand: 'In hand',
  stowed: 'Put away',
  worn: 'Worn',
};

const ItemChip = (props: { item: CarriedItem }) => {
  const { item } = props;
  const style = item.trade
    ? TRADE_CHIP_STYLE
    : item.where === 'worn'
      ? WORN_CHIP_STYLE
      : CHIP_STYLE;
  return (
    <span
      style={style}
      title={`${WHERE_TEXT[item.where]}${item.trade ? ', a tool of their trade' : ''}`}
    >
      {item.name}
      {item.count > 1 ? ` ×${item.count}` : ''}
    </span>
  );
};

/** A row of things, the tools of the trade first so that they are found at a glance. */
const ItemChips = (props: { items: CarriedItem[]; empty: string }) => {
  const { items, empty } = props;
  if (items.length === 0) {
    return <Box color="label">{empty}</Box>;
  }
  const tradeFirst = [
    ...items.filter((item) => item.trade),
    ...items.filter((item) => !item.trade),
  ];
  return (
    <div>
      {tradeFirst.map((item) => (
        <ItemChip key={`${item.where}:${item.name}`} item={item} />
      ))}
    </div>
  );
};

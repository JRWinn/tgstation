// What the tests against the real model share: the rooms of a small station, a few people, brains
// set up the way the game would have them, and the one way of calling the model.
export const ROOT = `${import.meta.dir}/../../tgui/packages/tgui/interfaces/CrewBrain/`;
const { observe, recordKnownPlaces, setStationPlaces } = await import(ROOT + 'memory');
const { syncTasks } = await import(ROOT + 'tasks');
export const { PERSON_CARDS } = await import(ROOT + 'person');
// Crew know their way around: these are the rooms aboard.
setStationPlaces(['Arrival Shuttle Hallway', 'Central Primary Hallway', 'Bar', 'Kitchen', 'Medbay Central', 'Engineering', 'Bridge', 'Custodial Closet', 'Cargo Lobby', 'Cargo Bay', 'Library', 'Dormitories', 'Security Office', 'Chapel', 'Aft Maintenance']);

export const MODEL = process.env.MODEL ?? 'qwen3.5:9b';

/**
 * Sends one call to the model. The context size is the game's own: with any other, Ollama reloads
 * the model each time the game and a test take turns, which slows both to a crawl.
 */
export async function ask(messages: any[], schema: object, maxTokens = 600): Promise<{ text: string; promptTokens: number; replyTokens: number; ms: number }> {
  const started = Date.now();
  const response = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, think: false, keep_alive: '30m', options: { temperature: 0.7, num_predict: maxTokens, num_ctx: 8192 }, format: schema, messages }) });
  const body: any = await response.json();
  if (!response.ok) throw new Error(`Ollama answered with HTTP ${response.status}: ${body.error ?? 'no details given'}`);
  return { text: String(body.message?.content ?? ''), promptTokens: body.prompt_eval_count ?? 0, replyTokens: body.eval_count ?? 0, ms: Date.now() - started };
}

export function makeBrain(name: string, job: string) {
  return { name, job, location: '', placeKind: 'room', resting: false, exploredEverything: false, storageHere: 0, cleaningTool: null, poorTool: false, workDone: {}, workReported: {}, mustSayExact: false, meetingOrderedBy: null, lateWork: {}, cleanableMesses: [], messPlaces: [], workablePlaces: [], mopNeedsWater: false, sinkInView: false, shutIn: false, doorOpen: false, tryLeavingAt: 0, nextRemarkAt: 0, doorHeld: false, doorHeldOut: false, atDoorOf: null, cameFrom: null, letInBy: null, inTheWay: null, doorAsked: null, letInAsks: {}, saidLately: [], tidyTodo: 0, freight: null, mailTold: {}, strangers: {}, workmates: new Set(), sentFor: {}, challenged: null, vouchAsked: null, verifyHeard: null, workmateCalled: false, inHand: false, outOfBounds: false, openDoorTries: 0, mustSayNeeds: null, mustSayIf: null, areaMesses: {}, janitorsOnPda: [], office: null, meetingRoom: null, pdaPeople: [], crateToReturn: false, bornAt: 0, toldHeadAt: null, suppliesAt: null, summons: null, asks: [], meeting: null, nextMeetingAt: 0, metOnce: false, requisition: null, blockedPlaces: [], janitorCalls: {}, askedCargo: false, askedCargoAt: 0, suppliesSentAt: null, grenadeMesses: 0, dryMop: false, doing: null, toldOfMess: new Map(), hasLocator: true, locatorUsed: true, supplyPlaces: ['Custodial Closet'], supplyPlacesSearched: new Set(['Custodial Closet']), post: null, orderable: [], orderPending: false, hasPda: true, notices: [], heldCrates: [], heldCheckDue: false, pickupAsked: null, pickups: [], pickupTurn: 0, holding: [], peopleInView: [], thingsInView: [], places: new Map(), people: new Map(), feelings: new Map(), tasks: [], nextTaskId: 1, notes: [], talkLog: [], remarkDue: false, remarksUnanswered: 0, inPlaceSince: 0, driveAfter: 0, lastAct: null, choice: null, choosing: null, lastChoiceAt: 0, doorReached: null, doorHeldFor: null, lookInRooms: [], closedRooms: [], lookedIn: {}, lastArrivalAt: 0, knockAt: null, handles: {}, inTalkWith: null, toTell: [], outAsks: null, fireDoors: null, alarmResets: {}, fireClosed: {}, failures: new Map(), mustSay: null, sayingNow: false, heldSince: 0, lastSpokenToAt: 0, status: 'idle', awake: true, walking: false, now: 0, card: PERSON_CARDS[0] } as any;
}
/** Puts a brain in a room at a time, seeing these people and things, as a look at the world from the server would. */
export function at(b: any, now: number, location: string, people: any[] = [], things: any[] = []) {
  if (b.location !== location) b.inPlaceSince = now;
  b.location = location; b.placeKind = /Hallway/.test(location) ? 'hallway' : /Maintenance/.test(location) ? 'maintenance' : 'room'; b.peopleInView = people; b.thingsInView = things; b.now = now;
  observe(b, { awake: 1, location, people_in_view: people, things_in_view: things } as any, now);
  syncTasks(b);
}
export const know = (b: any, places: string[]) => recordKnownPlaces(b, { seq: 0, time: '', at: 100, kind: 'knowledge', text: '', details: { places: places.map((place) => ({ place, things: [] })) } } as any);
export const zim = { handle: 'p1', name: 'Zim Fire', job: 'Head of Personnel' };
export const donna = { handle: 'p2', name: 'Donna Sholl', job: 'Cargo Technician' };
export const tolly = { handle: 'p3', name: 'Tolly Field', job: 'Janitor' };
export const says = (who: any, text: string, tiles = 1) => `[22:40:32] ${who.name} says: "${text}" (person ${who.handle}, ${tiles} tiles away)`;
export const CRATE = 'Janitorial Supplies Crate';
export function tech() { const b = makeBrain('Donna Sholl', 'Cargo Technician'); b.post = 'Cargo Bay'; b.orderable = [CRATE]; know(b, ['Cargo Bay', 'Cargo Lobby']); at(b, 3000, 'Cargo Bay', [zim]); return b; }
export function janitor(tool: string | null = 'soap') { const b = makeBrain('Tolly Field', 'Janitor'); know(b, ['Cargo Lobby', 'Bar', 'Medbay Central', 'Custodial Closet']); if (tool) { b.cleaningTool = tool; b.holding = [tool]; } at(b, 3000, 'Central Primary Hallway', [zim]); return b; }

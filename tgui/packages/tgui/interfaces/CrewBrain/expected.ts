/**
 * Who a department is expecting, and in which room.
 *
 * A room locked to the crew is locked for a reason, so nobody is let into one for the asking.
 * Someone is let in because they were sent for: a janitor called to a mess there. The call is the
 * permission. This is the department's record of those calls, the clipboard by the counter that
 * everyone who works there can read. It is what lets a second technician open the door to a
 * janitor the first one sent for, without having to ask.
 *
 * It is kept per department, under the name of the department's post, and shared by every NPC in
 * this window that works there. It also keeps who has been let in and has not yet been let out,
 * so that nobody is forgotten behind a door they cannot open.
 */

/** One person a department has sent for. Times are server time. */
export type Expected = {
  /** The department, by the name of its post. */
  post: string;
  name: string;
  /** The room they were sent for to. */
  room: string;
  /** Who sent for them. */
  by: string;
  at: number;
  /** TRUE once they have been let into the room, until they are let out of it. */
  inside?: boolean;
};

/** How long (deciseconds) a call stands as a reason to let someone in. */
const EXPECTED_DS = 12000;

let list: Expected[] = [];

/** Forgets everyone. Called when the window closes. */
export function clearExpected(): void {
  list = [];
  taken.length = 0;
}

function current(now: number): Expected[] {
  list = list.filter((entry) => entry.inside || now - entry.at < EXPECTED_DS);
  return list;
}

/** Notes that a department has sent for someone to one of its rooms. */
export function expectSomeone(
  post: string,
  name: string,
  room: string,
  by: string,
  now: number,
): void {
  const entry = current(now).find(
    (it) => it.post === post && it.name === name && it.room === room,
  );
  if (entry) {
    entry.at = now;
    entry.by = by;
    return;
  }
  list.push({ post, name, room, by, at: now });
}

/** The call that has this person expected by this department, in this room if one is given, or undefined. */
export function expectedCall(
  post: string,
  name: string,
  now: number,
  room?: string,
): Expected | undefined {
  return current(now).find(
    (it) =>
      it.post === post &&
      it.name === name &&
      (room === undefined || it.room === room),
  );
}

/** Everyone this department is expecting at this room and has not yet let in. */
export function expectedAt(post: string, room: string, now: number): Expected[] {
  return current(now).filter(
    (it) => it.post === post && it.room === room && !it.inside,
  );
}

/** Notes that someone has been let into a room, so that someone remembers to let them out. */
export function noteLetIn(
  post: string,
  name: string,
  room: string,
  by: string,
  now: number,
): void {
  expectSomeone(post, name, room, by, now);
  const entry = expectedCall(post, name, now, room);
  if (entry) {
    entry.inside = true;
  }
}

/** Notes that someone is out of the department's rooms again, and is expected no longer. */
export function noteLetOut(post: string, name: string): void {
  list = list.filter((it) => !(it.post === post && it.name === name));
}

/** The people this department has let into this room who are still in there, as far as it knows. */
export function stillInside(post: string, room: string, now: number): Expected[] {
  return current(now).filter(
    (it) => it.post === post && it.room === room && !!it.inside,
  );
}

/** Who has asked a department to order something, and which of those who work there has taken it. Times are server time. */
const taken: { post: string; asker: string; by: string; at: number }[] = [];
/** How long (deciseconds) one asking is one asking. Asked again after this, it is a new order. */
const ONE_ASKING_DS = 1200;

/**
 * Takes an order for this NPC, if nobody else at its post has taken the same asking already. Two
 * who both hear someone ask would otherwise both order, and two crates come where one was wanted.
 * Returns TRUE if the order is this NPC's to place.
 */
export function takeOrder(
  post: string,
  asker: string,
  by: string,
  now: number,
): boolean {
  const claim = taken.find(
    (it) =>
      it.post === post && it.asker === asker && now - it.at < ONE_ASKING_DS,
  );
  if (claim) {
    return claim.by === by;
  }
  taken.push({ post, asker, by, at: now });
  return true;
}

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
/**
 * How long (deciseconds) a note that someone is inside stands with nothing to renew it: the long
 * stop for one who left unseen, by a door someone else opened. Kept for the round, it had the door
 * tried for them and orders stopped at the post for good (CARGO-09). Being let in again renews it.
 */
const INSIDE_DS = 18000;

let list: Expected[] = [];
/** When each room was last let out of, by post and room (server time). See lastLetOutAt. */
const letOutAt = new Map<string, number>();

/** Forgets everyone. Called when the window closes. */
export function clearExpected(): void {
  list = [];
  letOutAt.clear();
  taken.length = 0;
}

function current(now: number): Expected[] {
  list = list.filter(
    (entry) => now - entry.at < (entry.inside ? INSIDE_DS : EXPECTED_DS),
  );
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

/**
 * Notes that someone is out of the department's rooms again. A call to another of its rooms that
 * they have not yet been let into still stands: sent for to two rooms, they are not turned away
 * from the second for having finished in the first.
 */
export function noteLetOut(
  post: string,
  name: string,
  room?: string,
  now?: number,
  outOf?: string,
): void {
  // When someone was last let out of each room, so that a knock from inside that room from
  // before then is spent for every technician, not only the one who opened it (LOGA-04): the room
  // named, the room the door was opened out of, and every room they were down as inside.
  if (now !== undefined) {
    const rooms = new Set<string>();
    if (room !== undefined) {
      rooms.add(room);
    }
    if (outOf !== undefined) {
      rooms.add(outOf);
    }
    for (const it of list) {
      if (
        it.post === post &&
        it.name === name &&
        it.inside &&
        (room === undefined || it.room === room)
      ) {
        rooms.add(it.room);
      }
    }
    for (const each of rooms) {
      letOutAt.set(`${post}\n${each}`, now);
    }
  }
  // Out of one room, if it is said which: someone seen to have left the bay may still be in the
  // room beyond it, and striking them from both leaves them behind a door nobody knows to open.
  // Only the note that they are inside is struck. The call that brought them stands for as long
  // as any call does: a janitor who stepped out with the mess still there, for water or by a
  // door that happened to open, was told on coming back that nobody had sent for it. Whether
  // there is still a mess to let them in for is asked when they ask: see mayPass in jobs/cargo.ts.
  for (const it of list) {
    if (
      it.post === post &&
      it.name === name &&
      it.inside &&
      (room === undefined || it.room === room)
    ) {
      it.inside = false;
    }
  }
}

/** When (server time) this department last let someone out of this room, or -Infinity. */
export function lastLetOutAt(post: string, room: string): number {
  return letOutAt.get(`${post}\n${room}`) ?? -Infinity;
}

/**
 * Strikes someone off the department's list altogether: every call that had them expected, and
 * any note of their being inside. Someone ordered out by a superior is not let back in on the
 * strength of the call that brought them.
 */
export function forgetExpected(post: string, name: string): void {
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

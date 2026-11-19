/**
 * The colours the window shows people and rooms in. A body's name and job are shown in the colour
 * of its own ID card, which the server sends. A locked room's name is shown in the colour of the
 * department it belongs to. None of this goes to the LLM.
 */
import type { LockedRoom, Npc } from './types';

/**
 * How light a colour has to be to be read as text on the window's dark background: its relative
 * luminance, from 0 for black to 1 for white. This comes to a contrast of about 4.5 to 1 against
 * a card. The game's command blue and security red are both well under it.
 */
const MIN_LUMINANCE = 0.22;

/** How much lighter a colour is made at each try, as a share of the whole way from black to white. */
const LIGHTEN_STEP = 0.02;

/**
 * The colour of each department's rooms, by the key the server sends for a room. These are the
 * colours the game puts on that department's ID cards (`code/__DEFINES/colors.dm`), so that a
 * room and the people who work in it are one colour: the Bar and the bartender, the Brig and the
 * officer. The game's other set of department colours, for its own windows, is not these.
 */
const DEPARTMENT_COLORS: Record<string, string> = {
  command: '#1B67A5',
  security: '#CB0000',
  engineering: '#FFA62B',
  medical: '#5B97BC',
  science: '#C96DBF',
  cargo: '#B18644',
  service: '#58C800',
};

/** The order departments are listed in. A room that is no department's comes after them all. */
const DEPARTMENT_ORDER = Object.keys(DEPARTMENT_COLORS);

type Rgb = [red: number, green: number, blue: number];

/** Reads "#RRGGBB" or "#RGB", with or without an alpha part after it. Null for anything else. */
function parseHex(hex: string): Rgb | null {
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(
    hex.trim(),
  );
  if (long) {
    return [
      Number.parseInt(long[1], 16),
      Number.parseInt(long[2], 16),
      Number.parseInt(long[3], 16),
    ];
  }
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(
    hex.trim(),
  );
  if (short) {
    return [
      Number.parseInt(short[1] + short[1], 16),
      Number.parseInt(short[2] + short[2], 16),
      Number.parseInt(short[3] + short[3], 16),
    ];
  }
  return null;
}

function toHex([red, green, blue]: Rgb): string {
  return `#${[red, green, blue]
    .map((part) => Math.round(part).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** How light a colour looks, from 0 for black to 1 for white, as contrast is worked out from. */
function luminance(color: Rgb): number {
  const [red, green, blue] = color.map((part) => {
    const share = part / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** A colour as its hue (0 to 360), how strong it is, and how light it is (both 0 to 1). */
function toHsl([red, green, blue]: Rgb): [number, number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const most = Math.max(r, g, b);
  const least = Math.min(r, g, b);
  const lightness = (most + least) / 2;
  const spread = most - least;
  if (spread === 0) {
    return [0, 0, lightness];
  }
  const saturation = spread / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (most === r) {
    hue = ((g - b) / spread) % 6;
  } else if (most === g) {
    hue = (b - r) / spread + 2;
  } else {
    hue = (r - g) / spread + 4;
  }
  return [(hue * 60 + 360) % 360, saturation, lightness];
}

function fromHsl(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = lightness - chroma / 2;
  const [r, g, b] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  return [(r + base) * 255, (g + base) * 255, (b + base) * 255];
}

/**
 * Returns a colour as it can be read on the window's dark background: as it is if it is light
 * enough, and otherwise the same hue made lighter until it is. The game's own colours are left
 * alone: an ID card's stripe is painted on a light card, and this is text on a dark one.
 * Undefined for anything that is not a colour, so that the text falls back to its usual colour.
 */
export function readable(hex?: string | null): string | undefined {
  const color = hex ? parseHex(hex) : null;
  if (!color) {
    return undefined;
  }
  if (luminance(color) >= MIN_LUMINANCE) {
    return toHex(color);
  }
  const [hue, saturation, lightness] = toHsl(color);
  let lighter = color;
  for (let now = lightness; now < 1; now += LIGHTEN_STEP) {
    lighter = fromHsl(hue, saturation, Math.min(now, 1));
    if (luminance(lighter) >= MIN_LUMINANCE) {
      break;
    }
  }
  return toHex(lighter);
}

/** The colour an NPC's name and job are shown in: that of its own ID card, or undefined if it has none. */
export function cardColor(npc: Npc): string | undefined {
  return readable(npc.card_color);
}

/**
 * The card colour of each of the owner's NPCs, by name, for colouring a name where it turns up in
 * what another NPC sees or feels. Anyone else is not in it, and is shown in the usual colour.
 */
export function cardColorsByName(npcs: Npc[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const npc of npcs) {
    const color = cardColor(npc);
    if (color) {
      colors.set(npc.name, color);
    }
  }
  return colors;
}

/** The colour a room's name is shown in: its department's, or undefined for a room that is no department's. */
export function departmentColor(
  department?: string | null,
): string | undefined {
  return department ? readable(DEPARTMENT_COLORS[department]) : undefined;
}

/** Locked rooms in the order they are listed: by department, then by name. */
export function sortLockedRooms(rooms: LockedRoom[]): LockedRoom[] {
  const rank = (room: LockedRoom) => {
    const index = room.department
      ? DEPARTMENT_ORDER.indexOf(room.department)
      : -1;
    return index < 0 ? DEPARTMENT_ORDER.length : index;
  };
  return [...rooms].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
}

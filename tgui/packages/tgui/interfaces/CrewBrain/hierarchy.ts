/**
 * Who answers to whom aboard the station.
 *
 * Written down once, from the station's own table of jobs, so that nobody has to work it out
 * again. Every department has a head, the heads answer to the Captain, and everyone else answers
 * to the head of their department. It is what decides who an NPC takes its needs to, who it calls
 * to a meeting, and who cargo will take an order from.
 *
 * The server knows the same thing from the game's own job data, and says of each person in view
 * whether the NPC answers to them. This table is for when they are not in view: the PDA lists
 * people by name and job, and this says which of them is the NPC's head, or one of its staff.
 */

/** One department: who heads it, who works in it, and where its people meet. */
export type Department = {
  name: string;
  /** The job that heads it. */
  head: string;
  /** The jobs that answer to that head. */
  jobs: string[];
  /** The room its people are called to for a meeting, if one has been settled on. */
  meetsIn?: string;
};

export const DEPARTMENTS: Department[] = [
  {
    name: 'Command',
    head: 'Captain',
    jobs: [
      'Head of Personnel',
      'Head of Security',
      'Chief Engineer',
      'Research Director',
      'Chief Medical Officer',
      'Quartermaster',
    ],
  },
  {
    name: 'Service',
    head: 'Head of Personnel',
    jobs: [
      'Janitor',
      'Bartender',
      'Cook',
      'Botanist',
      'Assistant',
      'Clown',
      'Mime',
      'Chaplain',
      'Curator',
      'Lawyer',
      'Psychologist',
    ],
    meetsIn: 'Bar',
  },
  {
    name: 'Security',
    head: 'Head of Security',
    jobs: ['Warden', 'Security Officer', 'Detective', 'Prisoner'],
  },
  {
    name: 'Engineering',
    head: 'Chief Engineer',
    jobs: ['Station Engineer', 'Atmospheric Technician'],
  },
  {
    name: 'Science',
    head: 'Research Director',
    jobs: ['Geneticist', 'Scientist', 'Roboticist'],
  },
  {
    name: 'Medical',
    head: 'Chief Medical Officer',
    jobs: ['Medical Doctor', 'Paramedic', 'Chemist', 'Coroner'],
  },
  {
    name: 'Supply',
    head: 'Quartermaster',
    jobs: ['Cargo Technician', 'Shaft Miner', 'Bitrunner'],
  },
];

/** TRUE if a job title on an ID is this job. IDs sometimes dress a title up ("Custodian", "Senior Janitor"). */
function isJob(title: string, job: string): boolean {
  return title.toLowerCase().includes(job.toLowerCase());
}

/** The department a job is one of the rank and file of, if it is. */
function departmentOf(title: string): Department | undefined {
  return DEPARTMENTS.find((department) =>
    department.jobs.some((job) => isJob(title, job)),
  );
}

/** The department a job heads, if it heads one. The Captain heads Command. */
export function departmentHeadedBy(title: string): Department | undefined {
  return DEPARTMENTS.find((department) => isJob(title, department.head));
}

/** TRUE if this job is the Captain or a head of staff: someone cargo takes an order from. */
export function isHead(title: string): boolean {
  return !!departmentHeadedBy(title);
}

/** The job this one answers to, or null: the head of its department, and for a head, the Captain. */
export function headOf(title: string): string | null {
  return departmentOf(title)?.head ?? null;
}

/** TRUE if someone with this job answers to someone with that one: their own head, or the Captain. */
export function answersTo(title: string, toTitle: string): boolean {
  if (!title || !toTitle || isJob(title, 'Captain')) {
    return false;
  }
  const head = headOf(title);
  return isJob(toTitle, 'Captain') || (!!head && isJob(toTitle, head));
}

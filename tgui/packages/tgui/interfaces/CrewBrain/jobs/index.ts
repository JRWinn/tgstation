/**
 * The jobs NPCs can hold, and which one goes with a job title.
 *
 * To add a job: write its file in this folder and add it to JOBS.
 */
import { CARGO } from './cargo';
import { JANITOR } from './janitor';
import type { Job } from './job';

/** Every job with duties of its own. */
const JOBS: Job[] = [JANITOR, CARGO];

/** Crew whose job has not been given duties of its own: a person, free to walk the station. */
const CREW: Job = {
  is: () => true,
  keepsPost: false,
  cleans: false,
  rules: () => [],
  cues: () => [],
};

/** Returns the job that goes with the title written on an ID. */
export function jobFor(title: string): Job {
  return JOBS.find((job) => job.is(title)) ?? CREW;
}

export { isJanitor } from './janitor';
export type { Job } from './job';

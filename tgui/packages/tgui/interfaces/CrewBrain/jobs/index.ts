/**
 * The jobs NPCs can hold, and which one goes with a job title.
 *
 * To add a job: write its file in this folder and add it to JOBS.
 */
import { CARGO } from './cargo';
import { CHIEF_ENGINEER } from './chiefengineer';
import { ENGINEER } from './engineer';
import { HEAD_OF_PERSONNEL } from './head';
import { JANITOR } from './janitor';
import type { Job } from './job';
import { QUARTERMASTER } from './quartermaster';

/**
 * Every job with duties of its own. The Quartermaster comes before cargo: it is cargo staff as far
 * as anyone asking "who works in cargo" is concerned, and its job is not a technician's. Likewise
 * the Chief Engineer comes before the engineer: its title has "Engineer" in it.
 */
const JOBS: Job[] = [
  JANITOR,
  QUARTERMASTER,
  CARGO,
  HEAD_OF_PERSONNEL,
  CHIEF_ENGINEER,
  ENGINEER,
];

/** Crew whose job has not been given duties of its own: a person, free to walk the station. */
const CREW: Job = {
  is: () => true,
  keepsPost: false,
  cleans: false,
  about: () => '',
  cues: () => [],
};

/** Returns the job that goes with the title written on an ID. */
export function jobFor(title: string): Job {
  return JOBS.find((job) => job.is(title)) ?? CREW;
}

export { isJanitor } from './janitor';
export type { Job } from './job';

import { Option, Record } from 'effect'

const SUGGESTIONS: globalThis.Record<string, ReadonlyArray<string>> = {
  'github-tos': [
    'do I own the images I upload?',
    'can they delete my account without warning?',
    'can I sue them in court?',
    'do they collect biometric data?',
  ],
  'mozilla-privacy': [
    'can I turn off data collection?',
    'do they sell my personal data?',
    'what do advertisers learn about me?',
    'is there a signup fee?',
  ],
  'wikimedia-tou': [
    'who owns my contributions?',
    'can I be banned, and why?',
    'must I arbitrate disputes?',
    'can I scrape the site?',
  ],
  'news-wire': [
    'did oil prices change?',
    'how did China react to the blockade?',
    'which movie won best picture?',
    'was anyone hurt by the stray bullet?',
  ],
  'incident-log': [
    'what was the root cause of the outage?',
    'was the deploy responsible?',
    'when did errors first appear?',
    'who was paged and when?',
  ],
  'order-service': [
    'are there any security vulnerabilities?',
    'where could this code crash?',
    'what code is duplicated?',
    'is there any dead code?',
  ],
}

export const DEFAULT_DOC_ID = 'github-tos'

export const suggestionsFor = (docId: string): ReadonlyArray<string> =>
  Option.getOrElse(Record.get(SUGGESTIONS, docId), () => [])

import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'

import type { Doc, Search } from './domain'
import { initialModel } from './main'
import { DocListData, LoadedDocData, type Model } from './model'

export const docSummaries: ReadonlyArray<Doc.DocSummary> = [
  { id: 'incident-log', title: 'Incident Log', lineCount: 3 },
  { id: 'github-tos', title: 'GitHub Terms of Service', lineCount: 4 },
]

export const termsDoc: Doc.Doc = {
  id: 'github-tos',
  title: 'GitHub Terms of Service',
  source: 'GitHub, Inc.',
  maybeUrl: Option.some('https://docs.github.com'),
  kind: 'Prose',
  lines: [
    'D. User-Generated Content',
    'You own content you create.',
    'We may remove content at any time.',
    'Fees are listed on the pricing page.',
  ],
}

export const loadedTerms: Doc.LoadedDoc = {
  doc: termsDoc,
  maybeCodeLanguage: Option.none(),
}

export const loadedModel: Model = modifyFields(initialModel, {
  docList: () => DocListData.Success({ data: docSummaries }),
  maybeSelectedDocId: () => Option.some(termsDoc.id),
  doc: () => LoadedDocData.Success({ data: loadedTerms }),
})

export const answeredResult: Search.SearchResult = {
  mode: 'Choice',
  exists: 0.92,
  scores: [0.05, 0.8, 0.1, 0.05],
  elapsedMs: 310,
  inputTokens: 1234,
}

export const absentResult: Search.SearchResult = {
  ...answeredResult,
  exists: 0.1,
}

import { RadioGroup } from '@foldkit/ui'

import type { Search } from './domain'
import type { PasteKind } from './model'

export const ModeRadioGroup = RadioGroup.create<Search.SearchMode>()

export const PasteKindRadioGroup = RadioGroup.create<PasteKind>()

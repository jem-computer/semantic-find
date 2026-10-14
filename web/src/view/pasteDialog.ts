import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Button, Dialog, Input, Textarea } from '@foldkit/ui'
import { css } from '@pleat/foldkit'

import { PASTE_TEXT_ID, PASTE_TITLE_ID } from '../ids'
import { Message } from '../message'
import { type PasteForm, type PasteKind, PasteStatus } from '../model'
import { PasteKindRadioGroup } from '../radioGroups'
import * as PasteStyle from '../style/paste'
import { segmentedToggleView } from './toggle'

const PASTE_KINDS: ReadonlyArray<PasteKind> = ['Auto', 'Code']

const PASTE_KIND_LABELS: Record<PasteKind, string> = {
  Auto: 'auto detect',
  Code: 'code',
}

const PASTE_KIND_TITLES: Record<PasteKind, string> = {
  Auto: 'Detect prose / markdown / log automatically',
  Code: 'Keep lines verbatim — monospace, indentation preserved, syntax highlighted',
}

const TITLE_MAX_LENGTH = 80
const TEXT_ROWS = 14
const PRIVACY_HINT = 'private to this visit · deleted after 2 idle hours'

const hintText = (status: PasteStatus): string =>
  PasteStatus.match(status, {
    Ready: () => PRIVACY_HINT,
    Submitting: () => 'adding…',
    Failed: ({ error }) => error,
    Truncated: ({ keptLineCount }) => `kept first ${keptLineCount} lines`,
  })

const kindToggleView = (form: PasteForm, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: form.kindRadioGroup.id,
    model: form.kindRadioGroup,
    view: PasteKindRadioGroup.view,
    viewInputs: {
      options: PASTE_KINDS,
      selectedValue: Option.some(form.kind),
      ariaLabel: 'treat pasted text as',
      orientation: 'Horizontal',
      toView: segmentedToggleView(
        {
          labels: PASTE_KIND_LABELS,
          titles: PASTE_KIND_TITLES,
          groupStyle: PasteStyle.kindToggle,
        },
        h,
      ),
    },
    toParentMessage: message =>
      Message.GotPasteKindRadioGroupMessage({ message }),
  })

const formView = (
  form: PasteForm,
  { title, closeButton }: Dialog.RenderInfo,
  h: HtmlBuilder<Message>,
): Html =>
  h.form(
    [
      ...css(PasteStyle.form, ...PasteStyle.pinkSurfaceBindings),
      h.AriaLabel('paste a document'),
      h.OnSubmit(Message.SubmittedPaste()),
    ],
    [
      h.h2([...title, ...css(PasteStyle.title)], ['paste a document']),
      Input.view(
        {
          id: PASTE_TITLE_ID,
          value: form.title,
          placeholder: 'title (optional)',
          onInput: value => Message.UpdatedPasteTitle({ value }),
          toView: ({ input }) =>
            h.input([
              ...input,
              ...css(PasteStyle.field),
              h.AriaLabel('title'),
              h.Maxlength(TITLE_MAX_LENGTH),
            ]),
        },
        h,
      ),
      Textarea.view(
        {
          id: PASTE_TEXT_ID,
          value: form.text,
          rows: TEXT_ROWS,
          placeholder:
            'Paste any text — a contract, an article, a log file, source code…',
          onInput: value => Message.UpdatedPasteText({ value }),
          toView: ({ textarea }) =>
            h.textarea([
              ...textarea,
              ...css(PasteStyle.text),
              h.AriaLabel('document text'),
            ]),
        },
        h,
      ),
      kindToggleView(form, h),
      h.div(
        [...css(PasteStyle.actions)],
        [
          h.span(
            [...css(PasteStyle.hint), h.Role('status')],
            [hintText(form.status)],
          ),
          h.button(
            [...closeButton, h.Type('button'), ...css(PasteStyle.cancel)],
            ['cancel'],
          ),
          Button.view(
            {
              type: 'submit',
              isDisabled: PasteStatus.guards.Submitting(form.status),
              toView: ({ button }) =>
                h.button(
                  [...button, ...css(PasteStyle.submit)],
                  ['add document'],
                ),
            },
            h,
          ),
        ],
      ),
    ],
  )

export const pasteDialogView = (
  form: PasteForm,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: form.dialog.id,
    model: form.dialog,
    view: Dialog.view,
    viewInputs: {
      toView: renderInfo =>
        h.dialog(
          [...renderInfo.dialog, ...css(PasteStyle.dialog)],
          renderInfo.isVisible
            ? [
                h.div([...renderInfo.backdrop, ...css(PasteStyle.backdrop)]),
                h.div(
                  [...renderInfo.panel, ...css(PasteStyle.panel)],
                  [formView(form, renderInfo, h)],
                ),
              ]
            : [],
        ),
    },
    toParentMessage: message => Message.GotPasteDialogMessage({ message }),
  })

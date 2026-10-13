import { Option } from 'effect'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  kotlin,
  php,
  python,
  ruby,
  rust,
  sql,
  swift,
  typescript,
  xml,
  yaml,
}

// NOTE: languages are registered on this private instance as a side effect of
// importing the module. Keep it out of domain/ so pure code never pulls it in.
const highlighter = hljs.newInstance()
Object.entries(LANGUAGES).forEach(([name, language]) =>
  highlighter.registerLanguage(name, language),
)

export const detectLanguage = (
  lines: ReadonlyArray<string>,
): Option.Option<string> =>
  Option.fromNullishOr(highlighter.highlightAuto(lines.join('\n')).language)

// NOTE: each line is highlighted on its own so every rendered line stays one
// scored line. Multi-line constructs such as block comments lose context.
export const highlightLine = (text: string, language: string): string =>
  highlighter.highlight(text, { language, ignoreIllegals: true }).value

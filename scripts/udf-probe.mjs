/**
 * Measures a .udf file and prints what is actually inside it.
 *
 * Every format claim in docs/udf-format.md is a number this script printed, so
 * anyone can check the documentation against their own UYAP output instead of
 * taking it on faith:
 *
 *   node scripts/udf-probe.mjs tests/fixtures/gercek-basvuru.udf
 *   node scripts/udf-probe.mjs kendi-belgem.udf
 *
 * It reads only; nothing is written back.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import PizZip from 'pizzip'

/** Same two patterns the engine itself uses, so the measurement matches it. */
const OFFSET_TAG = /<([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
const CDATA_BLOCK = /(<content\b[^>]*>)\s*<!\[CDATA\[([\s\S]*?)]]>\s*(<\/content>)/

const SPECIAL = [
  ['TAB (U+0009)', /\t/g],
  ['satır sonu (U+000A)', /\n/g],
  ['satır başı (U+000D)', /\r/g],
  ['boş paragraf (U+200B)', /\u200B/g],
  ['nesne yer tutucu (U+FFFC)', /\uFFFC/g]
]

function count(haystack, pattern) {
  return (haystack.match(pattern) ?? []).length
}

function probe(path) {
  const file = readFileSync(path)
  const zip = new PizZip(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
  const entry = Object.keys(zip.files).find((name) => name.toLowerCase() === 'content.xml')

  if (!entry) throw new Error(`${path}: arşivde content.xml yok`)

  const xml = zip.file(entry).asText()
  const block = CDATA_BLOCK.exec(xml)

  if (!block) throw new Error(`${path}: content.xml içinde CDATA taşıyan <content> yok`)

  const text = block[2]
  const elements =
    xml.slice(0, block.index) + block[1] + block[3] + xml.slice(block.index + block[0].length)

  let cursor = 0
  let runs = 0
  let notSelfClosing = 0
  let zeroLength = 0
  const gaps = []
  const tags = new Map()
  const attributes = new Map()

  for (const [, tag, attrs, selfClose] of elements.matchAll(OFFSET_TAG)) {
    tags.set(tag, (tags.get(tag) ?? 0) + 1)

    const start = /\bstartOffset\s*=\s*"(\d+)"/.exec(attrs)
    const length = /\blength\s*=\s*"(\d+)"/.exec(attrs)
    if (!start || !length) continue

    for (const [, name] of attrs.matchAll(/\b([A-Za-z_][\w.:-]*)\s*=\s*"/g)) {
      attributes.set(name, (attributes.get(name) ?? 0) + 1)
    }

    runs += 1
    if (selfClose !== '/') notSelfClosing += 1
    if (Number(length[1]) === 0) zeroLength += 1
    if (Number(start[1]) !== cursor) gaps.push({ tag, beklenen: cursor, gelen: Number(start[1]) })
    cursor = Number(start[1]) + Number(length[1])
  }

  const byCount = (map) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name}(${n})`).join(' ')

  console.log(`\n### ${basename(path)}`)
  console.log(`  arşiv girdileri : ${Object.keys(zip.files).sort().join(', ')}`)
  console.log(`  format_id       : ${/format_id="([^"]*)"/.exec(xml)?.[1] ?? '(yok)'}`)
  console.log(`  metin uzunluğu  : ${text.length}`)
  console.log(`  kapsanan        : ${cursor}`)
  console.log(`  kapsanmayan kuyruk: ${JSON.stringify(text.slice(cursor))}`)
  console.log(`  parça sayısı    : ${runs} (kendinden kapanmayan: ${notSelfClosing})`)
  console.log(`  sıfır uzunluklu : ${zeroLength}`)
  console.log(`  boşluk/çakışma  : ${gaps.length}${gaps.length ? ' -> ' + JSON.stringify(gaps) : ''}`)
  console.log(`  özel karakterler: ${SPECIAL.map(([label, re]) => `${label}=${count(text, re)}`).join(', ')}`)
  console.log(`  etiketler       : ${byCount(tags)}`)
  console.log(`  ofsetli öznitelikler: ${byCount(attributes)}`)
}

const paths = process.argv.slice(2)

if (paths.length === 0) {
  console.error('Kullanım: node scripts/udf-probe.mjs <dosya.udf> [dosya.udf ...]')
  process.exit(1)
}

for (const path of paths) probe(path)

/**
 * Builds test fixtures that contain the cases most likely to break the engine:
 *  - a placeholder deliberately split across two <w:t> runs (what Word really does)
 *  - the same placeholder repeated twice
 *  - a placeholder inside a header
 *  - Turkish characters around the placeholders
 *  - a literal "[Madde 5]" that is indistinguishable from a field
 *  - an unbalanced "[" that must be copied through instead of throwing
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import writeXlsxFile from 'write-excel-file/node'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../tests/fixtures')
mkdirSync(outDir, { recursive: true })

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

// Bold formatting is applied to one run so the tests can prove it survives.
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
<w:p><w:r><w:t xml:space="preserve">Sayın </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>[AD_</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>SOYAD]</w:t></w:r><w:r><w:t xml:space="preserve">, başvurunuz alınmıştır.</w:t></w:r></w:p>
<w:p><w:r><w:t>T.C. Kimlik No: [TC_KIMLIK]</w:t></w:r></w:p>
<w:p><w:r><w:t>Adres: [ADRES] — Şehir: [ADRES]</w:t></w:r></w:p>
<w:p><w:r><w:t>Tarih: [TARIH]</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">İlgili mevzuat [Madde 5] hükmü uyarınca değerlendirilmiştir.</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Ödeme tutarı 1.500 TL [KDV dahil değildir.</w:t></w:r></w:p>
<w:p><w:r><w:t>ÇŞĞÜÖİı karakter testi</w:t></w:r></w:p>
<w:sectPr><w:headerReference w:type="default" r:id="rId10" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></w:sectPr>
</w:body></w:document>`

const HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="${W}">
<w:p><w:r><w:t xml:space="preserve">Dosya sahibi: </w:t></w:r><w:r><w:t>[AD_SOYAD]</w:t></w:r></w:p>
</w:hdr>`

const zip = new PizZip()
zip.file('[Content_Types].xml', CONTENT_TYPES)
zip.folder('_rels').file('.rels', ROOT_RELS)
zip.folder('word').file('document.xml', DOCUMENT)
zip.folder('word').file('header1.xml', HEADER)
zip.folder('word').folder('_rels').file('document.xml.rels', DOCUMENT_RELS)

writeFileSync(resolve(outDir, 'sablon.docx'), zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))

// A curly-brace variant of the same template. Double braces are unambiguous,
// so "[Madde 5]" must survive as ordinary text and never be read as a field.
function toCurly(xml) {
  return xml
    .replace('[AD_', '{{AD_')
    .replace('SOYAD]', 'SOYAD}}')
    .replace('[AD_SOYAD]', '{{AD_SOYAD}}')
    .replace('[TC_KIMLIK]', '{{TC_KIMLIK}}')
    .replace(/\[ADRES\]/g, '{{ADRES}}')
    .replace('[TARIH]', '{{TARIH}}')
}

const curlyZip = new PizZip()
curlyZip.file('[Content_Types].xml', CONTENT_TYPES)
curlyZip.folder('_rels').file('.rels', ROOT_RELS)
curlyZip.folder('word').file('document.xml', toCurly(DOCUMENT))
curlyZip.folder('word').file('header1.xml', toCurly(HEADER))
curlyZip.folder('word').folder('_rels').file('document.xml.rels', DOCUMENT_RELS)

writeFileSync(
  resolve(outDir, 'sablon-curly.docx'),
  curlyZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
)

// Second sheet row leaves ADRES empty; TC_KIMLIK is numeric to exercise the
// scientific-notation case; NOT_KULLANILMIYOR is an unused extra column.
const columns = ['AD_SOYAD', 'TC_KIMLIK', 'ADRES', 'TARIH', 'Madde 5', 'NOT_KULLANILMIYOR']
const records = [
  ['Ahmet Yılmaz', 12345678901, 'Elazığ', '01.09.2026', '5. madde', 'yok sayılmalı'],
  ['Mehmet Kaya', 98765432109, '', '02.09.2026', '5. madde', 'yok sayılmalı'],
  ['Çiğdem Şahin/Öz', 11122233344, 'İstanbul', '03.09.2026', '5. madde', 'yok sayılmalı'],
  ['Ahmet Yılmaz', 55566677788, 'Mardin', '04.09.2026', '5. madde', 'yok sayılmalı']
]

const sheet = [
  columns.map((value) => ({ value, type: String })),
  ...records.map((record) =>
    record.map((value) => ({ value, type: typeof value === 'number' ? Number : String }))
  )
]

await writeXlsxFile(sheet, { filePath: resolve(outDir, 'liste.xlsx') })

console.log('Fixtures written to', outDir)

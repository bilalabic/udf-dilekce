import { describe, expect, it } from 'vitest'
import { buildDocumentName, makeUnique, sanitize } from '~/utils/filename'

describe('sanitize', () => {
  it('transliterates Turkish letters', () => {
    expect(sanitize('Çiğdem Şahin')).toBe('Cigdem_Sahin')
    expect(sanitize('İlknur Öztürk')).toBe('Ilknur_Ozturk')
    expect(sanitize('ıspanak')).toBe('ispanak')
  })

  it('removes characters that are unsafe on any major filesystem', () => {
    expect(sanitize('a/b\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
  })

  it('collapses whitespace and trims separators', () => {
    expect(sanitize('  Ahmet   Yilmaz  ')).toBe('Ahmet_Yilmaz')
    expect(sanitize('...Ahmet...')).toBe('Ahmet')
  })

  it('returns an empty string when nothing usable is left', () => {
    expect(sanitize('***')).toBe('')
    expect(sanitize('')).toBe('')
  })

  it('caps the length', () => {
    expect(sanitize('A'.repeat(200))).toHaveLength(60)
  })
})

describe('buildDocumentName', () => {
  it('uses AD_SOYAD when available', () => {
    expect(buildDocumentName(0, { AD_SOYAD: 'Ahmet Yılmaz' })).toBe('Dilekce_001_Ahmet_Yilmaz.docx')
    expect(buildDocumentName(52, { AD_SOYAD: 'Mehmet Kaya' })).toBe('Dilekce_053_Mehmet_Kaya.docx')
  })

  it('falls back when the column is missing or empty', () => {
    expect(buildDocumentName(0, {})).toBe('Dilekce_001.docx')
    expect(buildDocumentName(1, { AD_SOYAD: '   ' })).toBe('Dilekce_002.docx')
    expect(buildDocumentName(2, { AD_SOYAD: '///' })).toBe('Dilekce_003.docx')
  })
})

describe('makeUnique', () => {
  it('suffixes duplicates instead of overwriting them', () => {
    const taken = new Set<string>()
    expect(makeUnique('Dilekce_001_Ahmet.docx', taken)).toBe('Dilekce_001_Ahmet.docx')
    expect(makeUnique('Dilekce_001_Ahmet.docx', taken)).toBe('Dilekce_001_Ahmet_2.docx')
    expect(makeUnique('Dilekce_001_Ahmet.docx', taken)).toBe('Dilekce_001_Ahmet_3.docx')
  })
})

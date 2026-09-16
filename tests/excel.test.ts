import { describe, expect, it } from 'vitest'
import { buildRows, cellToString, normaliseHeaders, parseRows } from '~/utils/excel'
import { AppError } from '~/utils/errors'

describe('cellToString', () => {
  it('keeps long identifiers out of scientific notation', () => {
    expect(cellToString(12345678901)).toBe('12345678901')
    expect(cellToString(98765432109)).toBe('98765432109')
  })

  it('renders empty cells as an empty string', () => {
    expect(cellToString(null)).toBe('')
    expect(cellToString(undefined)).toBe('')
  })

  it('passes text dates through untouched', () => {
    expect(cellToString('01.09.2026')).toBe('01.09.2026')
  })

  it('formats real date cells as dd.MM.yyyy', () => {
    expect(cellToString(new Date(Date.UTC(2026, 8, 1)))).toBe('01.09.2026')
  })

  it('preserves Turkish characters', () => {
    expect(cellToString(' Çiğdem Şahin ')).toBe('Çiğdem Şahin')
  })
})

describe('normaliseHeaders', () => {
  it('trims names and drops trailing blank columns', () => {
    expect(normaliseHeaders([' AD_SOYAD ', 'TC_KIMLIK', null, null])).toEqual(['AD_SOYAD', 'TC_KIMLIK'])
  })

  it('rejects duplicate column names', () => {
    expect(() => normaliseHeaders(['AD_SOYAD', 'AD_SOYAD'])).toThrow(AppError)
  })

  it('rejects a header row with no names at all', () => {
    expect(() => normaliseHeaders([null, ''])).toThrow(AppError)
  })
})

describe('buildRows', () => {
  it('skips fully empty rows but keeps partially filled ones', () => {
    const result = buildRows(
      ['AD_SOYAD', 'ADRES'],
      [['Ahmet', 'Elazığ'], [null, null], ['Mehmet', null]]
    )

    expect(result.rows.map((row) => row.values)).toEqual([
      { AD_SOYAD: 'Ahmet', ADRES: 'Elazığ' },
      { AD_SOYAD: 'Mehmet', ADRES: '' }
    ])
  })

  it('counts skipped empty rows instead of dropping them silently', () => {
    const result = buildRows(['A'], [['x'], [null], [''], ['y']])

    expect(result.rows).toHaveLength(2)
    expect(result.skippedEmptyRows).toBe(2)
  })

  it('numbers rows by their line in the file, not by their place in the list', () => {
    // A blank row is skipped but still uses up a line: "y" is the second row
    // returned here and the FIFTH line of the sheet.
    const result = buildRows(['A'], [['x'], [null], [''], ['y']])

    expect(result.rows.map((row) => row.excelRow)).toEqual([2, 5])
  })

  it('treats a row with values only in unnamed columns as empty, without losing count', () => {
    // The second line has a value, but only in a column the template cannot
    // address, so no document can come from it - and the row after it must
    // still know which line it is on.
    const result = buildRows(['A', ''], [['x', null], [null, 'not addressable'], ['y', null]])

    expect(result.skippedEmptyRows).toBe(1)
    expect(result.rows.map((row) => row.excelRow)).toEqual([2, 4])
  })

  it('counts cells it rewrote because Excel stored them as real dates', () => {
    const result = buildRows(['T'], [[new Date(Date.UTC(2026, 8, 1))], ['01.09.2026']])

    expect(result.reformattedDateCells).toBe(1)
    expect(result.rows[0]!.values.T).toBe('01.09.2026')
  })

  it('counts numbers Excel had already rounded before the file was opened', () => {
    // 20 digits: far past the 15 Excel stores exactly. The value read here is
    // not the value that was typed, and no later step can recover it.
    const result = buildRows(['IBAN', 'TC_KIMLIK'], [[12345678901234567890, 12345678901]])

    expect(result.roundedNumberCells).toBe(1)
    // An 11-digit identity number is stored exactly, so it is NOT reported.
    expect(result.rows[0]!.values.TC_KIMLIK).toBe('12345678901')
  })
})

describe('parseRows', () => {
  it('reports headers with no data rows', () => {
    const data = parseRows('liste.xlsx', [['AD_SOYAD', 'TC_KIMLIK']])
    expect(data.headers).toEqual(['AD_SOYAD', 'TC_KIMLIK'])
    expect(data.rows).toHaveLength(0)
  })

  it('carries the notices the interface has to show', () => {
    const data = parseRows('liste.xlsx', [['A'], ['x'], [null]], { name: 'Liste', count: 3 })

    expect(data.notices).toEqual({
      sheetName: 'Liste',
      sheetCount: 3,
      skippedEmptyRows: 1,
      reformattedDateCells: 0,
      roundedNumberCells: 0
    })
  })

  it('rejects an empty workbook', () => {
    expect(() => parseRows('liste.xlsx', [])).toThrow(AppError)
  })
})

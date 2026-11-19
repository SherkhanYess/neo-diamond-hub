import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DdsTable from './DdsTable'
import { buildDds } from '../../lib/finance/dds'
import { prepareRules } from '../../lib/finance/classify'
import raw from '../../lib/finance/fixtures/rules.json'
import sep from '../../lib/finance/fixtures/sep2026.json'

const R = prepareRules(raw)
const dds = buildDds({ month: '2026-09', txs: sep, R, opening: 19872188.03 })
const refs = { raw, R }

describe('DdsTable', () => {
  it('рисует сентябрь: фонды, дни, остатки; фонд раскрывается; клик открывает операции', () => {
    render(<MemoryRouter><DdsTable dds={dds} refs={refs} /></MemoryRouter>)
    expect(screen.getByText('Фонд закупок')).toBeTruthy()
    expect(screen.getAllByRole('columnheader')).toHaveLength(3 + 30)
    expect(screen.queryByText('Бриллианты')).toBeNull()
    fireEvent.click(screen.getByText('Фонд закупок'))
    expect(screen.getByText('Бриллианты')).toBeTruthy()
    fireEvent.click(screen.getByText('Фонд аренды помещения'))
    const cell = screen.getByText('Аренда Алматы').closest('tr').querySelector('.dds__num')
    expect(cell.textContent.replace(/\s/g, ' ')).toBe('1 500 000')
    fireEvent.click(cell)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('весь месяц')).toBeTruthy()
  })
})

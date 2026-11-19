import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ModelTable from './ModelTable'
import { computeModel } from '../../lib/finance/model'
import { prepareRules } from '../../lib/finance/classify'
import raw from '../../lib/finance/fixtures/rules.json'
import base from '../../lib/finance/fixtures/model-sep.json'

const R = prepareRules(raw)
const sp = (s) => s.replace(/\s/g, ' ')

describe('ModelTable', () => {
  it('рисует модель, правит выручку и строку оклада', () => {
    const onSave = vi.fn()
    render(<ModelTable model={base} m={computeModel(base, R)} onSave={onSave} prevFact={new Map([['purchases', 500000]])} prevLabel="августа" planning={10000000} sales={null} />)
    expect(screen.getByText('Фонд закупок')).toBeTruthy()
    expect(screen.getByText('Айсултан — маркетолог')).toBeTruthy()
    expect(sp(document.body.textContent)).toContain('500 000')
    const rev = screen.getAllByRole('textbox')[0]
    fireEvent.focus(rev)
    fireEvent.change(rev, { target: { value: '90000000' } })
    fireEvent.blur(rev)
    expect(onSave).toHaveBeenCalledWith({ revenue: 90000000 })
  })
})

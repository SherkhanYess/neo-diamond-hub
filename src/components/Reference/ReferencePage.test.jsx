import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToastProvider } from '../common/Toast'
import ReferencePage from './ReferencePage'

describe('ReferencePage', () => {
  it('показывает 4 ссылки профиля и расшифровку кодов', () => {
    render(
      <ToastProvider>
        <ReferencePage />
      </ToastProvider>,
    )
    expect(screen.getByText('Neo Diamond')).toBeInTheDocument()
    expect(screen.getByText('taena')).toBeInTheDocument()
    const open = screen.getAllByRole('link', { name: 'Открыть' })
    expect(open.map((a) => a.getAttribute('href'))).toContain('https://wa.me/message/LRSSKRO3FST6C1')
    expect(open.every((a) => a.getAttribute('href').startsWith('https://wa.me/message/'))).toBe(true)
    expect(open).toHaveLength(4)
    expect(screen.queryAllByText(/Короткой ссылки ещё нет/)).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'скопировать текст' })).toHaveLength(4)
    expect(screen.getByText('[2ГИС]')).toBeInTheDocument()
  })
})

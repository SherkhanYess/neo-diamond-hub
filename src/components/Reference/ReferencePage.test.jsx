import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToastProvider } from '../common/Toast'
import ReferencePage from './ReferencePage'

describe('ReferencePage', () => {
  it('показывает все 8 ссылок профиля и расшифровку кодов', () => {
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
    expect(screen.getAllByText(/Короткой ссылки ещё нет/).length).toBe(8 - open.length)
    expect(screen.getAllByRole('button', { name: 'скопировать текст' })).toHaveLength(4)
    expect(screen.getByText('[2ГИС]')).toBeInTheDocument()
  })
})

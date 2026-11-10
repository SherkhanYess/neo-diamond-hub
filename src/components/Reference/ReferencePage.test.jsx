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
    expect(screen.getAllByRole('button', { name: 'Скопировать' })).toHaveLength(8)
    const open = screen.getAllByRole('link', { name: 'Открыть' })
    expect(open).toHaveLength(8)
    expect(open.every((a) => /^https:\/\/neo-diamond-hub\.netlify\.app\/w\/[nt]i[bs]-[as]$/.test(a.getAttribute('href')))).toBe(true)
    expect(screen.getByText('[2ГИС]')).toBeInTheDocument()
  })
})

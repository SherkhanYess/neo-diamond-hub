import { describe, it, expect } from 'vitest'
import { makePassword, inviteText } from './Users'

describe('приглашение пользователя', () => {
  it('пароль: 12 знаков без похожих символов', () => {
    const p = makePassword()
    expect(p).toHaveLength(12)
    expect(p).not.toMatch(/[0O1lI]/)
  })
  it('текст: ссылка, логин, пароль, роль', () => {
    const t = inviteText({ origin: 'https://neo-diamond-hub.netlify.app', email: 'a@b.kz', password: 'Xy7', name: 'Айгерим', roleName: 'Финансовый консультант' })
    expect(t).toContain('Айгерим, здравствуйте!')
    expect(t).toContain('(Финансовый консультант)')
    expect(t).toContain('Ссылка: https://neo-diamond-hub.netlify.app')
    expect(t).toContain('Логин: a@b.kz')
    expect(t).toContain('Пароль: Xy7')
  })
})

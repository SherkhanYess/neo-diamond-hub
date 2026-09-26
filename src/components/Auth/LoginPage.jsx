import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn } from '../../lib/api/auth'
import './LoginPage.css'

function humanError(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('invalid login')) return 'Неверный email или пароль.'
  if (msg.includes('email not confirmed')) return 'Email не подтверждён. Проверьте почту.'
  if (msg.includes('network')) return 'Нет связи с сервером. Проверьте интернет.'
  return 'Не удалось войти. Попробуйте ещё раз.'
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__brand">NEO DIAMOND</div>
        <h1 className="login__title">Информационный центр</h1>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn--primary login__submit" type="submit" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}

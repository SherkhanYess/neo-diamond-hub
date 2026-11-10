import { useMemo } from 'react'
import { useToast } from '../common/Toast'
import { profileLinks, CODE_LEGEND, SITE_PARTS } from '../../lib/v2/referenceLinks'
import './Reference.css'

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function LinkRow({ city, url, onCopy }) {
  return (
    <div className="ref__link">
      <span className="ref__city">{city}</span>
      <code className="ref__url mono" title={url}>
        {url}
      </code>
      <div className="ref__actions">
        <button className="btn btn--primary ref__btn" onClick={() => onCopy(url, `Ссылка ${city} скопирована`)}>
          Скопировать
        </button>
        <a className="btn btn--ghost ref__btn" href={url} target="_blank" rel="noreferrer">
          Открыть
        </a>
      </div>
    </div>
  )
}

export default function ReferencePage() {
  const toast = useToast()
  const brands = useMemo(() => profileLinks(), [])
  const onCopy = async (text, ok) =>
    toast.show({ message: (await copy(text)) ? ok : 'Не получилось скопировать — выделите ссылку вручную' })

  return (
    <div className="ref">
      <section className="ref__section">
        <div className="eyebrow">Ссылки профиля</div>
        <h2 className="ref__h">WhatsApp из Instagram с кодом обращения</h2>
        <p className="ref__lead">
          Ставьте в шапку профиля и в стикер-ссылку сторис. Ссылка ведёт сразу в чат, и код в конце сообщения
          инфоцентр засчитает как конвертер «Профиль». Если человек сотрёт код, обращение уйдёт в «WhatsApp без
          источника». Ссылки на сайт делаются в админке taena, раздел «Ссылки».
        </p>

        <div className="ref__brands">
          {brands.map((b) => (
            <article key={b.letter} className="ref__card">
              <h3 className="ref__brand">{b.name}</h3>
              {b.placements.map((p) => (
                <div key={p.entry} className="ref__placement">
                  <div className="ref__ph">
                    <span className="ref__plabel">{p.label}</span>
                    <span className="ref__code mono">{p.code}</span>
                  </div>
                  <p className="ref__msg">
                    «{p.message}»
                    <button className="ref__copytext" onClick={() => onCopy(p.message, 'Текст скопирован')}>
                      скопировать текст
                    </button>
                  </p>
                  {p.links.map((l) => (
                    <LinkRow key={l.phone} city={l.city} url={l.url} onCopy={onCopy} />
                  ))}
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section className="ref__section">
        <div className="eyebrow">Поле «Код обращения» в amoCRM</div>
        <h2 className="ref__h">Что означает код</h2>
        <div className="ref__table-wrap">
          <table className="ref__table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Откуда</th>
                <th>В инфоцентре</th>
              </tr>
            </thead>
            <tbody>
              {CODE_LEGEND.map((r) => (
                <tr key={r.code}>
                  <td className="mono ref__nowrap">{r.code}</td>
                  <td>{r.meaning}</td>
                  <td>{r.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="ref__h3">Код сайта taena по частям</h3>
        <p className="ref__lead">
          <span className="mono">[T·вход:объявление-тип·страница]</span> — например{' '}
          <span className="mono">[T·is-ОБ·g]</span>: taena, пришли из сторис, спросили стоимость со страницы гида.
        </p>
        <div className="ref__parts">
          {[
            ['Вход', SITE_PARTS.entries],
            ['Тип', SITE_PARTS.types],
            ['Страница', SITE_PARTS.pages],
          ].map(([title, rows]) => (
            <div key={title} className="ref__part">
              <div className="ref__ptitle">{title}</div>
              {rows.map(([k, v]) => (
                <div key={k} className="ref__prow">
                  <span className="mono">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

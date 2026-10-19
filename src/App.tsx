import { FormEvent, useState } from 'react'

function App() {
  const [articleUrl, setArticleUrl] = useState('')
  const [submittedUrl, setSubmittedUrl] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmittedUrl(articleUrl.trim())
  }

  return (
    <main className="page-shell">
      <section className="intro">
        <p className="eyebrow">Учебный проект</p>
        <h1>Статья → понятный PDF-гайд</h1>
        <p className="lead">
          Первый экран готов. Дальше добавим сохранение статьи и обращение к
          модели через безопасный серверный слой.
        </p>
      </section>

      <section className="panel" aria-labelledby="source-heading">
        <h2 id="source-heading">Источник</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="article-url">Ссылка на статью OpenAI</label>
          <div className="url-row">
            <input
              id="article-url"
              type="url"
              placeholder="https://openai.com/..."
              value={articleUrl}
              onChange={(event) => setArticleUrl(event.target.value)}
              required
            />
            <button type="submit">Сохранить ссылку</button>
          </div>
        </form>

        {submittedUrl && (
          <p className="status" role="status">
            Ссылка принята для следующего шага: {submittedUrl}
          </p>
        )}
      </section>

      <p className="note">
        Simple Claw подключим на серверном шаге. Секретный ключ не читается
        браузером и не попадает в сборку.
      </p>
    </main>
  )
}

export default App

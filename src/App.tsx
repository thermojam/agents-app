import {FormEvent, useState} from 'react'
import WorkPanel from './WorkPanel'

function App() {
    const [workName, setWorkName] = useState('')
    const [articleUrl, setArticleUrl] = useState('')
    const [status, setStatus] = useState('')
    const [busy, setBusy] = useState(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setBusy(true)
        setStatus('Загружаю статью и собираю черновик. Это может занять несколько минут…')
        const response = await fetch('/api/works', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: workName.trim(), url: articleUrl.trim()}),
        })
        const body = await response.json()
        if (response.ok) return window.location.reload()
        setStatus(body.error)
        setBusy(false)
    }

    return (
        <main className="page-shell">
            <section className="intro">
                <h1>Учебный PDF-гайд</h1>
                <p className="lead">
                    Превращает статью в проверенный учебный текст и PDF. PDF собирается только из версии, которую утвердил человек.
                </p>
            </section>

            {import.meta.env.DEV ? (
                <>
                    <section className="panel" aria-labelledby="source-heading">
                        <h2 id="source-heading">Новая работа</h2>
                        <form onSubmit={handleSubmit}>
                            <label htmlFor="work-name">Имя работы</label>
                            <input
                                id="work-name"
                                placeholder="teens-learn"
                                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                                value={workName}
                                onChange={(event) => setWorkName(event.target.value)}
                                required
                            />
                            <label htmlFor="article-url">Ссылка на статью OpenAI или пост t.me</label>
                            <div className="url-row">
                                <input
                                    id="article-url"
                                    type="url"
                                    placeholder="https://openai.com/... или https://t.me/канал/номер"
                                    value={articleUrl}
                                    onChange={(event) => setArticleUrl(event.target.value)}
                                    required
                                />
                                <button type="submit" disabled={busy}>Создать работу</button>
                            </div>
                        </form>
                        {status && <p className="status" role="status">{status}</p>}
                    </section>
                    <WorkPanel/>
                </>
            ) : (
                <p className="note">Редактор работ доступен только в режиме разработки: npm run dev.</p>
            )}

            <p className="note">Ключ модели хранится в .env и не попадает в браузер.</p>
        </main>
    )
}

export default App

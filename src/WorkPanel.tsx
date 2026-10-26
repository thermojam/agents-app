import {useEffect, useState} from 'react'
import type {DocumentBlock, DocumentContent} from './document'
import {renderDocument} from './preview'
import {fetchWorkNames, loadWork, saveWork} from './works'

const BLOCK_LABELS: Record<DocumentBlock['type'], string> = {
    heading: 'Заголовок',
    paragraph: 'Абзац',
    list: 'Список',
    example: 'Учебный пример',
}

function blockText(block: DocumentBlock): string {
    return block.type === 'list' ? block.items.join('\n') : block.text
}

function withBlockText(block: DocumentBlock, value: string): DocumentBlock {
    return block.type === 'list' ? {...block, items: value.split('\n')} : {...block, text: value}
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export default function WorkPanel() {
    const [names, setNames] = useState<string[]>([])
    const [name, setName] = useState('')
    const [saved, setSaved] = useState<DocumentContent | null>(null)
    const [draft, setDraft] = useState<DocumentContent | null>(null)
    const [blockId, setBlockId] = useState('')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        fetchWorkNames().then(setNames).catch((reason) => setError(errorMessage(reason)))
    }, [])

    const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
    const block = draft?.sections.flatMap((section) => section.blocks).find((item) => item.id === blockId)

    async function openWork(next: string) {
        if (dirty && !window.confirm('Есть несохранённые правки. Открыть другую работу?')) return
        setError('')
        setMessage('')
        try {
            const document = await loadWork(next)
            setName(next)
            setSaved(document)
            setDraft(document)
            setBlockId(document.sections[0]?.blocks[0]?.id ?? '')
        } catch (reason) {
            setError(errorMessage(reason))
        }
    }

    function updateBlock(value: string) {
        if (!draft) return
        setDraft({
            ...draft,
            sections: draft.sections.map((section) => ({
                ...section,
                blocks: section.blocks.map((item) => (item.id === blockId ? withBlockText(item, value) : item)),
            })),
        })
        setMessage('')
    }

    async function save() {
        if (!draft) return
        setError('')
        try {
            const result = await saveWork(name, draft)
            setSaved(draft)
            setMessage(
                result.approvalRevoked
                    ? 'Сохранено. Прежнее утверждение сброшено: перед PDF утвердите текст заново.'
                    : result.changed
                        ? 'Сохранено.'
                        : 'Изменений нет.',
            )
        } catch (reason) {
            setError(errorMessage(reason))
        }
    }

    return (
        <section className="panel" aria-labelledby="works-heading">
            <h2 id="works-heading">Работы</h2>
            <div className="works">
                <ul className="work-list">
                    {names.map((item) => (
                        <li key={item}>
                            <button type="button" aria-pressed={item === name} onClick={() => openWork(item)}>
                                {item}
                            </button>
                        </li>
                    ))}
                </ul>

                {draft && block ? (
                    <div className="editor">
                        <div className="block-picker">
                            {draft.sections.map((section) => (
                                <div key={section.id}>
                                    <p className="section-title">{section.title}</p>
                                    <ul className="work-list">
                                        {section.blocks.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    aria-pressed={item.id === blockId}
                                                    onClick={() => setBlockId(item.id)}
                                                >
                                                    {BLOCK_LABELS[item.type]}: {blockText(item).slice(0, 60)}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        <div className="block-editor">
                            <label htmlFor="block-text">
                                {BLOCK_LABELS[block.type]} · {block.id}
                                {block.type === 'list' && ' (один пункт в строке)'}
                            </label>
                            <textarea
                                id="block-text"
                                rows={block.type === 'list' ? 6 : 4}
                                value={blockText(block)}
                                onChange={(event) => updateBlock(event.target.value)}
                            />
                            <div className="save-row">
                                <button type="button" onClick={save} disabled={!dirty}>
                                    Сохранить
                                </button>
                                <p className="status" role="status">
                                    {error ? <span className="work-error">{error}</span> : message}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="note">{error || 'Выберите работу.'}</p>
                )}
            </div>

            {draft && (
                <iframe
                    className="preview"
                    title={`Предпросмотр: ${name}`}
                    sandbox="allow-same-origin"
                    srcDoc={renderDocument(draft, '/fonts')}
                />
            )}
        </section>
    )
}

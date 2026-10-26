import {useEffect, useState} from 'react'
import {
    EXAMPLE_FRAMES,
    PARAGRAPH_TONES,
    type DocumentBlock,
    type DocumentContent,
    type ExampleFrame,
    type ParagraphTone,
} from './document'
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

function styleOptions(block: DocumentBlock): Record<string, string> | null {
    if (block.type === 'paragraph') return PARAGRAPH_TONES
    if (block.type === 'example') return EXAMPLE_FRAMES
    return null
}

function styleValue(block: DocumentBlock): string {
    if (block.type === 'paragraph') return block.tone ?? 'default'
    if (block.type === 'example') return block.frame ?? 'surface'
    return ''
}

function withStyle(block: DocumentBlock, value: string): DocumentBlock {
    if (block.type === 'paragraph') return {...block, tone: value as ParagraphTone}
    if (block.type === 'example') return {...block, frame: value as ExampleFrame}
    return block
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
    const styles = block && styleOptions(block)

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

    function updateBlock(change: (item: DocumentBlock) => DocumentBlock) {
        if (!draft) return
        setDraft({
            ...draft,
            sections: draft.sections.map((section) => ({
                ...section,
                blocks: section.blocks.map((item) => (item.id === blockId ? change(item) : item)),
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
                                onChange={(event) => updateBlock((item) => withBlockText(item, event.target.value))}
                            />
                            {styles && (
                                <>
                                    <label htmlFor="block-style">Оформление</label>
                                    <select
                                        id="block-style"
                                        value={styleValue(block)}
                                        onChange={(event) => updateBlock((item) => withStyle(item, event.target.value))}
                                    >
                                        {Object.entries(styles).map(([value, text]) => (
                                            <option key={value} value={value}>
                                                {text}
                                            </option>
                                        ))}
                                    </select>
                                </>
                            )}
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

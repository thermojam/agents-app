import {useEffect, useRef, useState} from 'react'
import {
    EXAMPLE_FRAMES,
    PARAGRAPH_TONES,
    type DocumentBlock,
    type DocumentContent,
    type DocumentSection,
    type ExampleFrame,
    type ParagraphTone,
} from './document'
import {renderDocument} from './preview'
import {
    approveWork,
    fetchWorkNames,
    fetchWorkStatus,
    loadWork,
    printWork,
    saveWork,
    suggestBlockText,
    type WorkStatus,
} from './works'

// Предложение модели привязано к блоку и к тексту блока, с которым его запросили.
type Suggestion = {blockId: string; baseText: string; text: string}

const BLOCK_LABELS: Record<DocumentBlock['type'], string> = {
    heading: 'Заголовок',
    paragraph: 'Абзац',
    list: 'Список',
    example: 'Учебный пример',
}

const PRINTED_LABELS: Record<WorkStatus['printed'], string> = {
    none: 'ещё не печатали',
    current: 'сохранённая версия',
    older: 'более ранняя версия',
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

function sectionOf(document: DocumentContent, id: string): DocumentSection | undefined {
    return document.sections.find((section) => section.blocks.some((item) => item.id === id))
}

function withBlocks(document: DocumentContent, sectionId: string, blocks: DocumentBlock[]): DocumentContent {
    return {...document, sections: document.sections.map((s) => (s.id === sectionId ? {...s, blocks} : s))}
}

function moveBlock(document: DocumentContent, id: string, step: number): DocumentContent {
    const section = sectionOf(document, id)
    if (!section) return document
    const from = section.blocks.findIndex((item) => item.id === id)
    const to = from + step
    if (to < 0 || to >= section.blocks.length) return document
    const blocks = [...section.blocks]
    const [moved] = blocks.splice(from, 1)
    blocks.splice(to, 0, moved)
    return withBlocks(document, section.id, blocks)
}

function removeBlock(document: DocumentContent, id: string): DocumentContent {
    const section = sectionOf(document, id)
    if (!section) return document
    return withBlocks(document, section.id, section.blocks.filter((item) => item.id !== id))
}

function addParagraph(document: DocumentContent, afterId: string, id: string): DocumentContent {
    const section = sectionOf(document, afterId)
    if (!section) return document
    const index = section.blocks.findIndex((item) => item.id === afterId)
    const blocks = [...section.blocks]
    blocks.splice(index + 1, 0, {id, type: 'paragraph', text: 'Новый абзац', sourcePartId: section.sourcePartId})
    return withBlocks(document, section.id, blocks)
}

// Отмена возвращает структуру блоков из снимка, но сохраняет текст и оформление, которые человек ввёл после него.
function restoreStructure(snapshot: DocumentContent, current: DocumentContent): DocumentContent {
    const edited = new Map(current.sections.flatMap((section) => section.blocks).map((item) => [item.id, item]))
    return {
        ...snapshot,
        sections: snapshot.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((item) => (edited.has(item.id) ? {...item, ...edited.get(item.id)} : item)),
        })),
    }
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
    const [history, setHistory] = useState<DocumentContent[]>([])
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [status, setStatus] = useState<WorkStatus | null>(null)
    const [busy, setBusy] = useState(false)
    const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
    const requestSeq = useRef(0)

    useEffect(() => {
        fetchWorkNames().then(setNames).catch((reason) => setError(errorMessage(reason)))
    }, [])

    const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
    const block = draft?.sections.flatMap((section) => section.blocks).find((item) => item.id === blockId)
    const styles = block && styleOptions(block)
    const section = draft && sectionOf(draft, blockId)
    const index = section ? section.blocks.findIndex((item) => item.id === blockId) : -1

    async function openWork(next: string) {
        if (dirty && !window.confirm('Есть несохранённые правки. Открыть другую работу?')) return
        setError('')
        setMessage('')
        requestSeq.current += 1
        setSuggestion(null)
        try {
            const document = await loadWork(next)
            setName(next)
            setSaved(document)
            setDraft(document)
            setHistory([])
            setBlockId(document.sections[0]?.blocks[0]?.id ?? '')
            setStatus(await fetchWorkStatus(next))
        } catch (reason) {
            setError(errorMessage(reason))
        }
    }

    function changeStructure(next: DocumentContent, selectId: string) {
        if (!draft) return
        setHistory([...history, draft])
        setDraft(next)
        setBlockId(selectId)
        setMessage('')
    }

    function undo() {
        const snapshot = history.at(-1)
        if (!draft || !snapshot) return
        const restored = restoreStructure(snapshot, draft)
        setHistory(history.slice(0, -1))
        setDraft(restored)
        if (!restored.sections.some((item) => item.blocks.some((entry) => entry.id === blockId))) {
            setBlockId(restored.sections[0]?.blocks[0]?.id ?? '')
        }
        setMessage('')
    }

    function deleteBlock() {
        if (!draft || !section || section.blocks.length < 2) return
        const next = section.blocks[index + 1] ?? section.blocks[index - 1]
        changeStructure(removeBlock(draft, blockId), next.id)
    }

    function moveSelected(step: number) {
        if (draft) changeStructure(moveBlock(draft, blockId, step), blockId)
    }

    function addBlock() {
        if (!draft) return
        const id = `paragraph-${Date.now().toString(36)}`
        changeStructure(addParagraph(draft, blockId, id), id)
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

    // Ответ применяется только к тому тексту блока, с которым он запрошен; устаревший ответ не показывается.
    async function suggest() {
        if (!block) return
        const request = ++requestSeq.current
        const baseText = blockText(block)
        setError('')
        setBusy(true)
        try {
            const text = await suggestBlockText(name, block.id, baseText)
            if (request === requestSeq.current) setSuggestion({blockId: block.id, baseText, text})
        } catch (reason) {
            if (request === requestSeq.current) setError(errorMessage(reason))
        } finally {
            setBusy(false)
        }
    }

    // Принятие меняет только выбранный блок в текущем черновике и только если его текст не менялся после запроса.
    function acceptSuggestion() {
        if (!suggestion || !block || !isCurrent(suggestion)) return
        const {text} = suggestion
        updateBlock((item) => withBlockText(item, text))
        setSuggestion(null)
        setMessage('Предложение принято. Сохраните работу, чтобы записать текст.')
    }

    function isCurrent(value: Suggestion): boolean {
        return !!block && value.blockId === block.id && blockText(block) === value.baseText
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
            setStatus(await fetchWorkStatus(name))
        } catch (reason) {
            setError(errorMessage(reason))
        }
    }

    // Ошибка утверждения или печати только показывается: черновик и его несохранённые правки не меняются.
    async function runWorkAction(action: (work: string) => Promise<WorkStatus>, done: string) {
        setError('')
        setBusy(true)
        try {
            setStatus(await action(name))
            setMessage(done)
        } catch (reason) {
            setError(errorMessage(reason))
        } finally {
            setBusy(false)
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
                            {suggestion && suggestion.blockId === block.id && (
                                <div className="suggestion">
                                    <p className="section-title">Предложение модели</p>
                                    <p className="suggestion-text">{suggestion.text}</p>
                                    {!isCurrent(suggestion) && (
                                        <p className="work-error">Текст блока изменился после запроса: предложение устарело.</p>
                                    )}
                                    <div className="block-actions">
                                        <button type="button" onClick={acceptSuggestion} disabled={!isCurrent(suggestion)}>
                                            Принять
                                        </button>
                                        <button type="button" onClick={() => setSuggestion(null)}>
                                            Отклонить
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="block-actions">
                                <button type="button" onClick={() => moveSelected(-1)} disabled={index <= 0}>
                                    Выше
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveSelected(1)}
                                    disabled={!section || index >= section.blocks.length - 1}
                                >
                                    Ниже
                                </button>
                                <button type="button" onClick={addBlock}>
                                    Добавить абзац
                                </button>
                                <button type="button" onClick={deleteBlock} disabled={!section || section.blocks.length < 2}>
                                    Удалить блок
                                </button>
                                <button type="button" onClick={undo} disabled={history.length === 0}>
                                    Отменить
                                </button>
                                <button type="button" onClick={suggest} disabled={busy}>
                                    Предложить правку
                                </button>
                            </div>
                            <div className="save-row">
                                <button type="button" onClick={save} disabled={!dirty}>
                                    Сохранить
                                </button>
                                <button
                                    type="button"
                                    onClick={() => runWorkAction(approveWork, 'Текущая версия утверждена.')}
                                    disabled={dirty || busy}
                                >
                                    Утвердить текущую версию
                                </button>
                                <button
                                    type="button"
                                    onClick={() => runWorkAction(printWork, 'PDF собран из утверждённой версии.')}
                                    disabled={dirty || busy || !status?.approved}
                                >
                                    Собрать PDF
                                </button>
                                <p className="status" role="status">
                                    {error ? <span className="work-error">{error}</span> : message}
                                </p>
                            </div>
                            {status && (
                                <p className="note">
                                    В просмотре: {dirty ? 'несохранённая правка' : 'сохранённая версия'}. Утверждение
                                    сохранённой версии: {status.approved ? 'есть' : 'нет'}. Напечатано:{' '}
                                    {PRINTED_LABELS[status.printed]}.
                                </p>
                            )}
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

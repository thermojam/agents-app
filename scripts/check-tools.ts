import { existsSync, readFileSync } from 'node:fs'
import { DOCUMENT_TOOL_DEFINITIONS, executeTool } from './tools.ts'

const toolNames = DOCUMENT_TOOL_DEFINITIONS.map((tool) => tool.function.name)
const expectedNames = ['fetch_article', 'save_draft', 'validate_draft', 'get_document_status', 'find_unexplained_terms', 'render_pdf']
if (JSON.stringify(toolNames) !== JSON.stringify(expectedNames) || toolNames.includes('approve')) {
    throw new Error(`Набор инструментов изменён: ${JSON.stringify(toolNames)}`)
}

const status = JSON.parse(await executeTool('get_document_status', '{}')) as {
    state: string
    approval: boolean
    pdf: boolean
}
// validate_draft, save_draft и render_pdf пишут отчёт или PDF: без approval их проверяем, с approval пропускаем.
const outputPath = 'docs/agents-tools/building-agents/guide.pdf'
const approved = existsSync('docs/agents-tools/building-agents/approval.json')
if (status.state !== (approved ? 'ready' : 'awaiting_approval') || status.approval !== approved || status.pdf !== existsSync(outputPath)) {
    throw new Error(`Статус не совпадает с файлами: ${JSON.stringify(status)}`)
}

if (!approved) {
    const validation = JSON.parse(await executeTool('validate_draft', '{}')) as { valid: boolean }
    if (!validation.valid) throw new Error('Корректный draft.json не прошёл validate_draft')

    const draftPath = 'docs/agents-tools/building-agents/draft.json'
    const draft = JSON.parse(readFileSync(draftPath, 'utf8'))
    const saved = JSON.parse(await executeTool('save_draft', JSON.stringify({ document: draft }))) as { blocks: number }
    if (saved.blocks < 1) throw new Error('save_draft не вернул сохранённые блоки')
    const report = JSON.parse(readFileSync('docs/agents-tools/building-agents/report.json', 'utf8')) as {
        structural?: { status?: string }
        manualReview?: { status?: string }
    }
    if (report.structural?.status !== 'passed' || report.manualReview?.status !== 'pending') {
        throw new Error(`После save_draft не создан ожидающий ручной отчёт: ${JSON.stringify(report)}`)
    }
}

for (const [name, args, expected] of [
    ['unknown_tool', '{}', 'не разрешён'],
    ['get_document_status', '{"path":"/tmp/secret"}', 'не разрешено'],
    ['get_document_status', '[]', 'JSON-объект'],
] as const) {
    try {
        await executeTool(name, args)
        throw new Error(`Вызов ${name} неожиданно принят`)
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes(expected)) throw error
    }
}

if (!approved) {
    const pdfExisted = existsSync(outputPath)
    try {
        await executeTool('render_pdf', '{}')
        throw new Error('render_pdf неожиданно создал PDF без approval')
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('ещё не утверждён')) throw error
    }
    if (existsSync(outputPath) !== pdfExisted) throw new Error('render_pdf изменил PDF после отказа approval')
}

console.log(approved
    ? 'T12: статус и разрешённые инструменты проверены; шаги записи пропущены, потому что работа утверждена (approval.json существует)'
    : 'T12: разрешённые инструменты выполняются; неизвестное имя, лишнее поле и PDF без approval отклонены до опасного действия')

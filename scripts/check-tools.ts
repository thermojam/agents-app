import { existsSync, readFileSync } from 'node:fs'
import { DOCUMENT_TOOL_DEFINITIONS, executeTool } from './tools.ts'

const toolNames = DOCUMENT_TOOL_DEFINITIONS.map((tool) => tool.function.name)
const expectedNames = ['fetch_article', 'save_draft', 'validate_draft', 'get_document_status', 'render_pdf']
if (JSON.stringify(toolNames) !== JSON.stringify(expectedNames) || toolNames.includes('approve')) {
    throw new Error(`Набор инструментов изменён: ${JSON.stringify(toolNames)}`)
}

const status = JSON.parse(await executeTool('get_document_status', '{}')) as {
    state: string
    approval: boolean
    pdf: boolean
}
if (status.state !== 'awaiting_approval' || status.approval || status.pdf) {
    throw new Error(`Ожидался черновик без approval и PDF: ${JSON.stringify(status)}`)
}

const validation = JSON.parse(await executeTool('validate_draft', '{}')) as { valid: boolean }
if (!validation.valid) throw new Error('Корректный draft.json не прошёл validate_draft')

const draftPath = 'docs/agents-tools/building-agents/draft.json'
const draft = JSON.parse(readFileSync(draftPath, 'utf8'))
const saved = JSON.parse(await executeTool('save_draft', JSON.stringify({ document: draft }))) as { blocks: number }
if (saved.blocks < 1) throw new Error('save_draft не вернул сохранённые блоки')

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

const outputPath = 'docs/agents-tools/building-agents/guide.pdf'
if (existsSync(outputPath)) throw new Error('Тест T12 начался с неожиданного PDF')
try {
    await executeTool('render_pdf', '{}')
    throw new Error('render_pdf неожиданно создал PDF без approval')
} catch (error) {
    if (!(error instanceof Error) || !error.message.includes('ещё не утверждён')) throw error
}
if (existsSync(outputPath)) throw new Error('render_pdf создал PDF после отказа approval')

console.log('T12: разрешённые инструменты выполняются; неизвестное имя, лишнее поле и PDF без approval отклонены до опасного действия')

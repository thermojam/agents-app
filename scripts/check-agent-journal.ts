import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runAgentLoop } from './agent-loop.ts'
import type { ChatCompletionResult, ChatMessage, ToolCall } from './model.ts'
import { createTraceWriter } from './trace.ts'
import { assertPaidExperimentsAllowed, formatBudget, readBudget } from './budget.ts'

function response(message: ChatMessage, model = 'fixture-model'): ChatCompletionResult {
    return { baseUrl: 'fixture://model', model, message, finishReason: 'stop', usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } }
}

function call(id: string, name: string): ToolCall {
    return { id, type: 'function', function: { name, arguments: '{}' } }
}

const temporaryDir = mkdtempSync(join(tmpdir(), 'agents-app-journal-check-'))
const trace = createTraceWriter({
    workDir: temporaryDir,
    tracePath: join(temporaryDir, 'trace.jsonl'),
    usagePath: join(temporaryDir, 'usage.jsonl'),
})

try {
    const responses = [
        response({ role: 'assistant', content: null, tool_calls: [call('1', 'get_document_status')] }),
        response({ role: 'assistant', content: 'Ожидаю решения человека.' }),
    ]
    let responseIndex = 0
    const normal = await runAgentLoop([{ role: 'user', content: 'Проверь документ' }], {
        requestModel: async () => responses[responseIndex++] ?? (() => { throw new Error('лишний запрос') })(),
        runTool: async () => JSON.stringify({ state: 'awaiting_approval' }),
        onModelResponse: (step, result) => trace.modelResponse(step, result),
        onToolResult: (step, tool, result, error) => trace.toolResult(step, tool, result, error),
        onStop: (step, status, reason) => trace.stopped(step, status, reason),
    })
    if (normal.status !== 'awaiting_human') throw new Error(`Ожидалось ожидание человека: ${normal.status}`)

    let failingRequests = 0
    const repeated = await runAgentLoop([{ role: 'user', content: 'Повтори проверку' }], {
        maxRequests: 5,
        requestModel: async () => {
            failingRequests += 1
            return response({ role: 'assistant', content: null, tool_calls: [call(String(failingRequests), 'validate_draft')] })
        },
        runTool: async () => { throw new Error(`временная ошибка сервиса ${'деталь '.repeat(100)}`) },
    })
    if (repeated.status !== 'error' || repeated.requests !== 2 || !repeated.reason.includes('после 2 попыток') || repeated.reason.length > 500) {
        throw new Error(`Повтор ошибки не остановлен после двух попыток: ${JSON.stringify(repeated)}`)
    }

    const traceLines = readFileSync(join(temporaryDir, 'trace.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    const usageLines = readFileSync(join(temporaryDir, 'usage.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    if (!traceLines.some((line) => line.event === 'tool_result' && line.tool === 'get_document_status')) throw new Error('В trace нет результата инструмента')
    if (!traceLines.some((line) => line.event === 'stopped' && line.result === 'awaiting_human' && typeof line.reason === 'string' && line.reason.length > 0)) {
        throw new Error('В trace нет причины остановки')
    }
    if (usageLines.length !== 2 || usageLines.some((line) => line.totalTokens !== 12)) throw new Error('Токены не записаны отдельно')

    trace.toolResult(9, 'fixture', 'Authorization: Bearer test-secret', true)
    const traceText = readFileSync(join(temporaryDir, 'trace.jsonl'), 'utf8')
    if (traceText.includes('test-secret') || traceText.includes('Authorization: Bearer')) throw new Error('Секрет попал в trace')

    const budget = readBudget()
    if (budget.status !== 'unknown' || !formatBudget(budget).includes('неизвестно')) throw new Error('Неизвестный бюджет не обозначен явно')
    try {
        assertPaidExperimentsAllowed(budget)
        throw new Error('Платный запуск неожиданно разрешён без сверки бюджета')
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('остановлен')) throw error
    }
    if (!existsSync(join(temporaryDir, 'trace.jsonl'))) throw new Error('trace.jsonl не создан')

    console.log('T15: trace восстанавливает остановку; одинаковая ошибка прекращается после двух попыток; токены отделены от неизвестного рублёвого расхода; секреты не записываются')
} finally {
    rmSync(temporaryDir, { recursive: true, force: true })
}

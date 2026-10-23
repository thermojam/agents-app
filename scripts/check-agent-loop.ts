import { runAgentLoop, type AgentLoopOptions } from './agent-loop.ts'
import type { ChatCompletionResult, ChatMessage, ToolCall } from './model.ts'
import { DocumentValidationError } from '../src/document.ts'

function response(message: ChatMessage): ChatCompletionResult {
    return { baseUrl: 'fixture://model', model: 'fixture-model', message, finishReason: 'stop' }
}

function call(id: string, name: string, argumentsText = '{}'): ToolCall {
    return { id, type: 'function', function: { name, arguments: argumentsText } }
}

function fixtureRunner(responses: ChatCompletionResult[], options: Partial<AgentLoopOptions> = {}) {
    const seenTools: string[] = []
    let responseIndex = 0
    const defaultRunTool = async (name: string) => {
        seenTools.push(name)
        if (name === 'get_document_status') return JSON.stringify({ state: 'working' })
        if (name === 'validate_draft') return JSON.stringify({ valid: true })
        throw new Error(`Неизвестный fixture tool: ${name}`)
    }
    const result = runAgentLoop([{ role: 'user', content: 'Проверь документ' }], {
        ...options,
        requestModel: async () => {
            const next = responses[responseIndex]
            responseIndex += 1
            if (!next) throw new Error('Фикстура получила лишний запрос к модели')
            return next
        },
        runTool: options.runTool ?? defaultRunTool,
    })
    return { result, seenTools }
}

const twoActions = fixtureRunner([
    response({ role: 'assistant', content: null, tool_calls: [call('1', 'get_document_status'), call('2', 'validate_draft')] }),
    response({ role: 'assistant', content: null, tool_calls: [call('3', 'validate_draft')] }),
    response({ role: 'assistant', content: 'Документ проверен.' }),
])
const completed = await twoActions.result
if (completed.status !== 'completed' || completed.requests !== 3 || completed.toolCalls !== 3 || twoActions.seenTools.join(',') !== 'get_document_status,validate_draft,validate_draft') {
    throw new Error(`Цикл двух действий завершился неверно: ${JSON.stringify(completed)}`)
}

const earlyDone = await fixtureRunner([response({ role: 'assistant', content: 'Готово.' })]).result
if (earlyDone.status !== 'error' || earlyDone.toolCalls !== 0) throw new Error('Раннее «готово» принято без инструмента')

const toolError = await fixtureRunner([
    response({ role: 'assistant', content: null, tool_calls: [call('7', 'unknown_tool')] }),
    response({ role: 'assistant', content: 'Готово.' }),
]).result
if (toolError.status !== 'error' || !toolError.reason.includes('ошибкой')) throw new Error('Ошибка инструмента не остановила цикл')

const validationFailure = await fixtureRunner([
    response({ role: 'assistant', content: null, tool_calls: [call('9', 'save_draft')] }),
    response({ role: 'assistant', content: null, tool_calls: [call('10', 'save_draft')] }),
], {
    runTool: async () => { throw new DocumentValidationError('document.sections[0].blocks[0].sourcePartId: часть источника не найдена') },
}).result
if (validationFailure.status !== 'awaiting_human' || !validationFailure.reason.includes('дважды')) {
    throw new Error(`Две ошибки проверки черновика не передали решение человеку: ${JSON.stringify(validationFailure)}`)
}

const approvalError = await fixtureRunner([
    response({ role: 'assistant', content: null, tool_calls: [call('8', 'render_pdf')] }),
    response({ role: 'assistant', content: 'Ожидаю утверждение.' }),
], {
    runTool: async () => {
        throw new Error('Печать запрещена: черновик ещё не утверждён')
    },
}).result
if (approvalError.status !== 'awaiting_human') throw new Error('Отказ печати без approval не переведён в ожидание человека')

const modelError = await runAgentLoop([{ role: 'user', content: 'Проверь документ' }], {
    requestModel: async () => {
        throw new Error('тайм-аут')
    },
    runTool: async () => '{}',
})
if (modelError.status !== 'error' || modelError.requests !== 2 || !modelError.reason.includes('после 2 попыток')) {
    throw new Error('Ошибка запроса модели не получила статус error')
}

const awaitingHuman = await fixtureRunner([
    response({ role: 'assistant', content: null, tool_calls: [call('4', 'get_document_status')] }),
    response({ role: 'assistant', content: 'Нужно утверждение человека.' }),
], {
    runTool: async () => JSON.stringify({ state: 'awaiting_approval' }),
}).result
if (awaitingHuman.status !== 'awaiting_human') throw new Error(`Ожидался статус ожидания человека: ${awaitingHuman.status}`)

const limited = await fixtureRunner([
    response({ role: 'assistant', content: null, tool_calls: [call('5', 'validate_draft')] }),
    response({ role: 'assistant', content: null, tool_calls: [call('6', 'validate_draft')] }),
    response({ role: 'assistant', content: 'Готово.' }),
], { maxRequests: 2 }).result
if (limited.status !== 'limit' || limited.requests !== 2) throw new Error(`Лимит обращений не сработал: ${JSON.stringify(limited)}`)

const tooLong = await fixtureRunner([response({ role: 'assistant', content: 'слишком длинный ответ' })], { maxResponseChars: 5 }).result
if (tooLong.status !== 'error' || !tooLong.reason.includes('лимит длины')) throw new Error('Лимит длины ответа не сработал')

console.log('T13: цикл последовательно выполнил несколько вызовов; раннее «готово» отклонено; ожидание человека, ошибка и лимит различаются')

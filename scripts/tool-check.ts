import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { executeGetDocumentStatus } from './document-status.ts'
import { requestChatCompletion, type ChatMessage, type ToolCall, type ToolDefinition } from './model.ts'

const workDir = resolve('docs/agents-tools/building-agents')
const logPath = resolve(workDir, 'tool-check.jsonl')
const tool: ToolDefinition = {
    type: 'function',
    function: {
        name: 'get_document_status',
        description: 'Возвращает состояние текущей работы: есть ли черновик, утверждение и PDF. Не принимает аргументы.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
        },
    },
}

function writeEvent(event: Record<string, unknown>): void {
    appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`)
}

function onlyToolCall(message: ChatMessage): ToolCall {
    const calls = message.tool_calls
    if (!calls || calls.length !== 1) throw new Error('Модель не запросила ровно один вызов get_document_status')
    const [call] = calls
    if (call.type !== 'function' || call.function.name !== 'get_document_status') {
        throw new Error(`Модель запросила недопустимый инструмент: ${call.function.name}`)
    }
    return call
}

async function main(): Promise<void> {
    mkdirSync(workDir, { recursive: true })
    writeFileSync(logPath, '')
    const messages: ChatMessage[] = [
        { role: 'system', content: 'Ты проверяешь состояние текущего документа через разрешённый инструмент.' },
        { role: 'user', content: 'Вызови get_document_status без аргументов и затем кратко объясни результат.' },
    ]
    writeEvent({ type: 'model_request', tool: tool.function.name })
    try {
        const first = await requestChatCompletion(messages, [tool])
        writeEvent({
            type: 'tool_request',
            model: first.model,
            finishReason: first.finishReason,
            call: first.message.tool_calls?.[0] ?? null,
        })
        const call = onlyToolCall(first.message)
        const result = executeGetDocumentStatus(call.function.arguments)
        writeEvent({ type: 'tool_result', callId: call.id, name: call.function.name, result: JSON.parse(result) })

        messages.push(first.message, { role: 'tool', content: result, tool_call_id: call.id })
        const second = await requestChatCompletion(messages, [tool])
        if (typeof second.message.content !== 'string' || !second.message.content.trim()) {
            throw new Error('После результата инструмента модель не вернула объяснение')
        }
        writeEvent({ type: 'model_response', model: second.model, finishReason: second.finishReason, content: second.message.content, usage: second.usage ?? null })
        console.log(`Инструмент: ${call.function.name}`)
        console.log(`Результат: ${result}`)
        console.log(`Ответ модели: ${second.message.content.trim()}`)
        console.log(`Запись: ${logPath}`)
    } catch (error: unknown) {
        writeEvent({ type: 'error', message: error instanceof Error ? error.message : 'Неизвестная ошибка' })
        throw error
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка запроса инструмента'
    if (/SimpleClaw не ответил|Не удалось обратиться к SimpleClaw|HTTP 5\d\d\)/.test(message)) {
        console.log(`tool:check пропущено: сервис недоступен. ${message}`)
        return
    }
    console.error(message)
    process.exitCode = 1
})

import {
    requestChatCompletion,
    type ChatCompletionResult,
    type ChatMessage,
    type ToolCall,
} from './model.ts'
import { DOCUMENT_TOOL_DEFINITIONS, executeTool } from './tools.ts'
import { DocumentValidationError } from '../src/document.ts'

export const DEFAULT_MAX_REQUESTS = 12
export const DEFAULT_MAX_RESPONSE_CHARS = 8_000
export const DEFAULT_MAX_OUTPUT_TOKENS = 120
export const DEFAULT_TIMEOUT_MS = 15_000
export const MAX_SAME_ERROR_ATTEMPTS = 2
const MAX_ERROR_CHARS = 400

export type AgentLoopStatus = 'completed' | 'awaiting_human' | 'error' | 'limit'

export type AgentLoopResult = {
    status: AgentLoopStatus
    reason: string
    requests: number
    toolCalls: number
    successfulToolCalls: number
    messages: ChatMessage[]
}

export type AgentLoopOptions = {
    maxRequests?: number
    maxResponseChars?: number
    maxOutputTokens?: number
    timeoutMs?: number
    requestModel: (
        messages: ChatMessage[],
        maxOutputTokens: number,
        timeoutMs: number,
    ) => Promise<ChatCompletionResult>
    runTool: (name: string, argumentsText: string) => Promise<string>
    onModelResponse?: (step: number, response: ChatCompletionResult) => void
    onModelError?: (step: number, reason: string) => void
    onToolResult?: (step: number, tool: string, result: string, error: boolean) => void
    onStop?: (step: number, status: AgentLoopStatus, reason: string) => void
}

function failResult(
    status: AgentLoopStatus,
    reason: string,
    requests: number,
    toolCalls: number,
    successfulToolCalls: number,
    messages: ChatMessage[],
): AgentLoopResult {
    return { status, reason, requests, toolCalls, successfulToolCalls, messages }
}

function isToolCall(value: unknown): value is ToolCall {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const call = value as Partial<ToolCall>
    return (
        typeof call.id === 'string' &&
        call.id.trim() !== '' &&
        call.type === 'function' &&
        typeof call.function === 'object' &&
        call.function !== null &&
        typeof call.function.name === 'string' &&
        call.function.name.trim() !== '' &&
        typeof call.function.arguments === 'string'
    )
}

function readToolCalls(message: ChatMessage): ToolCall[] | null {
    if (message.tool_calls === undefined) return null
    if (!Array.isArray(message.tool_calls) || !message.tool_calls.every(isToolCall)) return []
    const ids = new Set<string>()
    for (const call of message.tool_calls) {
        if (ids.has(call.id)) return []
        ids.add(call.id)
    }
    return message.tool_calls
}

function shortError(value: string): string {
    const compact = value.replace(/\s+/g, ' ').trim()
    return compact.length > MAX_ERROR_CHARS ? `${compact.slice(0, MAX_ERROR_CHARS - 1)}…` : compact
}

function needsHuman(content: string): boolean {
    try {
        const value = JSON.parse(content) as { state?: unknown }
        if (value.state === 'awaiting_approval') return true
    } catch {
        // A tool error is plain text and is handled by the caller.
    }
    return content.includes('ещё не утверждён') || content.includes('требуется новое утверждение')
}

export async function runAgentLoop(initialMessages: ChatMessage[], options: AgentLoopOptions): Promise<AgentLoopResult> {
    const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS
    const maxResponseChars = options.maxResponseChars ?? DEFAULT_MAX_RESPONSE_CHARS
    const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new Error('maxRequests должен быть положительным целым числом')
    if (!Number.isInteger(maxResponseChars) || maxResponseChars < 1) throw new Error('maxResponseChars должен быть положительным целым числом')

    const messages = [...initialMessages]
    let requests = 0
    let toolCalls = 0
    let successfulToolCalls = 0
    let hadToolError = false
    let humanRequired = false
    let validationFailures = 0
    const errorAttempts = new Map<string, number>()

    const finish = (
        status: AgentLoopStatus,
        reason: string,
        messagesToReturn: ChatMessage[] = messages,
    ): AgentLoopResult => {
        options.onStop?.(requests, status, reason)
        return failResult(status, reason, requests, toolCalls, successfulToolCalls, messagesToReturn)
    }

    const repeatedError = (kind: string, message: string): string | null => {
        const key = `${kind}:${message}`
        const attempts = (errorAttempts.get(key) ?? 0) + 1
        errorAttempts.set(key, attempts)
        return attempts >= MAX_SAME_ERROR_ATTEMPTS
            ? `Повторяющаяся ошибка остановила цикл после ${MAX_SAME_ERROR_ATTEMPTS} попыток: ${message}`
            : null
    }

    while (requests < maxRequests) {
        requests += 1
        let reply: ChatCompletionResult
        try {
            reply = await options.requestModel(messages, maxOutputTokens, timeoutMs)
        } catch (error: unknown) {
            const message = shortError(error instanceof Error ? error.message : 'Запрос модели завершился неизвестной ошибкой')
            options.onModelError?.(requests, message)
            const repeated = repeatedError('model', message)
            if (repeated) return finish('error', repeated)
            continue
        }
        const calls = readToolCalls(reply.message)
        messages.push(reply.message)
        options.onModelResponse?.(requests, reply)
        if (JSON.stringify(reply.message).length > maxResponseChars) {
            return finish('error', 'Ответ модели превышает установленный лимит длины')
        }
        if (calls === null) {
            if (hadToolError) {
                return finish(
                    humanRequired ? 'awaiting_human' : 'error',
                    humanRequired ? 'Ожидается решение человека' : 'Инструмент завершился ошибкой, исправление не получено',
                )
            }
            if (successfulToolCalls === 0) {
                return finish('error', 'Модель сообщила о завершении без выполненного инструмента')
            }
            return finish(
                humanRequired ? 'awaiting_human' : 'completed',
                reply.message.content?.trim() || (humanRequired ? 'Ожидается решение человека' : 'Цикл завершён'),
            )
        }
        if (calls.length === 0) {
            return finish('error', 'Модель вернула некорректный список вызовов инструментов')
        }

        for (const call of calls) {
            toolCalls += 1
            let result: string
            let toolError = false
            try {
                result = await options.runTool(call.function.name, call.function.arguments)
                successfulToolCalls += 1
                humanRequired ||= needsHuman(result)
            } catch (error: unknown) {
                hadToolError = true
                toolError = true
                const errorMessage = shortError(error instanceof Error ? error.message : 'Неизвестная ошибка инструмента')
                if (error instanceof DocumentValidationError) {
                    validationFailures += 1
                    if (validationFailures >= MAX_SAME_ERROR_ATTEMPTS) {
                        result = JSON.stringify({ ok: false, error: errorMessage })
                        messages.push({ role: 'tool', content: result, tool_call_id: call.id })
                        options.onToolResult?.(requests, call.function.name, result, toolError)
                        return finish(
                            'awaiting_human',
                            `Проверка черновика не прошла дважды; требуется человек: ${errorMessage}`,
                        )
                    }
                }
                humanRequired ||= needsHuman(errorMessage)
                result = JSON.stringify({ ok: false, error: errorMessage })
            }
            messages.push({ role: 'tool', content: result, tool_call_id: call.id })
            options.onToolResult?.(requests, call.function.name, result, toolError)
            if (toolError) {
                const errorMessage = (() => {
                    try {
                        return (JSON.parse(result) as { error?: unknown }).error
                    } catch {
                        return result
                    }
                })()
                const repeated = repeatedError('tool', typeof errorMessage === 'string' ? errorMessage : result)
                if (repeated) return finish('error', repeated)
            }
        }
    }

    return finish('limit', `Достигнут лимит обращений к модели: ${maxRequests}`)
}

export function runConfiguredAgentLoop(initialMessages: ChatMessage[], options: Omit<Partial<AgentLoopOptions>, 'requestModel' | 'runTool'> = {}) {
    return runAgentLoop(initialMessages, {
        ...options,
        requestModel: (messages, maxOutputTokens, timeoutMs) =>
            requestChatCompletion(messages, DOCUMENT_TOOL_DEFINITIONS, maxOutputTokens, timeoutMs),
        runTool: executeTool,
    })
}

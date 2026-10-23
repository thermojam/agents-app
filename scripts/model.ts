import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REQUEST_TIMEOUT_MS = 15_000
const MAX_TOKENS = 40
const DEFAULT_BASE_URL = 'https://simple-claw.ru/v1'
const DEFAULT_MODEL = 'claude-haiku-4-5'
const DEFAULT_PROMPT = 'Объясни слово «инструмент» одним предложением.'

type ChatCompletionResponse = {
    choices?: Array<{
        message?: {
            content?: unknown
            tool_calls?: unknown
        }
        finish_reason?: unknown
    }>
    usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
    }
}

export type ChatMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    tool_calls?: ToolCall[]
    tool_call_id?: string
}

export type ToolCall = {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

export type ToolDefinition = {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: Record<string, unknown>
    }
}

export type ChatCompletionResult = {
    baseUrl: string
    model: string
    message: ChatMessage
    finishReason: string | null
    usage?: ChatCompletionResponse['usage']
}

export type ModelCheckResult = {
    baseUrl: string
    model: string
    prompt: string
    answer: string
    usage?: ChatCompletionResponse['usage']
}

export async function requestChatCompletion(
    messages: ChatMessage[],
    tools: ToolDefinition[] = [],
    maxTokens = 120,
    timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<ChatCompletionResult> {
    const { apiKey, baseUrl, model } = getConfig()
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages,
            ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
            max_tokens: maxTokens,
            temperature: 0.2,
        }),
        signal: AbortSignal.timeout(timeoutMs),
    }).catch((error: unknown) => {
        if (error instanceof Error && error.name === 'TimeoutError') {
            throw new Error(`SimpleClaw не ответил за ${Math.round(timeoutMs / 1_000)} секунд`)
        }
        throw new Error('Не удалось обратиться к SimpleClaw: проверь сеть и LLM_BASE_URL')
    })

    if (!response.ok) throw errorForStatus(response.status)

    let payload: ChatCompletionResponse
    try {
        payload = (await response.json()) as ChatCompletionResponse
    } catch {
        throw new Error('SimpleClaw вернул ответ не в формате JSON')
    }

    const rawMessage = payload.choices?.[0]?.message
    if (!rawMessage || typeof rawMessage !== 'object') {
        throw new Error('SimpleClaw не вернул сообщение ассистента')
    }

    const content = rawMessage.content
    const toolCalls = rawMessage.tool_calls
    const message: ChatMessage = {
        role: 'assistant',
        content: typeof content === 'string' ? content : null,
        ...(Array.isArray(toolCalls) ? { tool_calls: toolCalls as ToolCall[] } : {}),
    }

    return {
        baseUrl,
        model,
        message,
        finishReason: typeof payload.choices?.[0]?.finish_reason === 'string' ? payload.choices[0].finish_reason : null,
        usage: payload.usage,
    }
}

function readDotEnv(): Record<string, string> {
    try {
        return Object.fromEntries(
            readFileSync(resolve('.env'), 'utf8')
                .split(/\r?\n/)
                .filter((line) => line.trim() && !line.trim().startsWith('#'))
                .map((line) => {
                    const separator = line.indexOf('=')
                    if (separator < 1) return ['', '']
                    const name = line.slice(0, separator).trim()
                    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
                    return [name, value]
                })
                .filter(([name]) => name),
        )
    } catch {
        return {}
    }
}

function getConfig() {
    const fileValues = readDotEnv()
    const value = (name: string, fallback = '') => process.env[name] ?? fileValues[name] ?? fallback
    const apiKey = value('LLM_API_KEY')
    if (!apiKey) throw new Error('Не найден LLM_API_KEY. Введите ключ только в локальный .env')

    const baseUrl = value('LLM_BASE_URL', DEFAULT_BASE_URL).replace(/\/+$/, '')
    const url = new URL(baseUrl)
    if (url.protocol !== 'https:') throw new Error('LLM_BASE_URL должен использовать HTTPS')

    return { apiKey, baseUrl, model: value('LLM_MODEL', DEFAULT_MODEL) }
}

function errorForStatus(status: number): Error {
    if (status === 401 || status === 403) {
        return new Error(`SimpleClaw отклонил ключ (HTTP ${status}). Проверь LLM_API_KEY и доступ модели`)
    }
    if (status === 429) return new Error('SimpleClaw отклонил запрос: превышен лимит или недостаточно средств (HTTP 429)')
    return new Error(`SimpleClaw отклонил запрос (HTTP ${status})`)
}

export async function requestHaiku(
    prompt = DEFAULT_PROMPT,
    maxTokens = MAX_TOKENS,
    timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<ModelCheckResult> {
    const result = await requestChatCompletion([{ role: 'user', content: prompt }], [], maxTokens, timeoutMs)
    const answer = result.message.content
    if (typeof answer !== 'string' || !answer.trim()) {
        throw new Error('SimpleClaw не вернул текст ответа')
    }

    return { baseUrl: result.baseUrl, model: result.model, prompt, answer: answer.trim(), usage: result.usage }
}

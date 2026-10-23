import { appendFileSync, mkdirSync } from 'node:fs'
import type { ChatCompletionResult } from './model.ts'

const MAX_RESULT_CHARS = 240

type TracePaths = {
    workDir: string
    tracePath: string
    usagePath: string
}

function redact(value: string): string {
    return value
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/(authorization\s*:\s*)\S+/gi, '$1[redacted]')
        .replace(/(LLM_API_KEY\s*[=:]\s*)\S+/gi, '$1[redacted]')
}

export function shortResult(value: string): string {
    const compact = redact(value).replace(/\s+/g, ' ').trim()
    return compact.length > MAX_RESULT_CHARS ? `${compact.slice(0, MAX_RESULT_CHARS - 1)}…` : compact
}

function append(path: string, value: Record<string, unknown>): void {
    appendFileSync(path, `${JSON.stringify(value)}\n`)
}

export function createTraceWriter(paths: TracePaths) {
    mkdirSync(paths.workDir, { recursive: true })
    let lastModel = 'unknown'

    return {
        modelResponse(step: number, response: ChatCompletionResult): void {
            lastModel = response.model
            const calls = response.message.tool_calls?.map((call) => call.function.name) ?? []
            append(paths.tracePath, {
                event: 'model_response',
                step,
                time: new Date().toISOString(),
                model: response.model,
                tool: calls.length > 0 ? calls.join(',') : null,
                result: calls.length > 0 ? `Запрошены инструменты: ${calls.join(', ')}` : shortResult(response.message.content ?? ''),
                reason: null,
            })
            const usage = response.usage
            append(paths.usagePath, {
                step,
                time: new Date().toISOString(),
                model: response.model,
                promptTokens: usage?.prompt_tokens ?? null,
                completionTokens: usage?.completion_tokens ?? null,
                totalTokens: usage?.total_tokens ?? null,
            })
        },
        modelError(step: number, reason: string): void {
            append(paths.tracePath, {
                event: 'model_error',
                step,
                time: new Date().toISOString(),
                model: lastModel,
                tool: null,
                result: 'Ошибка запроса модели',
                reason: shortResult(reason),
            })
        },
        toolResult(step: number, tool: string, result: string, error: boolean): void {
            append(paths.tracePath, {
                event: 'tool_result',
                step,
                time: new Date().toISOString(),
                model: lastModel,
                tool,
                result: shortResult(result),
                reason: error ? shortResult(result) : null,
            })
        },
        stopped(step: number, status: string, reason: string): void {
            append(paths.tracePath, {
                event: 'stopped',
                step,
                time: new Date().toISOString(),
                model: lastModel,
                tool: null,
                result: status,
                reason: shortResult(reason),
            })
        },
        budgetBlocked(reason: string): void {
            append(paths.tracePath, {
                event: 'budget_gate',
                step: 0,
                time: new Date().toISOString(),
                model: 'unknown',
                tool: null,
                result: 'Платный запуск остановлен',
                reason: shortResult(reason),
            })
        },
    }
}

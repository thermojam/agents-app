import { assertPaidExperimentsAllowed, readBudget } from './budget.ts'
import { requestChatCompletion, type ChatMessage } from './model.ts'

export const SUGGESTION_MAX_CHARS = 2_000
const SUGGESTION_MAX_TOKENS = 800
const SUGGESTION_TIMEOUT_MS = 60_000

const SYSTEM_PROMPT =
    'Ты редактор учебного текста на русском языке. Предложи более понятную формулировку для одного блока. ' +
    'Сохрани смысл, факты, оговорки и учебные примеры; не добавляй новых фактов. ' +
    'Ответ — только JSON вида {"text": "..."} без пояснений и без разметки.'

// Ответ модели — недоверенный ввод: принимаем только объект с единственным полем text.
export function parseSuggestion(content: string | null): string {
    let value: unknown
    try {
        value = JSON.parse(content ?? '')
    } catch {
        throw new Error('Ответ модели не в формате JSON')
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Ответ модели должен быть JSON-объектом')
    }
    const record = value as Record<string, unknown>
    if (Object.keys(record).some((key) => key !== 'text')) {
        throw new Error('Ответ модели содержит лишние поля')
    }
    const text = record.text
    if (typeof text !== 'string' || text.trim() === '' || text.length > SUGGESTION_MAX_CHARS) {
        throw new Error('Ответ модели должен содержать непустую строку text')
    }
    return text.trim()
}

export async function suggestBlockText(text: string): Promise<string> {
    assertPaidExperimentsAllowed(readBudget())
    const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
    ]
    const reply = await requestChatCompletion(messages, [], SUGGESTION_MAX_TOKENS, SUGGESTION_TIMEOUT_MS)
    return parseSuggestion(reply.message.content)
}

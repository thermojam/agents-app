import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findUnexplainedTerms } from './terms.ts'
import { executeTool } from './tools.ts'
import { runAgentLoop } from './agent-loop.ts'
import { createTraceWriter } from './trace.ts'
import type { ChatCompletionResult, ChatMessage, ToolCall } from './model.ts'
import type { DocumentContent } from '../src/document.ts'

function fixture(text: string): DocumentContent {
    return {
        title: 'Тест терминов',
        sourceUrl: 'https://developers.openai.com/tracks/building-agents',
        sections: [{
            id: 'section',
            title: 'Термины',
            sourcePartId: 'section-1',
            blocks: [{ id: 'paragraph', type: 'paragraph', text, sourcePartId: 'section-1' }],
        }],
    }
}

const missing = findUnexplainedTerms(fixture('В тексте встречается RAG без пояснения.'), ['RAG'])
if (!missing.unexplainedTerms.includes('RAG')) throw new Error('Термин без объяснения не обнаружен')

const explained = findUnexplainedTerms(fixture('RAG: поиск подходящих фрагментов текста.'), ['RAG'])
if (!explained.allExplained) throw new Error('Термин с объяснением не принят')

const temporaryDir = mkdtempSync(join(tmpdir(), 'agents-app-terms-check-'))
const trace = createTraceWriter({
    workDir: temporaryDir,
    tracePath: join(temporaryDir, 'trace.jsonl'),
    usagePath: join(temporaryDir, 'usage.jsonl'),
})

function response(message: ChatMessage): ChatCompletionResult {
    return { baseUrl: 'fixture://model', model: 'fixture-model', message, finishReason: 'stop' }
}

const call: ToolCall = { id: 'terms-1', type: 'function', function: { name: 'find_unexplained_terms', arguments: '{}' } }
let responseIndex = 0
const responses = [
    response({ role: 'assistant', content: null, tool_calls: [call] }),
    response({ role: 'assistant', content: 'Проверка понятности завершена.' }),
]

try {
    const result = await runAgentLoop([{ role: 'user', content: 'Проверь термины' }], {
        requestModel: async () => responses[responseIndex++] ?? (() => { throw new Error('лишний запрос') })(),
        runTool: executeTool,
        onModelResponse: (step, modelResponse) => trace.modelResponse(step, modelResponse),
        onToolResult: (step, tool, output, error) => trace.toolResult(step, tool, output, error),
        onStop: (step, status, reason) => trace.stopped(step, status, reason),
    })
    if (result.status !== 'completed' || !result.messages.some((message) => message.role === 'tool' && message.content?.includes('jailbreak'))) {
        throw new Error('Результат инструмента не вернулся модели: ' + JSON.stringify(result))
    }
    const traceText = readFileSync(join(temporaryDir, 'trace.jsonl'), 'utf8')
    if (!traceText.includes('"tool":"find_unexplained_terms"') || !traceText.includes('jailbreak')) {
        throw new Error('В журнале нет вызова и результата find_unexplained_terms')
    }
} finally {
    rmSync(temporaryDir, { recursive: true, force: true })
}

console.log('T19: термин без пояснения найден, термин с пояснением принят, результат вернулся модели и записан в trace')

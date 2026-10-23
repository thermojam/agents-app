import { getDocumentStatus, executeGetDocumentStatus } from './document-status.ts'

const status = getDocumentStatus()
if (status.state !== 'awaiting_approval' || !status.draft || status.approval || status.pdf) {
    throw new Error(`Ожидался статус «текст не утверждён»: ${JSON.stringify(status)}`)
}

const result = JSON.parse(executeGetDocumentStatus('{}')) as typeof status
if (result.state !== 'awaiting_approval') throw new Error('Инструмент вернул неверное состояние документа')

for (const invalid of ['{"path":"/tmp/secret"}', '[]', 'not-json']) {
    try {
        executeGetDocumentStatus(invalid)
        throw new Error(`Лишние или неверные аргументы неожиданно приняты: ${invalid}`)
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('не принимает аргументы') && !error.message.includes('JSON')) throw error
    }
}

console.log('T11 local: get_document_status возвращает «текст не утверждён»; произвольный путь и неверные аргументы отклонены')

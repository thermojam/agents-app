import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
    formatDocumentText,
    getWorkPaths,
    readValidatedDraft,
    revokeApproval,
    saveApproval,
} from './approval.ts'
import type { SourceDocument } from '../src/document.ts'
import { markReportHumanVerified } from './report.ts'

async function main() {
    const workName = process.argv[2]
    if (!workName) throw new Error('Использование: npm run approve -- "ИМЯ_РАБОТЫ"')

    const paths = getWorkPaths(workName)
    const source = JSON.parse(readFileSync(resolve(paths.workDir, 'source.json'), 'utf8')) as SourceDocument
    const document = readValidatedDraft(paths.draftPath, source)

    console.log('Текст, который будет утверждён:')
    console.log('---')
    console.log(formatDocumentText(document))
    console.log('---')

    const readline = createInterface({input, output})
    try {
        const answer = (await readline.question('Утвердить этот текст? Введите yes/да или no/нет: ')).trim().toLowerCase()
        if (['yes', 'y', 'да', 'д', 'утвердить'].includes(answer)) {
            const approval = saveApproval(paths.approvalPath, document)
            markReportHumanVerified(paths.reportPath, paths.manualReviewPath, document)
            console.log(`Текст утверждён. Контрольная строка: ${approval.contentSha256}`)
            console.log(`Файл: ${paths.approvalPath}`)
            return
        }
        if (['no', 'n', 'нет', 'н', 'отклонить'].includes(answer)) {
            revokeApproval(paths.approvalPath)
            console.log('Текст отклонён. Печать запрещена до нового утверждения.')
            return
        }
        throw new Error('Нужно явно ввести yes/да или no/нет')
    } finally {
        readline.close()
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    await main()
}

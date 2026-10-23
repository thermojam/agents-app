import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { runAgentResume } from './agent.ts'

async function main() {
    const workName = process.argv[2]
    if (!workName) throw new Error('Использование: npm run agent:resume -- "ИМЯ_РАБОТЫ"')
    await runAgentResume(workName)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
}

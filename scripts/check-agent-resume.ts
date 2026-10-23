import { existsSync, unlinkSync, readFileSync } from 'node:fs'
import { getAgentPaths, runAgentResume } from './agent.ts'
import { getWorkPaths, readValidatedDraft, saveApproval } from './approval.ts'
import type { SourceDocument } from './source.ts'

const workName = 'building-agents'
const agentPaths = getAgentPaths(workName)
const workPaths = getWorkPaths(workName)
const source = JSON.parse(readFileSync('docs/agents-tools/source.json', 'utf8')) as SourceDocument

if (existsSync(agentPaths.approvalPath) || existsSync(agentPaths.outputPath)) {
    throw new Error('T14 check требует чистого состояния: approval.json и guide.pdf должны отсутствовать')
}

try {
    try {
        await runAgentResume(workName)
        throw new Error('Resume неожиданно разрешён без approval')
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('сначала явно утвердите')) throw error
    }

    const document = readValidatedDraft(workPaths.draftPath, source)
    saveApproval(workPaths.approvalPath, document)
    const outputPath = await runAgentResume(workName)
    if (outputPath !== agentPaths.outputPath || !existsSync(agentPaths.outputPath)) {
        throw new Error('Resume не создал PDF из актуального утверждённого текста')
    }
    console.log('T14 resume: без approval печать запрещена; после тестового approval resume создал PDF из текущего draft.json')
} finally {
    if (existsSync(agentPaths.approvalPath)) unlinkSync(agentPaths.approvalPath)
    if (existsSync(agentPaths.outputPath)) unlinkSync(agentPaths.outputPath)
}

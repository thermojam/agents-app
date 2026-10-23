import { existsSync } from 'node:fs'
import { getAgentPaths } from './agent.ts'

export type DocumentStatus = {
    workName: string
    draft: boolean
    preview: boolean
    approval: boolean
    pdf: boolean
    state: 'missing_draft' | 'awaiting_approval' | 'approved_without_pdf' | 'ready'
    message: string
}

export function parseEmptyArguments(argumentsText: string): void {
    let value: unknown
    try {
        value = JSON.parse(argumentsText)
    } catch {
        throw new Error('get_document_status получил аргументы не в формате JSON')
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).length > 0) {
        throw new Error('get_document_status не принимает аргументы')
    }
}

export function getDocumentStatus(): DocumentStatus {
    const paths = getAgentPaths()
    const draft = existsSync(paths.draftPath)
    const preview = existsSync(paths.previewPath)
    const approval = existsSync(paths.approvalPath)
    const pdf = existsSync(paths.outputPath)
    const state = !draft
        ? 'missing_draft'
        : !approval
          ? 'awaiting_approval'
          : !pdf
            ? 'approved_without_pdf'
            : 'ready'

    return {
        workName: 'building-agents',
        draft,
        preview,
        approval,
        pdf,
        state,
        message: state === 'awaiting_approval' ? 'Текст не утверждён человеком' : state,
    }
}

export function executeGetDocumentStatus(argumentsText: string): string {
    parseEmptyArguments(argumentsText)
    return JSON.stringify(getDocumentStatus())
}

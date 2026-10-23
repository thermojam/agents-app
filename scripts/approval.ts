import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateDocument } from '../src/document.ts'
import type { DocumentContent, SourceDocument } from '../src/document.ts'

export type ApprovalRecord = {
    contentSha256: string
}

export type WorkPaths = {
    workDir: string
    draftPath: string
    approvalPath: string
    previewPath: string
    outputPath: string
    reportPath: string
    manualReviewPath: string
}

export function getWorkPaths(workName: string): WorkPaths {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workName)) {
        throw new Error('Использование: npm run approve -- "ИМЯ_РАБОТЫ"')
    }

    const workDir = resolve('docs/agents-tools', workName)
    return {
        workDir,
        draftPath: join(workDir, 'draft.json'),
        approvalPath: join(workDir, 'approval.json'),
        previewPath: join(workDir, 'preview.html'),
        outputPath: join(workDir, 'guide.pdf'),
        reportPath: join(workDir, 'report.json'),
        manualReviewPath: join(workDir, 'manual-review.md'),
    }
}

export function readValidatedDraft(draftPath: string, source: SourceDocument): DocumentContent {
    const draft = JSON.parse(readFileSync(draftPath, 'utf8')) as unknown
    return validateDocument(draft, source)
}

export function contentSha256(document: DocumentContent): string {
    return createHash('sha256').update(JSON.stringify(document), 'utf8').digest('hex')
}

function parseApproval(value: unknown): ApprovalRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('approval.json имеет неверный формат')
    }
    const contentSha256Value = (value as { contentSha256?: unknown }).contentSha256
    if (typeof contentSha256Value !== 'string' || !/^[a-f0-9]{64}$/.test(contentSha256Value)) {
        throw new Error('approval.json не содержит корректную контрольную строку')
    }
    return {contentSha256: contentSha256Value}
}

export function saveApproval(approvalPath: string, document: DocumentContent): ApprovalRecord {
    const approval = {contentSha256: contentSha256(document)}
    const temporaryPath = `${approvalPath}.tmp-${process.pid}`
    writeFileSync(temporaryPath, `${JSON.stringify(approval, null, 2)}\n`)
    renameSync(temporaryPath, approvalPath)
    return approval
}

export function revokeApproval(approvalPath: string): void {
    if (existsSync(approvalPath)) unlinkSync(approvalPath)
}

export function readApprovedDraft(
    draftPath: string,
    approvalPath: string,
    source: SourceDocument,
): DocumentContent {
    const document = readValidatedDraft(draftPath, source)
    let approval: ApprovalRecord
    try {
        approval = parseApproval(JSON.parse(readFileSync(approvalPath, 'utf8')))
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            throw new Error('Печать запрещена: черновик ещё не утверждён')
        }
        throw error
    }

    if (approval.contentSha256 !== contentSha256(document)) {
        throw new Error('Печать запрещена: черновик изменился, требуется новое утверждение')
    }
    return document
}

export function formatDocumentText(document: DocumentContent): string {
    const lines = [document.title, '']
    for (const section of document.sections) {
        lines.push(section.title, '')
        for (const block of section.blocks) {
            if (block.type === 'heading') lines.push(`${'#'.repeat(block.level)} ${block.text}`, '')
            if (block.type === 'paragraph') lines.push(block.text, '')
            if (block.type === 'list') {
                lines.push(...block.items.map((item) => `- ${item}`), '')
            }
            if (block.type === 'example') lines.push(`[${block.label}] ${block.text}`, '')
        }
    }
    return lines.join('\n').trim()
}

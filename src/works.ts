import {type DocumentContent, type SourceDocument, validateDocument} from './document'

export async function fetchWorkNames(): Promise<string[]> {
    const response = await fetch('/api/works')
    if (!response.ok) throw new Error('Не удалось получить список работ')
    return response.json()
}

export async function loadWork(name: string): Promise<DocumentContent> {
    const response = await fetch(`/api/works/${name}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return validateDocument(data.draft, data.source as SourceDocument)
}

export async function saveWork(name: string, document: DocumentContent): Promise<{changed: boolean; approvalRevoked: boolean}> {
    const response = await fetch(`/api/works/${name}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(document),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return data
}

export type WorkStatus = {approved: boolean; printed: 'none' | 'current' | 'older'}

async function postWork(name: string, action: string): Promise<WorkStatus> {
    const response = await fetch(`/api/works/${name}/${action}`, {method: 'POST'})
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return data
}

export async function fetchWorkStatus(name: string): Promise<WorkStatus> {
    const response = await fetch(`/api/works/${name}/status`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return data
}

export function approveWork(name: string): Promise<WorkStatus> {
    return postWork(name, 'approve')
}

export function printWork(name: string): Promise<WorkStatus> {
    return postWork(name, 'print')
}

export async function suggestBlockText(name: string, blockId: string, text: string): Promise<string> {
    const response = await fetch(`/api/works/${name}/suggest`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({blockId, text}),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return data.text
}

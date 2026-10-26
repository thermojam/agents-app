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

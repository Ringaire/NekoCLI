export type ModelRole = 'heavy' | 'balanced' | 'light' | 'coding'

export interface ModelCatalogEntry {
  id: string
  role: ModelRole
}

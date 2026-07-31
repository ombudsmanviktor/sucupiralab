export interface UserProfile {
  id: string
  display_name: string | null
  email: string | null
  avatar_url: string | null
}

export interface Anexo {
  id: string
  name: string
  size: number
  url: string        // blob URL in demo mode; raw GitHub URL in GitHub mode
  type: string       // MIME type
  path?: string      // repo-relative path for GitHub mode (e.g. "attachments/prestacoes/id/file.pdf")
}

export interface Prestacao {
  id: string
  user_id: string
  titulo: string
  numero_processo?: string
  numero_edital?: string
  nome_edital?: string
  agencia_fomento?: string
  vigencia_inicio?: string
  vigencia_fim?: string
  total_recursos?: number
  observacoes_rubricas?: string
  anexos?: Anexo[]   // edital / financing docs
  created_at: string
  updated_at: string
}

export interface Despesa {
  id: string
  user_id: string
  prestacao_id: string
  descricao: string
  data: string
  valor: number
  numero_nota_fiscal?: string
  prestador_servico?: string
  rubrica?: string
  anexos?: Anexo[]   // receipts, invoices, etc.
  created_at: string
}

export interface Discurso {
  id: string
  user_id: string
  ano: number
  descricao: string
  justificativa?: string
  links_comprovacao?: string   // newline-separated list of URLs
  repercussoes_produtos?: string
  created_at: string
}

export interface ProjetoFinanciado {
  id: string
  user_id: string
  nome_projeto: string
  numero_processo?: string
  chamadas_editais?: string
  financiadores?: string
  instituicoes_envolvidas?: string
  docentes_envolvidos?: string[]
  total_aportes?: number
  vigencia_inicio?: string
  vigencia_fim?: string
  resumo_projeto?: string
  created_at: string
}

// A single meeting / annotation log entry
export interface NotaReuniao {
  id: string
  data?: string     // ISO date, optional — entries without date are undated
  texto: string
  anexo?: Anexo     // optional file attachment
}

export interface Orientacao {
  id: string
  user_id: string
  nome_orientando: string
  curso: string
  titulo_provisorio?: string
  ano_ingresso?: number
  previsao_conclusao?: string
  exame_qualificacao?: boolean  // Mestrado / Doutorado only
  arquivada?: boolean
  leituras?: string[]
  notas_orientacao?: string     // legacy free-text field (kept for compat)
  reunioes?: NotaReuniao[]      // structured meeting log
  links_documentos?: string[]   // multiple doc/link URLs
  projeto_original?: Anexo      // attached file
  created_at: string
  updated_at: string
}

export interface Tarefa {
  id: string
  user_id: string
  orientacao_id: string
  descricao: string
  concluida: boolean
  created_at: string
}

export interface Publicacao {
  id: string
  user_id: string
  tipo: 'artigo' | 'capitulo' | 'congresso' | 'livro' | 'patente' | 'outro'
  titulo: string
  autores: string[]
  ano: number
  venue?: string
  doi?: string
  qualis?: string
  citacoes?: number
  created_at: string
  updated_at: string
}

export interface Nucleacao {
  id: string
  user_id: string
  nome_egresso: string
  curso: 'Mestrado' | 'Doutorado' | 'Pós-Doutorado'
  ano_conclusao: number
  ano_nucleacao: number
  tipo_insercao: 'Bolsa' | 'Contrato Temporário' | 'Contrato Permanente'
  agencia_fomento?: string
  tipo_instituicao?: 'Pública' | 'Privada'
  nome_instituicao?: string
  observacoes?: string
  created_at: string
  updated_at: string
}

export interface Internacionalizacao {
  id: string
  user_id: string
  titulo: string
  ano_inicio: number
  situacao: 'Em Andamento' | 'Concluída'
  ano_encerramento?: number
  programas_pos?: string[]
  instituicoes?: string[]
  membros_equipe?: string[]
  edital?: string
  financiamento?: string
  recursos?: string
  descricao?: string
  resultados?: string
  created_at: string
  updated_at: string
}

import { useAuth } from '@/contexts/AuthContext'
import type { Prestacao, Despesa, Discurso, ProjetoFinanciado, Orientacao, Nucleacao, Internacionalizacao } from '@/types'

const DEMO_PRESTACOES: Prestacao[] = [
  {
    id: '1', user_id: 'demo-user-id', titulo: 'Prestação de Contas — Edital Universal CNPq',
    numero_processo: '403212/2023-1', numero_edital: 'MCTI/CNPq 14/2023', nome_edital: 'Edital Universal',
    agencia_fomento: 'CNPq', vigencia_inicio: '2023-03-01', vigencia_fim: '2025-02-28',
    total_recursos: 120000, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: '2', user_id: 'demo-user-id', titulo: 'Prestação de Contas — FAPERJ Jovem Cientista',
    numero_processo: 'E-26/203.124/2022', numero_edital: 'FAPERJ JC 2022', nome_edital: 'Jovem Cientista do Nosso Estado',
    agencia_fomento: 'FAPERJ', vigencia_inicio: '2022-07-01', vigencia_fim: '2024-06-30',
    total_recursos: 75000, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
]

const DEMO_DESPESAS: Despesa[] = [
  { id: '1', user_id: 'demo-user-id', prestacao_id: '1', descricao: 'Material de laboratório', data: '2023-05-10', valor: 4500, numero_nota_fiscal: 'NF-001234', prestador_servico: 'Lab Supplies Ltda', rubrica: 'Material de Consumo', created_at: new Date().toISOString() },
  { id: '2', user_id: 'demo-user-id', prestacao_id: '1', descricao: 'Passagem aérea — congresso', data: '2023-09-15', valor: 1200, prestador_servico: 'GOL Linhas Aéreas', rubrica: 'Passagens e Locomoção', created_at: new Date().toISOString() },
  { id: '3', user_id: 'demo-user-id', prestacao_id: '2', descricao: 'Bolsa pesquisador colaborador', data: '2023-01-15', valor: 3000, prestador_servico: 'Nome do Pesquisador', rubrica: 'Bolsas', created_at: new Date().toISOString() },
]

const DEMO_DISCURSOS: Discurso[] = [
  { id: '1', user_id: 'demo-user-id', ano: 2024, descricao: 'Palestra "IA na Educação" — Congresso Internacional de Educação', justificativa: 'Divulgação de resultados de pesquisa em contexto internacional', links_comprovacao: 'https://congresso.edu.br/2024', repercussoes_produtos: 'Artigo derivado submetido à revista Nature Education', created_at: new Date().toISOString() },
  { id: '2', user_id: 'demo-user-id', ano: 2023, descricao: 'Mesa-redonda "Pós-graduação e Inovação" — SNPG', justificativa: 'Participação no Seminário Nacional de Pós-Graduação', created_at: new Date().toISOString() },
]

const DEMO_PROJETOS: ProjetoFinanciado[] = [
  { id: '1', user_id: 'demo-user-id', nome_projeto: 'Aprendizado de Máquina em Dados Educacionais', numero_processo: '403212/2023-1', chamadas_editais: 'MCTI/CNPq 14/2023', financiadores: 'CNPq', docentes_envolvidos: ['Prof. Dr. João Silva', 'Prof. Dra. Maria Santos'], total_aportes: 120000, vigencia_inicio: '2023-03-01', vigencia_fim: '2025-02-28', created_at: new Date().toISOString() },
  { id: '2', user_id: 'demo-user-id', nome_projeto: 'Análise de Redes Sociais Acadêmicas', financiadores: 'FAPERJ', docentes_envolvidos: ['Prof. Dr. João Silva'], total_aportes: 75000, vigencia_inicio: '2022-07-01', vigencia_fim: '2024-06-30', created_at: new Date().toISOString() },
]

const DEMO_ORIENTACOES: Orientacao[] = [
  {
    id: '1', user_id: 'demo-user-id',
    nome_orientando: 'Ana Carolina Mendes', curso: 'Doutorado',
    titulo_provisorio: 'Mineração de Dados em Plataformas de EaD',
    ano_ingresso: 2022, previsao_conclusao: '2026',
    exame_qualificacao: true,
    leituras: ['Breiman, L. (2001). Random Forests', 'Goodfellow et al. (2016). Deep Learning'],
    reunioes: [
      { id: 'r1', data: '2024-03-15', texto: 'Discutimos o capítulo 3. Revisar metodologia de avaliação.' },
      { id: 'r2', data: '2024-01-10', texto: 'Revisão da proposta inicial. Ajustar escopo da pesquisa e cronograma.' },
    ],
    links_documentos: ['https://drive.google.com/exemplo-proposta-qualificacao'],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: '2', user_id: 'demo-user-id',
    nome_orientando: 'Bruno Rodrigues Lima', curso: 'Mestrado',
    titulo_provisorio: 'Chatbots Educacionais com LLMs',
    ano_ingresso: 2023, previsao_conclusao: '2025',
    exame_qualificacao: false,
    reunioes: [
      { id: 'r3', texto: 'Definição do tema e objetivos da pesquisa. Revisar literatura sobre LLMs.' },
    ],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: '3', user_id: 'demo-user-id',
    nome_orientando: 'Carla Ferreira Nunes', curso: 'Iniciação Científica',
    titulo_provisorio: 'Análise de Sentimentos em Fóruns Educacionais',
    ano_ingresso: 2024,
    reunioes: [],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
]

const DEMO_NUCLEACOES: Nucleacao[] = [
  {
    id: '1', user_id: 'demo-user-id',
    nome_egresso: 'Ana Carolina Mendes',
    curso: 'Doutorado',
    ano_conclusao: 2023,
    ano_nucleacao: 2023,
    tipo_insercao: 'Contrato Permanente',
    tipo_instituicao: 'Pública',
    nome_instituicao: 'UFF — Universidade Federal Fluminense',
    observacoes: 'Aprovada em concurso público para professora adjunta.',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: '2', user_id: 'demo-user-id',
    nome_egresso: 'Bruno Rodrigues Lima',
    curso: 'Mestrado',
    ano_conclusao: 2022,
    ano_nucleacao: 2023,
    tipo_insercao: 'Bolsa',
    agencia_fomento: 'CAPES — Programa de Fixação de Doutores',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: '3', user_id: 'demo-user-id',
    nome_egresso: 'Carla Ferreira Nunes',
    curso: 'Pós-Doutorado',
    ano_conclusao: 2024,
    ano_nucleacao: 2024,
    tipo_insercao: 'Contrato Temporário',
    tipo_instituicao: 'Privada',
    nome_instituicao: 'PUC-Rio — Pontifícia Universidade Católica do Rio de Janeiro',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
]

const DEMO_INTERNACIONALIZACOES: Internacionalizacao[] = [
  {
    id: '1', user_id: 'demo-user-id',
    titulo: 'Cooperação Brasil-França em Inteligência Artificial Educacional',
    ano_inicio: 2022,
    situacao: 'Em Andamento',
    programas_pos: ['Informática', 'Educação'],
    instituicoes: ['Université Paris-Saclay', 'INRIA'],
    membros_equipe: ['Prof. Dr. João Silva', 'Dra. Marie Dupont', 'Ana Mendes'],
    edital: 'CAPES-COFECUB 2022',
    financiamento: 'CAPES PrInt, COFECUB',
    recursos: 'R$ 120.000,00 / € 30.000',
    descricao: 'Projeto de cooperação focado em algoritmos de recomendação para EaD.',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: '2', user_id: 'demo-user-id',
    titulo: 'Rede Ibero-Americana de Pesquisa em Mineração de Dados Educacionais',
    ano_inicio: 2020,
    situacao: 'Concluída',
    ano_encerramento: 2023,
    programas_pos: ['Informática', 'Ciência da Computação'],
    instituicoes: ['Universidad Complutense de Madrid', 'Universidad de Buenos Aires', 'UNAM'],
    membros_equipe: ['Prof. Dr. João Silva', 'Prof. Carlos García', 'Dra. Laura Martínez'],
    financiamento: 'CNPq Universal',
    recursos: 'R$ 80.000,00',
    resultados: 'Publicados 5 artigos em coautoria internacional, 2 teses co-orientadas.',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
]

export function useDemoData() {
  const { isDemoMode } = useAuth()
  return {
    isDemoMode,
    prestacoes: DEMO_PRESTACOES,
    despesas: DEMO_DESPESAS,
    discursos: DEMO_DISCURSOS,
    projetos: DEMO_PROJETOS,
    orientacoes: DEMO_ORIENTACOES,
    nucleacoes: DEMO_NUCLEACOES,
    internacionalizacoes: DEMO_INTERNACIONALIZACOES,
  }
}

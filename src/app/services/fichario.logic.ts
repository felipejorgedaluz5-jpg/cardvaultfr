/**
 * Lógica pura dos fichários (sem Angular, sem armazenamento): tamanhos, espaços, cópias
 * disponíveis da coleção, busca e saneamento de dados salvos.
 */

export const LINHAS_MAX = 6;
export const COLUNAS_MAX = 6;
export const PAGINAS_MAX = 200;
export const NOME_MAX = 40;

/** carta como o fichário a enxerga na coleção (subconjunto de `Carta` da página Coleção) */
export interface CartaColecao {
  id: string;
  nome: string;
  imagem: string;
  qtd: number;
  /** ausente em dados antigos: vale como NM */
  condicao?: string;
}

/** cópia guardada no espaço; é uma "foto" da carta, então o espaço continua certo mesmo se a coleção mudar */
export interface CartaNoEspaco {
  id: string;
  nome: string;
  imagem: string;
  condicao: string;
}

export interface Fichario {
  id: string;
  nome: string;
  /** foto de capa (data URL já reduzida) ou null */
  capa: string | null;
  linhas: number;
  colunas: number;
  paginas: number;
  /** chave `${pagina}:${indice}` (pagina e indice começam em 0) */
  espacos: Record<string, CartaNoEspaco>;
}

export interface TamanhoPredefinido {
  rotulo: string;
  linhas: number;
  colunas: number;
}

/** tamanhos mais comuns de fichário; o usuário também pode digitar linhas e colunas */
export const TAMANHOS: TamanhoPredefinido[] = [
  { rotulo: '4 bolsos', linhas: 2, colunas: 2 },
  { rotulo: '9 bolsos', linhas: 3, colunas: 3 },
  { rotulo: '12 bolsos', linhas: 3, colunas: 4 },
  { rotulo: '16 bolsos', linhas: 4, colunas: 4 },
];

export function limitar(valor: number, min: number, max: number): number {
  if (!Number.isFinite(valor)) return min;
  return Math.min(max, Math.max(min, Math.floor(valor)));
}

export function chaveEspaco(pagina: number, indice: number): string {
  return `${pagina}:${indice}`;
}

export function chaveCarta(id: string, condicao?: string): string {
  return `${id}|${condicao || 'NM'}`;
}

export function espacosPorPagina(f: Pick<Fichario, 'linhas' | 'colunas'>): number {
  return f.linhas * f.colunas;
}

export function totalEspacos(f: Pick<Fichario, 'linhas' | 'colunas' | 'paginas'>): number {
  return espacosPorPagina(f) * f.paginas;
}

export function totalOcupados(f: Pick<Fichario, 'espacos'>): number {
  return Object.keys(f.espacos).length;
}

/** linha e coluna (a partir de 1) de um espaço dentro da página */
export function posicao(indice: number, colunas: number): { linha: number; coluna: number } {
  return { linha: Math.floor(indice / colunas) + 1, coluna: (indice % colunas) + 1 };
}

export function rotuloTamanho(f: Pick<Fichario, 'linhas' | 'colunas'>): string {
  return `${f.linhas}×${f.colunas} · ${espacosPorPagina(f)} bolsos`;
}

/** minúsculas e sem acento, para a busca achar "pikachu" em "Pikáchu" */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** quantas cópias de cada carta (id + condição) já estão em algum fichário */
export function contarUsadas(fichas: Fichario[]): Map<string, number> {
  const usadas = new Map<string, number>();
  for (const f of fichas) {
    for (const c of Object.values(f.espacos)) {
      const k = chaveCarta(c.id, c.condicao);
      usadas.set(k, (usadas.get(k) ?? 0) + 1);
    }
  }
  return usadas;
}

export interface CartaDisponivel {
  carta: CartaColecao & { condicao: string };
  usadas: number;
  livres: number;
}

/**
 * Cartas da coleção com quantas cópias ainda estão livres para colocar num fichário.
 * `substituindo` é a carta que já está no espaço que está sendo editado: ela volta a ficar livre.
 */
export function listarDisponiveis(
  colecao: CartaColecao[],
  fichas: Fichario[],
  substituindo?: CartaNoEspaco | null,
): CartaDisponivel[] {
  const usadas = contarUsadas(fichas);
  const chaveSubstituida = substituindo ? chaveCarta(substituindo.id, substituindo.condicao) : null;

  return colecao.map((c) => {
    const condicao = c.condicao || 'NM';
    const k = chaveCarta(c.id, condicao);
    const emUso = usadas.get(k) ?? 0;
    const livres = Math.max(0, c.qtd - emUso + (k === chaveSubstituida ? 1 : 0));
    return { carta: { ...c, condicao }, usadas: emUso, livres };
  });
}

export interface ResultadoBusca {
  fichaId: string;
  fichaNome: string;
  /** começa em 0 */
  pagina: number;
  indice: number;
  linha: number;
  coluna: number;
  carta: CartaNoEspaco;
}

/** acha as cartas dos fichários cujo nome contém todas as palavras digitadas */
export function buscar(fichas: Fichario[], termo: string): ResultadoBusca[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];

  const resultados: ResultadoBusca[] = [];
  for (const f of fichas) {
    const por = espacosPorPagina(f);
    for (const [chave, carta] of Object.entries(f.espacos)) {
      const nome = normalizar(carta.nome);
      if (!palavras.every((p) => nome.includes(p))) continue;
      const [paginaTxt, indiceTxt] = chave.split(':');
      const pagina = Number(paginaTxt);
      const indice = Number(indiceTxt);
      if (!Number.isInteger(pagina) || !Number.isInteger(indice) || indice >= por) continue;
      const { linha, coluna } = posicao(indice, f.colunas);
      resultados.push({ fichaId: f.id, fichaNome: f.nome, pagina, indice, linha, coluna, carta });
    }
  }

  const ordem = new Map(fichas.map((f, i) => [f.id, i] as const));
  return resultados.sort(
    (a, b) =>
      (ordem.get(a.fichaId) ?? 0) - (ordem.get(b.fichaId) ?? 0) || a.pagina - b.pagina || a.indice - b.indice,
  );
}

export interface GrupoBusca {
  fichaId: string;
  fichaNome: string;
  itens: ResultadoBusca[];
}

export function agruparPorFichario(resultados: ResultadoBusca[]): GrupoBusca[] {
  const grupos: GrupoBusca[] = [];
  for (const r of resultados) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.fichaId === r.fichaId) ultimo.itens.push(r);
    else grupos.push({ fichaId: r.fichaId, fichaNome: r.fichaNome, itens: [r] });
  }
  return grupos;
}

function ehTexto(v: unknown): v is string {
  return typeof v === 'string';
}

/** valida o que veio do localStorage: descarta o que estiver quebrado em vez de travar a página */
export function sanitizar(bruto: unknown): Fichario[] {
  if (!Array.isArray(bruto)) return [];
  const fichas: Fichario[] = [];

  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (!ehTexto(r['id']) || !ehTexto(r['nome'])) continue;

    const linhas = limitar(Number(r['linhas']), 1, LINHAS_MAX);
    const colunas = limitar(Number(r['colunas']), 1, COLUNAS_MAX);
    const paginas = limitar(Number(r['paginas']), 1, PAGINAS_MAX);
    const por = linhas * colunas;

    const espacos: Record<string, CartaNoEspaco> = {};
    const brutos = r['espacos'];
    if (brutos && typeof brutos === 'object') {
      for (const [chave, v] of Object.entries(brutos as Record<string, unknown>)) {
        const [p, i] = chave.split(':').map(Number);
        if (!Number.isInteger(p) || !Number.isInteger(i) || p < 0 || p >= paginas || i < 0 || i >= por) continue;
        if (!v || typeof v !== 'object') continue;
        const c = v as Record<string, unknown>;
        if (!ehTexto(c['id']) || !ehTexto(c['nome'])) continue;
        espacos[chaveEspaco(p, i)] = {
          id: c['id'],
          nome: c['nome'],
          imagem: ehTexto(c['imagem']) ? c['imagem'] : '',
          condicao: ehTexto(c['condicao']) && c['condicao'] ? c['condicao'] : 'NM',
        };
      }
    }

    fichas.push({
      id: r['id'],
      nome: r['nome'].slice(0, NOME_MAX),
      capa: ehTexto(r['capa']) && r['capa'].startsWith('data:image/') ? r['capa'] : null,
      linhas,
      colunas,
      paginas,
      espacos,
    });
  }
  return fichas;
}

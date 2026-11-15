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
  /** cor da capa (#rrggbb), usada quando não há foto; null em fichários antigos (a cor sai do id) */
  cor: string | null;
  linhas: number;
  colunas: number;
  paginas: number;
  /** chave `${lado}:${indice}` (lado e indice começam em 0; cada página tem dois lados, frente e verso) */
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

/** cores sugeridas para a capa, escolhidas para ficar bem no tema escuro */
export const CORES_CAPA = [
  '#a8323f', '#c2571a', '#c9a227', '#4f8a3c', '#1f7a74',
  '#2f5fa8', '#5b3fa0', '#9b3a82', '#5b6370', '#2a2f3a',
];

export function ehCorValida(cor: unknown): cor is string {
  return typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor);
}

/** uma cor da lista, sorteada; é a que o fichário recebe quando você não escolhe nenhuma */
export function corAleatoria(aleatorio: () => number = Math.random): string {
  return CORES_CAPA[Math.floor(aleatorio() * CORES_CAPA.length) % CORES_CAPA.length];
}

function hashTexto(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

/** cor da capa: a escolhida ou, em fichários antigos sem cor, uma da lista que sempre sai igual para o mesmo id */
export function corDaCapa(f: Pick<Fichario, 'id' | 'cor'>): string {
  return ehCorValida(f.cor) ? f.cor : CORES_CAPA[hashTexto(f.id) % CORES_CAPA.length];
}

/** texto claro ou escuro, o que ler melhor sobre a cor de fundo */
export function corDoTexto(fundo: string): string {
  if (!ehCorValida(fundo)) return '#ffffff';
  const r = parseInt(fundo.slice(1, 3), 16);
  const g = parseInt(fundo.slice(3, 5), 16);
  const b = parseInt(fundo.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#14110a' : '#ffffff';
}

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

/** cada página do fichário tem frente e verso, e os dois lados têm bolsos */
export const LADOS_POR_PAGINA = 2;

/** lados no total: lado 0 = frente da página 1, lado 1 = verso da página 1, lado 2 = frente da página 2... */
export function totalLados(f: Pick<Fichario, 'paginas'>): number {
  return f.paginas * LADOS_POR_PAGINA;
}

export function totalEspacos(f: Pick<Fichario, 'linhas' | 'colunas' | 'paginas'>): number {
  return espacosPorPagina(f) * totalLados(f);
}

export function rotuloLado(lado: number): string {
  return `Página ${Math.floor(lado / LADOS_POR_PAGINA) + 1} · ${lado % LADOS_POR_PAGINA === 0 ? 'frente' : 'verso'}`;
}

/**
 * Como o fichário aberto aparece. A primeira vista mostra só a frente da página 1 (à direita), como um
 * fichário que acabou de ser aberto; depois cada vista é uma folha dupla: verso de uma página à esquerda
 * e frente da seguinte à direita; a última mostra só o verso da última página (à esquerda).
 * Devolve [lado da esquerda, lado da direita], com null onde não há página.
 */
export function ladosDaVista(vista: number, paginas: number): [number | null, number | null] {
  if (vista <= 0) return [null, 0];
  if (vista >= paginas) return [paginas * LADOS_POR_PAGINA - 1, null];
  return [2 * vista - 1, 2 * vista];
}

export function totalVistas(paginas: number): number {
  return paginas + 1;
}

/** em que vista o lado aparece */
export function vistaDoLado(lado: number): number {
  return lado <= 0 ? 0 : Math.ceil(lado / LADOS_POR_PAGINA);
}

export function rotuloVista(vista: number, paginas: number): string {
  const [esq, dir] = ladosDaVista(vista, paginas);
  if (esq === null && dir !== null) return rotuloLado(dir);
  if (dir === null && esq !== null) return rotuloLado(esq);
  if (esq !== null && dir !== null) return `${rotuloLado(esq)} e ${rotuloLado(dir)}`;
  return '';
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

/** cartas que você pode colocar num espaço, tenha ou não na coleção */
export interface CartaEscolhida {
  id: string;
  nome: string;
  imagem: string;
  condicao?: string;
  /** só vem quando a carta saiu da coleção; o espaço não usa */
  qtd?: number;
}

export interface Faltante extends CartaNoEspaco {
  faltam: number;
}

export function chaveFaltando(fichaId: string, chaveDoEspaco: string): string {
  return `${fichaId}|${chaveDoEspaco}`;
}

/**
 * Espaços com uma carta que a coleção não cobre. A coleção é uma só para todos os fichários, então
 * as cópias que você tem são "gastas" na ordem: fichários na ordem da lista, depois página e espaço.
 * Os espaços que passam do que você tem são os que faltam.
 */
export function espacosFaltando(fichas: Fichario[], colecao: CartaColecao[]): Set<string> {
  const tenho = new Map<string, number>();
  for (const c of colecao) {
    const k = chaveCarta(c.id, c.condicao);
    tenho.set(k, (tenho.get(k) ?? 0) + c.qtd);
  }

  const vistos = new Map<string, number>();
  const faltando = new Set<string>();
  for (const f of fichas) {
    const itens = Object.entries(f.espacos)
      .map(([chave, carta]) => {
        const [p, i] = chave.split(':').map(Number);
        return { chave, p, i, carta };
      })
      .sort((a, b) => a.p - b.p || a.i - b.i);

    for (const item of itens) {
      const k = chaveCarta(item.carta.id, item.carta.condicao);
      const n = (vistos.get(k) ?? 0) + 1;
      vistos.set(k, n);
      if (n > (tenho.get(k) ?? 0)) faltando.add(chaveFaltando(f.id, item.chave));
    }
  }
  return faltando;
}

/** o que falta na coleção para cobrir um fichário, somando as cópias de cada carta e condição */
export function faltantesDoFichario(fichas: Fichario[], colecao: CartaColecao[], fichaId: string): Faltante[] {
  const ficha = fichas.find((f) => f.id === fichaId);
  if (!ficha) return [];
  const faltando = espacosFaltando(fichas, colecao);

  const soma = new Map<string, Faltante>();
  for (const [chave, carta] of Object.entries(ficha.espacos)) {
    if (!faltando.has(chaveFaltando(ficha.id, chave))) continue;
    const k = chaveCarta(carta.id, carta.condicao);
    const atual = soma.get(k);
    if (atual) atual.faltam++;
    else soma.set(k, { ...carta, faltam: 1 });
  }
  return [...soma.values()].sort((a, b) => a.nome.localeCompare(b.nome) || a.condicao.localeCompare(b.condicao));
}

export interface ResultadoBusca {
  fichaId: string;
  fichaNome: string;
  /** lado do fichário, a partir de 0 (veja `rotuloLado`) */
  lado: number;
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
      const [ladoTxt, indiceTxt] = chave.split(':');
      const lado = Number(ladoTxt);
      const indice = Number(indiceTxt);
      if (!Number.isInteger(lado) || !Number.isInteger(indice) || indice >= por || lado >= totalLados(f)) continue;
      const { linha, coluna } = posicao(indice, f.colunas);
      resultados.push({ fichaId: f.id, fichaNome: f.nome, lado, indice, linha, coluna, carta });
    }
  }

  const ordem = new Map(fichas.map((f, i) => [f.id, i] as const));
  return resultados.sort(
    (a, b) =>
      (ordem.get(a.fichaId) ?? 0) - (ordem.get(b.fichaId) ?? 0) || a.lado - b.lado || a.indice - b.indice,
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
        if (!Number.isInteger(p) || !Number.isInteger(i) || p < 0 || p >= paginas * LADOS_POR_PAGINA || i < 0 || i >= por) continue;
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
      cor: ehCorValida(r['cor']) ? r['cor'] : null,
      linhas,
      colunas,
      paginas,
      espacos,
    });
  }
  return fichas;
}

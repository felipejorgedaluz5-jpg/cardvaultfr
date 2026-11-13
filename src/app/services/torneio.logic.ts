/**
 * Lógica pura do torneio suíço (sem Angular, sem estado): pareamento, estatísticas e classificação.
 * Fica separada do serviço para poder ser testada isoladamente.
 */

/** 'a' = jogador A venceu, 'b' = jogador B venceu, 'e' = empate, null = ainda sem resultado */
export type Resultado = 'a' | 'b' | 'e' | null;

export interface Jogador {
  id: string;
  nome: string;
  /** true quando o jogador abandonou o torneio (não entra nos próximos pareamentos) */
  saiu: boolean;
}

export interface Partida {
  a: string;
  /** null = folga (bye), conta como vitória */
  b: string | null;
  resultado: Resultado;
}

export type Rodada = Partida[];

export interface Estatistica {
  id: string;
  vitorias: number;
  derrotas: number;
  empates: number;
  pontos: number;
  adversarios: string[];
  teveBye: boolean;
  /** média da % de vitórias dos adversários (cada adversário vale no mínimo 33,3%) */
  omw: number;
}

export interface LinhaClassificacao extends Estatistica {
  nome: string;
  saiu: boolean;
}

export const PONTOS_VITORIA = 3;
export const PONTOS_EMPATE = 1;
const PISO_OMW = 1 / 3;

export function calcularEstatisticas(
  jogadores: Jogador[],
  rodadas: Rodada[],
): Map<string, Estatistica> {
  const mapa = new Map<string, Estatistica>();
  for (const j of jogadores) {
    mapa.set(j.id, {
      id: j.id,
      vitorias: 0,
      derrotas: 0,
      empates: 0,
      pontos: 0,
      adversarios: [],
      teveBye: false,
      omw: 0,
    });
  }

  for (const rodada of rodadas) {
    for (const p of rodada) {
      const a = mapa.get(p.a);
      if (!a) continue;

      if (p.b === null) {
        a.vitorias++;
        a.pontos += PONTOS_VITORIA;
        a.teveBye = true;
        continue;
      }

      const b = mapa.get(p.b);
      if (!b || !p.resultado) continue;

      a.adversarios.push(p.b);
      b.adversarios.push(p.a);

      if (p.resultado === 'a') {
        a.vitorias++;
        a.pontos += PONTOS_VITORIA;
        b.derrotas++;
      } else if (p.resultado === 'b') {
        b.vitorias++;
        b.pontos += PONTOS_VITORIA;
        a.derrotas++;
      } else {
        a.empates++;
        b.empates++;
        a.pontos += PONTOS_EMPATE;
        b.pontos += PONTOS_EMPATE;
      }
    }
  }

  for (const s of mapa.values()) {
    let soma = 0;
    let contados = 0;
    for (const idAdversario of s.adversarios) {
      const o = mapa.get(idAdversario);
      if (!o) continue;
      const jogadas = o.vitorias + o.derrotas + o.empates;
      const taxa = jogadas ? o.pontos / (PONTOS_VITORIA * jogadas) : 0;
      soma += Math.max(PISO_OMW, taxa);
      contados++;
    }
    s.omw = contados ? soma / contados : 0;
  }

  return mapa;
}

/** pontos, depois OMW%, depois ordem alfabética */
export function classificar(jogadores: Jogador[], rodadas: Rodada[]): LinhaClassificacao[] {
  const stats = calcularEstatisticas(jogadores, rodadas);
  const linhas: LinhaClassificacao[] = [];
  for (const j of jogadores) {
    const s = stats.get(j.id);
    if (s) linhas.push({ ...s, nome: j.nome, saiu: j.saiu });
  }
  return linhas.sort(
    (x, y) => y.pontos - x.pontos || y.omw - x.omw || x.nome.localeCompare(y.nome),
  );
}

/** número de rodadas suíças recomendado: ceil(log2(jogadores)), no mínimo 1 */
export function rodadasRecomendadas(jogadoresAtivos: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(jogadoresAtivos, 2))));
}

/** próximo número livre para nomes no formato "Jogador N" */
export function proximoNumero(jogadores: Jogador[]): number {
  let proximo = 1;
  for (const j of jogadores) {
    const m = /^Jogador (\d+)$/.exec(j.nome);
    if (m) proximo = Math.max(proximo, Number(m[1]) + 1);
  }
  return proximo;
}

interface Candidato {
  id: string;
  pontos: number;
  teveBye: boolean;
  desempate: number;
}

/**
 * Gera a próxima rodada: ordena por pontos (empates sorteados), dá o bye ao jogador
 * mais baixo que ainda não teve um e pareia de cima para baixo sem repetir confrontos.
 * Se for impossível evitar repetição, aceita rematch como último recurso.
 */
export function parearRodada(
  jogadores: Jogador[],
  rodadas: Rodada[],
  aleatorio: () => number = Math.random,
): Rodada {
  const stats = calcularEstatisticas(jogadores, rodadas);

  const lista: Candidato[] = jogadores
    .filter((j) => !j.saiu)
    .map((j) => {
      const s = stats.get(j.id);
      return {
        id: j.id,
        pontos: s ? s.pontos : 0,
        teveBye: s ? s.teveBye : false,
        desempate: aleatorio(),
      };
    })
    .sort((x, y) => y.pontos - x.pontos || x.desempate - y.desempate);

  const jaJogaram = new Set<string>();
  for (const rodada of rodadas) {
    for (const p of rodada) {
      if (p.b !== null) {
        jaJogaram.add(`${p.a}|${p.b}`);
        jaJogaram.add(`${p.b}|${p.a}`);
      }
    }
  }

  const resultado: Rodada = [];

  if (lista.length % 2 === 1) {
    let indiceBye = -1;
    for (let i = lista.length - 1; i >= 0; i--) {
      if (!lista[i].teveBye) {
        indiceBye = i;
        break;
      }
    }
    if (indiceBye < 0) indiceBye = lista.length - 1;
    resultado.push({ a: lista[indiceBye].id, b: null, resultado: 'a' });
    lista.splice(indiceBye, 1);
  }

  function resolver(
    restantes: Candidato[],
    permitirRematch: boolean,
    orcamento: { n: number },
  ): Rodada | null {
    if (restantes.length === 0) return [];
    if (orcamento.n-- <= 0) return null;

    const primeiro = restantes[0];
    for (let j = 1; j < restantes.length; j++) {
      const outro = restantes[j];
      if (!permitirRematch && jaJogaram.has(`${primeiro.id}|${outro.id}`)) continue;
      const resto = [...restantes.slice(1, j), ...restantes.slice(j + 1)];
      const parcial = resolver(resto, permitirRematch, orcamento);
      if (parcial) return [{ a: primeiro.id, b: outro.id, resultado: null }, ...parcial];
    }
    return null;
  }

  const pares =
    resolver(lista, false, { n: 20000 }) ?? resolver(lista, true, { n: 20000 }) ?? [];

  return [...resultado, ...pares];
}

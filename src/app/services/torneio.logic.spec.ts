import { describe, expect, it } from 'vitest';
import {
  Jogador,
  Rodada,
  calcularEstatisticas,
  classificar,
  parearRodada,
  proximoNumero,
  rodadasRecomendadas,
} from './torneio.logic';

/** gerador pseudoaleatório determinístico para os testes */
function semente(inicial: number): () => number {
  let s = inicial;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function criarJogadores(n: number): Jogador[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nome: `Jogador ${i + 1}`, saiu: false }));
}

/** joga N rodadas com resultados sorteados e devolve o histórico */
function simular(jogadores: Jogador[], rodadasTotais: number, aleatorio: () => number): Rodada[] {
  const rodadas: Rodada[] = [];
  for (let i = 0; i < rodadasTotais; i++) {
    const rodada = parearRodada(jogadores, rodadas, aleatorio);
    for (const partida of rodada) {
      if (partida.b !== null) {
        const sorteio = aleatorio();
        partida.resultado = sorteio < 0.45 ? 'a' : sorteio < 0.9 ? 'b' : 'e';
      }
    }
    rodadas.push(rodada);
  }
  return rodadas;
}

describe('torneio suíço', () => {
  it('recomenda ceil(log2(n)) rodadas', () => {
    expect(rodadasRecomendadas(16)).toBe(4);
    expect(rodadasRecomendadas(17)).toBe(5);
    expect(rodadasRecomendadas(8)).toBe(3);
    expect(rodadasRecomendadas(1)).toBe(1);
  });

  it('16 jogadores: todos pareados em cada rodada e sem confrontos repetidos em 4 rodadas', () => {
    const jogadores = criarJogadores(16);
    const rodadas = simular(jogadores, 4, semente(7));
    const vistos = new Set<string>();

    for (const rodada of rodadas) {
      expect(rodada.length).toBe(8);
      const ids = rodada.flatMap((p) => (p.b === null ? [p.a] : [p.a, p.b]));
      expect(new Set(ids).size).toBe(16);

      for (const p of rodada) {
        const chave = [p.a, p.b].sort().join('|');
        expect(vistos.has(chave)).toBe(false);
        vistos.add(chave);
      }
    }
  });

  it('número ímpar: uma folga por rodada, sempre para jogadores diferentes', () => {
    const jogadores = criarJogadores(7);
    const rodadas = simular(jogadores, 3, semente(11));
    const folgas = rodadas.map((r) => r.filter((p) => p.b === null).map((p) => p.a));

    for (const f of folgas) expect(f.length).toBe(1);
    expect(new Set(folgas.flat()).size).toBe(3);
  });

  it('jogadores que saíram não entram no pareamento', () => {
    const jogadores = criarJogadores(6);
    jogadores[2].saiu = true;
    const rodada = parearRodada(jogadores, [], semente(3));
    const ids = rodada.flatMap((p) => (p.b === null ? [p.a] : [p.a, p.b]));

    expect(ids).not.toContain('p2');
    expect(ids.length).toBe(5);
  });

  it('pontua vitória (3), empate (1) e folga (3)', () => {
    const jogadores = criarJogadores(3);
    const rodadas: Rodada[] = [
      [
        { a: 'p0', b: 'p1', resultado: 'a' },
        { a: 'p2', b: null, resultado: 'a' },
      ],
      [{ a: 'p0', b: 'p2', resultado: 'e' }],
    ];
    const stats = calcularEstatisticas(jogadores, rodadas);

    expect(stats.get('p0')?.pontos).toBe(4);
    expect(stats.get('p1')?.pontos).toBe(0);
    expect(stats.get('p2')?.pontos).toBe(4);
    expect(stats.get('p2')?.teveBye).toBe(true);
  });

  it('OMW% usa o piso de 33,3% por adversário e desempata a classificação', () => {
    const jogadores = criarJogadores(4);
    const rodadas: Rodada[] = [
      [
        { a: 'p0', b: 'p1', resultado: 'a' },
        { a: 'p2', b: 'p3', resultado: 'a' },
      ],
      [
        { a: 'p0', b: 'p2', resultado: 'b' },
        { a: 'p1', b: 'p3', resultado: 'a' },
      ],
    ];
    const stats = calcularEstatisticas(jogadores, rodadas);
    for (const s of stats.values()) expect(s.omw).toBeGreaterThanOrEqual(1 / 3 - 1e-9);

    const tabela = classificar(jogadores, rodadas);
    expect(tabela[0].id).toBe('p2');
    expect(tabela.map((l) => l.pontos)).toEqual([6, 3, 3, 0]);
  });

  it('numera "Jogador N" a partir do maior número existente', () => {
    const jogadores = criarJogadores(5);
    jogadores.push({ id: 'x', nome: 'Maria', saiu: false });
    expect(proximoNumero(jogadores)).toBe(6);
    expect(proximoNumero([])).toBe(1);
  });
});

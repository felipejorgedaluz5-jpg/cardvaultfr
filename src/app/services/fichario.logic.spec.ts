import { describe, expect, it } from 'vitest';
import {
  CartaColecao,
  Fichario,
  agruparPorFichario,
  buscar,
  contarUsadas,
  limitar,
  listarDisponiveis,
  normalizar,
  posicao,
  rotuloTamanho,
  sanitizar,
  totalEspacos,
  totalOcupados,
} from './fichario.logic';

function ficha(extra: Partial<Fichario> = {}): Fichario {
  return { id: 'f1', nome: 'Escarlate', capa: null, linhas: 3, colunas: 3, paginas: 4, espacos: {}, ...extra };
}

const pikachu = { id: 'sv1-25', nome: 'Pikachu', imagem: 'p.png', condicao: 'NM' };
const pikachuLp = { ...pikachu, condicao: 'LP' };
const charizard = { id: 'sv1-6', nome: 'Charizard ex', imagem: 'c.png', condicao: 'NM' };

describe('fichário: tamanhos e posições', () => {
  it('calcula espaços por página, total e ocupados', () => {
    const f = ficha({ linhas: 3, colunas: 4, paginas: 5, espacos: { '0:0': pikachu, '4:11': charizard } });
    expect(totalEspacos(f)).toBe(60);
    expect(totalOcupados(f)).toBe(2);
    expect(rotuloTamanho(f)).toBe('3×4 · 12 bolsos');
  });

  it('converte o índice do espaço em linha e coluna a partir de 1', () => {
    expect(posicao(0, 3)).toEqual({ linha: 1, coluna: 1 });
    expect(posicao(4, 3)).toEqual({ linha: 2, coluna: 2 });
    expect(posicao(8, 3)).toEqual({ linha: 3, coluna: 3 });
    expect(posicao(11, 4)).toEqual({ linha: 3, coluna: 4 });
  });

  it('limita números ao intervalo e trata valores inválidos', () => {
    expect(limitar(99, 1, 6)).toBe(6);
    expect(limitar(0, 1, 6)).toBe(1);
    expect(limitar(NaN, 1, 6)).toBe(1);
    expect(limitar(3.9, 1, 6)).toBe(3);
  });
});

describe('fichário: cópias disponíveis da coleção', () => {
  const colecao: CartaColecao[] = [
    { id: 'sv1-25', nome: 'Pikachu', imagem: 'p.png', qtd: 2, condicao: 'NM' },
    { id: 'sv1-25', nome: 'Pikachu', imagem: 'p.png', qtd: 1, condicao: 'LP' },
    { id: 'sv1-6', nome: 'Charizard ex', imagem: 'c.png', qtd: 1 },
  ];

  it('conta usos por carta e condição em todos os fichários', () => {
    const a = ficha({ id: 'a', espacos: { '0:0': pikachu, '0:1': pikachu, '1:0': pikachuLp } });
    const b = ficha({ id: 'b', espacos: { '0:0': pikachu } });
    const usadas = contarUsadas([a, b]);
    expect(usadas.get('sv1-25|NM')).toBe(3);
    expect(usadas.get('sv1-25|LP')).toBe(1);
  });

  it('desconta o que já está nos fichários e nunca fica negativo', () => {
    const f = ficha({ espacos: { '0:0': pikachu, '0:1': pikachu, '0:2': pikachu, '0:3': pikachuLp } });
    const lista = listarDisponiveis(colecao, [f]);
    const nm = lista.find((x) => x.carta.id === 'sv1-25' && x.carta.condicao === 'NM');
    const lp = lista.find((x) => x.carta.id === 'sv1-25' && x.carta.condicao === 'LP');
    const char = lista.find((x) => x.carta.id === 'sv1-6');
    expect(nm?.livres).toBe(0);
    expect(lp?.livres).toBe(0);
    expect(char?.livres).toBe(1);
    expect(char?.carta.condicao).toBe('NM');
  });

  it('a carta do espaço que está sendo trocado volta a contar como livre', () => {
    const f = ficha({ espacos: { '0:0': pikachu, '0:1': pikachu } });
    const semTroca = listarDisponiveis(colecao, [f]).find((x) => x.carta.condicao === 'NM' && x.carta.id === 'sv1-25');
    const comTroca = listarDisponiveis(colecao, [f], pikachu).find((x) => x.carta.condicao === 'NM' && x.carta.id === 'sv1-25');
    expect(semTroca?.livres).toBe(0);
    expect(comTroca?.livres).toBe(1);
  });
});

describe('fichário: busca', () => {
  const a = ficha({
    id: 'a',
    nome: 'Escarlate',
    colunas: 3,
    espacos: { '2:4': pikachu, '0:1': charizard },
  });
  const b = ficha({ id: 'b', nome: 'Favoritas', colunas: 4, linhas: 3, espacos: { '1:7': pikachuLp } });

  it('acha pelo nome sem diferenciar maiúsculas nem acentos', () => {
    expect(buscar([a, b], 'PIKACHU').length).toBe(2);
    expect(normalizar('Pikáchu')).toBe('pikachu');
    expect(buscar([{ ...a, espacos: { '0:0': { ...pikachu, nome: 'Pikáchu V' } } }], 'pikachu').length).toBe(1);
  });

  it('informa fichário, página (a partir de 1 na tela), linha e coluna', () => {
    const [primeiro] = buscar([a], 'pikachu');
    expect(primeiro).toMatchObject({ fichaId: 'a', fichaNome: 'Escarlate', pagina: 2, indice: 4, linha: 2, coluna: 2 });
  });

  it('exige todas as palavras digitadas', () => {
    expect(buscar([a], 'charizard ex').length).toBe(1);
    expect(buscar([a], 'charizard pikachu').length).toBe(0);
  });

  it('busca vazia não devolve nada', () => {
    expect(buscar([a, b], '   ')).toEqual([]);
  });

  it('ordena por fichário, página e espaço e agrupa por fichário', () => {
    const resultados = buscar([a, b], 'pikachu');
    expect(resultados.map((r) => r.fichaId)).toEqual(['a', 'b']);
    const grupos = agruparPorFichario(buscar([a, b], 'a'));
    expect(grupos.map((g) => g.fichaId)).toEqual(['a', 'b']);
    expect(grupos[0].itens.map((i) => `${i.pagina}:${i.indice}`)).toEqual(['0:1', '2:4']);
  });

  it('acha a mesma carta em mais de um lugar', () => {
    const f = ficha({ espacos: { '0:0': pikachu, '3:8': pikachu } });
    expect(buscar([f], 'pikachu').map((r) => r.pagina)).toEqual([0, 3]);
  });
});

describe('fichário: dados salvos', () => {
  it('aceita um fichário válido', () => {
    const f = ficha({ espacos: { '1:2': pikachu } });
    expect(sanitizar(JSON.parse(JSON.stringify([f])))).toEqual([f]);
  });

  it('descarta lixo e corrige números fora do limite', () => {
    const lista = sanitizar([
      null,
      'texto',
      { id: 1, nome: 'sem id certo' },
      { id: 'x', nome: 'Grande', linhas: 99, colunas: 0, paginas: 9999, espacos: {} },
    ]);
    expect(lista.length).toBe(1);
    expect(lista[0]).toMatchObject({ id: 'x', linhas: 6, colunas: 1, paginas: 200, capa: null });
  });

  it('remove espaços fora da página ou do tamanho e capas que não são imagem', () => {
    const [f] = sanitizar([
      {
        id: 'x', nome: 'Teste', capa: 'http://externo/imagem.png', linhas: 2, colunas: 2, paginas: 2,
        espacos: { '0:3': pikachu, '0:4': pikachu, '2:0': pikachu, 'a:b': pikachu, '1:0': { id: 5 } },
      },
    ]);
    expect(Object.keys(f.espacos)).toEqual(['0:3']);
    expect(f.capa).toBeNull();
  });

  it('não é válido sanitizar algo que não é lista', () => {
    expect(sanitizar({})).toEqual([]);
    expect(sanitizar(undefined)).toEqual([]);
  });
});

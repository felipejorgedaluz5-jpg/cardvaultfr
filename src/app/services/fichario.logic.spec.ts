import { describe, expect, it } from 'vitest';
import {
  CORES_CAPA,
  CartaColecao,
  Fichario,
  agruparPorFichario,
  buscar,
  contarUsadas,
  corAleatoria,
  corDaCapa,
  corDoTexto,
  ehCorValida,
  espacosFaltando,
  faltantesDoFichario,
  ladosDaVista,
  limitar,
  listarDisponiveis,
  normalizar,
  posicao,
  rotuloLado,
  rotuloTamanho,
  rotuloVista,
  sanitizar,
  totalEspacos,
  totalLados,
  totalOcupados,
  totalVistas,
  vistaDoLado,
} from './fichario.logic';

function ficha(extra: Partial<Fichario> = {}): Fichario {
  return { id: 'f1', nome: 'Escarlate', capa: null, cor: null, linhas: 3, colunas: 3, paginas: 4, espacos: {}, ...extra };
}

const pikachu = { id: 'sv1-25', nome: 'Pikachu', imagem: 'p.png', condicao: 'NM' };
const pikachuLp = { ...pikachu, condicao: 'LP' };
const charizard = { id: 'sv1-6', nome: 'Charizard ex', imagem: 'c.png', condicao: 'NM' };

describe('fichário: tamanhos, lados e posições', () => {
  it('cada página tem frente e verso, então os espaços contam os dois lados', () => {
    const f = ficha({ linhas: 3, colunas: 4, paginas: 5, espacos: { '0:0': pikachu, '9:11': charizard } });
    expect(totalLados(f)).toBe(10);
    expect(totalEspacos(f)).toBe(120);
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

  it('nomeia os lados como frente e verso das páginas', () => {
    expect(rotuloLado(0)).toBe('Página 1 · frente');
    expect(rotuloLado(1)).toBe('Página 1 · verso');
    expect(rotuloLado(2)).toBe('Página 2 · frente');
    expect(rotuloLado(7)).toBe('Página 4 · verso');
  });
});

describe('fichário: vistas (página simples e folha dupla)', () => {
  it('a primeira vista mostra só a frente da página 1, à direita', () => {
    expect(ladosDaVista(0, 4)).toEqual([null, 0]);
  });

  it('as vistas do meio são folhas duplas: verso de uma página e frente da próxima', () => {
    expect(ladosDaVista(1, 4)).toEqual([1, 2]);
    expect(ladosDaVista(2, 4)).toEqual([3, 4]);
    expect(ladosDaVista(3, 4)).toEqual([5, 6]);
  });

  it('a última vista mostra só o verso da última página, à esquerda', () => {
    expect(ladosDaVista(4, 4)).toEqual([7, null]);
    expect(ladosDaVista(1, 1)).toEqual([1, null]);
  });

  it('cada lado aparece em exatamente uma vista', () => {
    for (const paginas of [1, 2, 5, 12]) {
      const vistos: number[] = [];
      for (let v = 0; v < totalVistas(paginas); v++) {
        for (const lado of ladosDaVista(v, paginas)) if (lado !== null) vistos.push(lado);
      }
      expect(vistos).toEqual(Array.from({ length: paginas * 2 }, (_, i) => i));
    }
  });

  it('vistaDoLado devolve a vista que contém o lado', () => {
    for (let lado = 0; lado < 20; lado++) {
      expect(ladosDaVista(vistaDoLado(lado), 10)).toContain(lado);
    }
  });

  it('descreve o que está na tela', () => {
    expect(rotuloVista(0, 4)).toBe('Página 1 · frente');
    expect(rotuloVista(2, 4)).toBe('Página 2 · verso e Página 3 · frente');
    expect(rotuloVista(4, 4)).toBe('Página 4 · verso');
  });
});

describe('fichário: capa e cor', () => {
  it('reconhece cores #rrggbb', () => {
    expect(ehCorValida('#a8323f')).toBe(true);
    expect(ehCorValida('#ABCDEF')).toBe(true);
    expect(ehCorValida('vermelho')).toBe(false);
    expect(ehCorValida('#fff')).toBe(false);
    expect(ehCorValida(null)).toBe(false);
  });

  it('sorteia sempre uma cor da lista', () => {
    for (const r of [0, 0.5, 0.999999]) expect(CORES_CAPA).toContain(corAleatoria(() => r));
    expect(corAleatoria(() => 0)).toBe(CORES_CAPA[0]);
  });

  it('usa a cor escolhida e, sem ela, uma cor da lista que não muda para o mesmo fichário', () => {
    expect(corDaCapa({ id: 'x', cor: '#112233' })).toBe('#112233');
    const antiga = corDaCapa({ id: 'abc123', cor: null });
    expect(CORES_CAPA).toContain(antiga);
    expect(corDaCapa({ id: 'abc123', cor: null })).toBe(antiga);
  });

  it('escolhe texto escuro sobre cor clara e claro sobre cor escura', () => {
    expect(corDoTexto('#ffffff')).toBe('#14110a');
    expect(corDoTexto('#c9a227')).toBe('#14110a');
    expect(corDoTexto('#2a2f3a')).toBe('#ffffff');
    expect(corDoTexto('#a8323f')).toBe('#ffffff');
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

describe('fichário: cartas que a coleção não cobre', () => {
  const colecao: CartaColecao[] = [
    { id: 'sv1-25', nome: 'Pikachu', imagem: 'p.png', qtd: 1, condicao: 'NM' },
    { id: 'sv1-6', nome: 'Charizard ex', imagem: 'c.png', qtd: 1, condicao: 'NM' },
  ];

  it('tudo coberto: nada falta', () => {
    const f = ficha({ espacos: { '0:0': pikachu, '1:2': charizard } });
    expect(espacosFaltando([f], colecao).size).toBe(0);
    expect(faltantesDoFichario([f], colecao, 'f1')).toEqual([]);
  });

  it('carta que não está na coleção falta', () => {
    const f = ficha({ espacos: { '0:0': { id: 'sv9-1', nome: 'Mew', imagem: 'm.png', condicao: 'NM' } } });
    expect([...espacosFaltando([f], colecao)]).toEqual(['f1|0:0']);
    expect(faltantesDoFichario([f], colecao, 'f1')).toEqual([
      { id: 'sv9-1', nome: 'Mew', imagem: 'm.png', condicao: 'NM', faltam: 1 },
    ]);
  });

  it('a mesma carta em condição diferente é outra carta', () => {
    const f = ficha({ espacos: { '0:0': pikachuLp } });
    expect(faltantesDoFichario([f], colecao, 'f1')[0]).toMatchObject({ id: 'sv1-25', condicao: 'LP', faltam: 1 });
  });

  it('as cópias são gastas na ordem dos fichários, páginas e espaços; o que passar do que você tem falta', () => {
    const a = ficha({ id: 'a', espacos: { '0:3': pikachu, '4:0': pikachu } });
    const b = ficha({ id: 'b', espacos: { '0:0': pikachu } });
    const faltando = espacosFaltando([a, b], colecao);
    expect(faltando.has('a|0:3')).toBe(false);
    expect(faltando.has('a|4:0')).toBe(true);
    expect(faltando.has('b|0:0')).toBe(true);
    expect(faltantesDoFichario([a, b], colecao, 'a')[0].faltam).toBe(1);
    expect(faltantesDoFichario([a, b], colecao, 'b')[0].faltam).toBe(1);
  });

  it('soma as cópias que faltam da mesma carta no fichário', () => {
    const f = ficha({ espacos: { '0:0': pikachu, '0:1': pikachu, '1:0': pikachu } });
    expect(faltantesDoFichario([f], colecao, 'f1')[0]).toMatchObject({ id: 'sv1-25', faltam: 2 });
  });

  it('fichário que não existe não tem faltantes', () => {
    expect(faltantesDoFichario([ficha()], colecao, 'nao-existe')).toEqual([]);
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

  it('informa fichário, lado (frente ou verso), linha e coluna', () => {
    const [primeiro] = buscar([a], 'pikachu');
    expect(primeiro).toMatchObject({ fichaId: 'a', fichaNome: 'Escarlate', lado: 2, indice: 4, linha: 2, coluna: 2 });
    expect(rotuloLado(primeiro.lado)).toBe('Página 2 · frente');
    expect(rotuloLado(buscar([b], 'pikachu')[0].lado)).toBe('Página 1 · verso');
  });

  it('exige todas as palavras digitadas', () => {
    expect(buscar([a], 'charizard ex').length).toBe(1);
    expect(buscar([a], 'charizard pikachu').length).toBe(0);
  });

  it('busca vazia não devolve nada', () => {
    expect(buscar([a, b], '   ')).toEqual([]);
  });

  it('ordena por fichário, lado e espaço e agrupa por fichário', () => {
    const resultados = buscar([a, b], 'pikachu');
    expect(resultados.map((r) => r.fichaId)).toEqual(['a', 'b']);
    const grupos = agruparPorFichario(buscar([a, b], 'a'));
    expect(grupos.map((g) => g.fichaId)).toEqual(['a', 'b']);
    expect(grupos[0].itens.map((i) => `${i.lado}:${i.indice}`)).toEqual(['0:1', '2:4']);
  });

  it('acha a mesma carta em mais de um lugar', () => {
    const f = ficha({ espacos: { '0:0': pikachu, '3:8': pikachu } });
    expect(buscar([f], 'pikachu').map((r) => r.lado)).toEqual([0, 3]);
  });
});

describe('fichário: dados salvos', () => {
  it('aceita um fichário válido', () => {
    const f = ficha({ cor: '#2f5fa8', espacos: { '1:2': pikachu } });
    expect(sanitizar(JSON.parse(JSON.stringify([f])))).toEqual([f]);
  });

  it('fichário antigo, sem cor, continua abrindo', () => {
    const antigo = { id: 'x', nome: 'Antigo', capa: null, linhas: 3, colunas: 3, paginas: 2, espacos: {} };
    expect(sanitizar([antigo])[0]).toMatchObject({ id: 'x', cor: null });
  });

  it('descarta lixo e corrige números fora do limite', () => {
    const lista = sanitizar([
      null,
      'texto',
      { id: 1, nome: 'sem id certo' },
      { id: 'x', nome: 'Grande', cor: 'azul', linhas: 99, colunas: 0, paginas: 9999, espacos: {} },
    ]);
    expect(lista.length).toBe(1);
    expect(lista[0]).toMatchObject({ id: 'x', linhas: 6, colunas: 1, paginas: 200, capa: null, cor: null });
  });

  it('remove espaços fora dos lados ou do tamanho e capas que não são imagem', () => {
    const [f] = sanitizar([
      {
        id: 'x', nome: 'Teste', capa: 'http://externo/imagem.png', linhas: 2, colunas: 2, paginas: 2,
        espacos: { '0:3': pikachu, '0:4': pikachu, '3:0': pikachu, '4:0': pikachu, 'a:b': pikachu, '1:0': { id: 5 } },
      },
    ]);
    // 2 páginas = 4 lados (0 a 3); 2×2 = 4 espaços por lado (0 a 3)
    expect(Object.keys(f.espacos).sort()).toEqual(['0:3', '3:0']);
    expect(f.capa).toBeNull();
  });

  it('não é válido sanitizar algo que não é lista', () => {
    expect(sanitizar({})).toEqual([]);
    expect(sanitizar(undefined)).toEqual([]);
  });
});

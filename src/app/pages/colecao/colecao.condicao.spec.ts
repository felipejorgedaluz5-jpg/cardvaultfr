import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Carta, Colecao, CONDICOES } from './colecao';

function carta(extra: Partial<Carta> = {}): Carta {
  return {
    id: 'sv1-1',
    nome: 'Teste',
    valor: 100,
    imagem: '',
    qtd: 1,
    fonte: 'tcgplayer',
    precoOriginal: 20,
    moeda: 'USD',
    ...extra,
  };
}

describe('Colecao: condição da carta', () => {
  let pagina: Colecao;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [Colecao], providers: [provideRouter([])] });
    pagina = TestBed.createComponent(Colecao).componentInstance;
  });

  it('cada condição aplica o seu fator ao preço de mercado', () => {
    for (const c of CONDICOES) {
      expect(pagina.valorUnitario(carta({ condicao: c.sigla }))).toBe(Math.round(100 * c.fator * 100) / 100);
    }
    expect(pagina.valorUnitario(carta({ condicao: 'HP' }))).toBe(50);
  });

  it('carta antiga, sem condição, vale como quase nova (preço cheio)', () => {
    expect(pagina.valorUnitario(carta())).toBe(100);
  });

  it('o total da coleção usa o preço ajustado e a quantidade', () => {
    pagina.colecao = [carta({ condicao: 'NM', qtd: 2 }), carta({ id: 'sv1-2', condicao: 'MP', qtd: 3 })];
    expect(pagina.totalColecao()).toBe(2 * 100 + 3 * 70);
  });

  it('trocar a condição muda o preço da linha', () => {
    const c = carta({ condicao: 'NM' });
    pagina.colecao = [c];
    pagina.trocarCondicao(c, 'DMG');
    expect(c.condicao).toBe('DMG');
    expect(pagina.totalColecao()).toBe(30);
  });

  it('trocar para uma condição que já existe junta as quantidades em uma linha só', () => {
    const nm = carta({ condicao: 'NM', qtd: 2 });
    const lp = carta({ condicao: 'LP', qtd: 1 });
    pagina.colecao = [nm, lp];
    pagina.trocarCondicao(nm, 'LP');
    expect(pagina.colecao.length).toBe(1);
    expect(pagina.colecao[0].qtd).toBe(3);
    expect(pagina.colecao[0].condicao).toBe('LP');
  });

  it('a dica do preço explica o desconto quando não é quase nova', () => {
    expect(pagina.dicaPreco(carta({ condicao: 'LP' }))).toContain('85%');
    expect(pagina.dicaPreco(carta({ condicao: 'NM' }))).not.toContain('%');
  });
});

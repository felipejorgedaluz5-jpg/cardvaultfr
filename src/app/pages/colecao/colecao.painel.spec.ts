import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Colecao } from './colecao';

const EMAIL = 'colecionador@teste.com';

function carta(id: string, nome: string, qtd: number, condicao = 'NM') {
  return { id, nome, valor: 50, imagem: `https://img/${id}.png`, qtd, condicao, fonte: 'tcgplayer', precoOriginal: 10, moeda: 'USD' };
}

function semear(colecao: object[], baralhos: object[] = []): void {
  sessionStorage.setItem('cardvault_sessao', EMAIL);
  localStorage.setItem('cardvault_colecao_' + EMAIL, JSON.stringify(colecao));
  localStorage.setItem('cardvault_baralhos_' + EMAIL, JSON.stringify(baralhos));
}

function colecaoSalva(): { id: string; qtd: number; condicao?: string }[] {
  return JSON.parse(localStorage.getItem('cardvault_colecao_' + EMAIL) ?? '[]');
}

describe('Colecao: painel lateral, valores e baralho', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // sem rede: a página busca expansões e preços, e nada disso importa para estes testes
    vi.stubGlobal('fetch', () => Promise.reject(new Error('sem rede')));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Colecao], providers: [provideRouter([])] });
  });
  afterEach(() => vi.unstubAllGlobals());

  async function abrir() {
    const fixture = TestBed.createComponent(Colecao);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, pagina: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  /** o ngModel grava o valor do select de forma assíncrona, então são dois ciclos para a tela assentar */
  async function atualizar(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    for (let i = 0; i < 2; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await Promise.resolve();
    }
    fixture.detectChanges();
  }

  /** troca a condição como o usuário faz: mexendo no select do painel */
  async function escolherCondicao(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }, el: HTMLElement, sigla: string) {
    const select = el.querySelector<HTMLSelectElement>('#painel-condicao')!;
    select.value = sigla;
    select.dispatchEvent(new Event('change'));
    await atualizar(fixture);
  }

  it('a lista não mostra a condição; o painel só aparece depois de clicar na carta', async () => {
    semear([carta('sv1-25', 'Pikachu', 2, 'LP')]);
    const { fixture, el } = await abrir();

    expect(el.querySelector('.carta-item')).toBeTruthy();
    expect(el.querySelector('#listaColecao select')).toBeNull();
    expect(el.querySelector('.painel-carta')).toBeNull();

    el.querySelector<HTMLElement>('#listaColecao img')!.click();
    await atualizar(fixture);

    const painel = el.querySelector('.painel-carta')!;
    expect(painel).toBeTruthy();
    expect(painel.textContent).toContain('Pikachu');
    expect(el.querySelector<HTMLSelectElement>('#painel-condicao')!.value).toBe('LP');
    expect(el.querySelector('.carta-item.selecionada')).toBeTruthy();
  });

  it('o painel fecha pelo botão e pela tecla Esc', async () => {
    semear([carta('sv1-25', 'Pikachu', 1)]);
    const { fixture, el } = await abrir();

    el.querySelector<HTMLElement>('#listaColecao img')!.click();
    await atualizar(fixture);
    el.querySelector<HTMLElement>('.painel-fechar')!.click();
    await atualizar(fixture);
    expect(el.querySelector('.painel-carta')).toBeNull();

    el.querySelector<HTMLElement>('#listaColecao img')!.click();
    await atualizar(fixture);
    expect(el.querySelector('.painel-carta')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await atualizar(fixture);
    expect(el.querySelector('.painel-carta')).toBeNull();
  });

  it('ao desligar "mostrar valores", o seletor de condição some junto', async () => {
    semear([carta('sv1-25', 'Pikachu', 1)]);
    const { fixture, pagina, el } = await abrir();

    expect(pagina.mostrarValores()).toBe(true);
    expect(el.querySelector('.condicao-nova')).toBeTruthy();
    el.querySelector<HTMLElement>('#listaColecao img')!.click();
    await atualizar(fixture);
    expect(el.querySelector('#painel-condicao')).toBeTruthy();
    expect(el.querySelector('.painel-preco')).toBeTruthy();

    pagina.toggleMostrarValores();
    await atualizar(fixture);
    expect(pagina.mostrarValores()).toBe(false);
    expect(el.querySelector('.condicao-nova')).toBeNull();
    expect(el.querySelector('#painel-condicao')).toBeNull();
    expect(el.querySelector('.painel-preco')).toBeNull();
    expect(el.querySelector('.painel-carta')).toBeTruthy(); // continua com imagem, nome e quantidade
    expect(el.querySelector('.painel-carta .qtd-control')).toBeTruthy();

    pagina.toggleMostrarValores();
    await atualizar(fixture);
    expect(el.querySelector('.condicao-nova')).toBeTruthy();
    expect(el.querySelector('#painel-condicao')).toBeTruthy();
  });

  it('trocar a condição no painel muda o valor e salva', async () => {
    semear([carta('sv1-25', 'Pikachu', 1)]);
    const { fixture, pagina, el } = await abrir();
    el.querySelector<HTMLElement>('#listaColecao img')!.click();
    await atualizar(fixture);

    await escolherCondicao(fixture, el, 'HP');

    expect(colecaoSalva()[0].condicao).toBe('HP');
    expect(pagina.valorUnitario(pagina.colecao[0])).toBe(25); // 50% do preço de mercado (50)
    expect(el.querySelector<HTMLSelectElement>('#painel-condicao')!.value).toBe('HP');
  });

  it('trocar para uma condição que já existe junta as cópias e o painel segue na linha que ficou', async () => {
    semear([carta('sv1-25', 'Pikachu', 2, 'NM'), carta('sv1-25', 'Pikachu', 1, 'LP')]);
    const { fixture, pagina, el } = await abrir();
    el.querySelectorAll<HTMLElement>('#listaColecao img')[1].click();
    await atualizar(fixture);

    await escolherCondicao(fixture, el, 'NM');

    expect(pagina.colecao.length).toBe(1);
    expect(pagina.colecao[0].qtd).toBe(3);
    expect(el.querySelector('.painel-carta')).toBeTruthy();
    expect(el.querySelector<HTMLSelectElement>('#painel-condicao')!.value).toBe('NM');
  });

  it('remover pelo painel tira a carta da coleção e fecha o painel', async () => {
    semear([carta('sv1-25', 'Pikachu', 1), carta('sv1-6', 'Charizard ex', 1)]);
    const { fixture, el } = await abrir();
    el.querySelector<HTMLElement>('#listaColecao img')!.click();
    await atualizar(fixture);
    el.querySelector<HTMLElement>('.painel-remover')!.click();
    await atualizar(fixture);

    expect(colecaoSalva().map((c) => c.id)).toEqual(['sv1-6']);
    expect(el.querySelector('.painel-carta')).toBeNull();
  });

  describe('baralho com cartas que você não tem', () => {
    const deck = (cartas: object[]) => [{ nome: 'Meu deck', cartas }];
    const dCarta = (id: string, nome: string, qtd: number) => ({ id, nome, imagem: `https://img/${id}.png`, qtd });

    async function abrirBaralho() {
      const r = await abrir();
      r.pagina.mudarAba('baralhos');
      r.pagina.baralhoAtivoIndex = 0;
      await atualizar(r.fixture);
      return r;
    }

    it('mostra o botão só nas cartas que faltam, com a quantidade certa', async () => {
      semear(
        [carta('sv1-25', 'Pikachu', 1), carta('sv1-6', 'Charizard ex', 2)],
        deck([dCarta('sv1-25', 'Pikachu', 3), dCarta('sv1-6', 'Charizard ex', 2), dCarta('sv9-1', 'Mew', 1)]),
      );
      const { pagina, el } = await abrirBaralho();

      const botoes = [...el.querySelectorAll<HTMLElement>('.btn-falta')];
      expect(botoes.map((b) => b.textContent?.trim())).toEqual(['+ 2 na coleção', '+ 1 na coleção']);
      expect(pagina.totalFaltantesBaralho()).toBe(3);
      expect(el.textContent).toContain('Adicionar 3 faltantes à coleção');
    });

    it('o botão da carta soma só o que falta dela, e o aviso some', async () => {
      semear([carta('sv1-25', 'Pikachu', 1)], deck([dCarta('sv1-25', 'Pikachu', 3)]));
      const { fixture, pagina, el } = await abrirBaralho();
      expect(el.querySelector('.btn-falta')).toBeTruthy();

      el.querySelector<HTMLElement>('.btn-falta')!.click();
      await atualizar(fixture);

      expect(pagina.colecao.find((c) => c.id === 'sv1-25')!.qtd).toBe(3);
      expect(colecaoSalva().find((c) => c.id === 'sv1-25')!.qtd).toBe(3);
      expect(pagina.faltamNaColecao(pagina.baralhos[0].cartas[0])).toBe(0);
      expect(el.querySelector('.btn-falta')).toBeNull();
    });

    it('o botão do baralho adiciona tudo de uma vez, uma carta nova entra como NM', async () => {
      semear(
        [carta('sv1-25', 'Pikachu', 1)],
        deck([dCarta('sv1-25', 'Pikachu', 2), dCarta('sv9-1', 'Mew', 4)]),
      );
      const { fixture, pagina, el } = await abrirBaralho();

      const botao = [...el.querySelectorAll<HTMLElement>('.btn-secundario')].find((b) => b.textContent?.includes('faltantes'))!;
      expect(botao.textContent).toContain('Adicionar 5 faltantes');
      botao.click();
      await atualizar(fixture);

      const salva = colecaoSalva();
      expect(salva.find((c) => c.id === 'sv1-25')!.qtd).toBe(2);
      expect(salva.find((c) => c.id === 'sv9-1')).toMatchObject({ qtd: 4, condicao: 'NM' });
      expect(pagina.totalFaltantesBaralho()).toBe(0);
      expect(el.textContent).not.toContain('faltantes à coleção');
      expect(el.querySelector('.btn-falta')).toBeNull();
    });

    it('baralho completo não mostra botões de adicionar', async () => {
      semear([carta('sv1-25', 'Pikachu', 4)], deck([dCarta('sv1-25', 'Pikachu', 4)]));
      const { el } = await abrirBaralho();
      expect(el.querySelector('.btn-falta')).toBeNull();
      expect(el.textContent).not.toContain('faltantes à coleção');
    });
  });
});

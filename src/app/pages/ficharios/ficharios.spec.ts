import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Ficharios } from './ficharios';
import { AuthService } from '../../services/auth.service';
import { FichariosService } from '../../services/fichario.service';

const EMAIL = 'colecionador@teste.com';

function colecaoDe(...itens: { id: string; nome: string; qtd: number; condicao?: string }[]): void {
  localStorage.setItem(
    'cardvault_colecao_' + EMAIL,
    JSON.stringify(itens.map((c) => ({ ...c, valor: 0, imagem: `https://img/${c.id}.png` }))),
  );
}

function iniciar(logado = true) {
  TestBed.resetTestingModule();
  if (logado) sessionStorage.setItem('cardvault_sessao', EMAIL);
  else sessionStorage.removeItem('cardvault_sessao');
  TestBed.configureTestingModule({ imports: [Ficharios], providers: [provideRouter([])] });
  return TestBed.inject(FichariosService);
}

describe('FichariosService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('cria um fichário com tamanho e páginas dentro dos limites e guarda por conta', () => {
    const s = iniciar();
    const f = s.criar({ nome: '  Meu fichário  ', capa: null, linhas: 3, colunas: 4, paginas: 20 });
    expect(f).toMatchObject({ nome: 'Meu fichário', linhas: 3, colunas: 4, paginas: 20 });
    expect(JSON.parse(localStorage.getItem('cardvault_fichario_' + EMAIL) ?? '[]').length).toBe(1);

    const grande = s.criar({ nome: 'Enorme', capa: null, linhas: 50, colunas: 50, paginas: 5000 });
    expect(grande).toMatchObject({ linhas: 6, colunas: 6, paginas: 200 });
  });

  it('não cria sem nome nem sem estar logado', () => {
    expect(iniciar().criar({ nome: '   ', capa: null, linhas: 3, colunas: 3, paginas: 1 })).toBeNull();
    expect(iniciar(false).criar({ nome: 'X', capa: null, linhas: 3, colunas: 3, paginas: 1 })).toBeNull();
  });

  it('o fichário sobrevive a recarregar a página', () => {
    iniciar().criar({ nome: 'Persistente', capa: null, linhas: 2, colunas: 2, paginas: 3 });
    const novo = iniciar();
    expect(novo.fichas().map((f) => f.nome)).toEqual(['Persistente']);
  });

  it('cada conta enxerga só os seus fichários', () => {
    const s = iniciar();
    s.criar({ nome: 'Da conta A', capa: null, linhas: 3, colunas: 3, paginas: 2 });
    sessionStorage.setItem('cardvault_sessao', 'outra@pessoa.com');
    TestBed.inject(AuthService).currentEmail.set('outra@pessoa.com');
    TestBed.tick();
    expect(s.fichas()).toEqual([]);
  });

  it('coloca carta da coleção num espaço e respeita as cópias que você tem', () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 2 });
    const s = iniciar();
    const f = s.criar({ nome: 'A', capa: null, linhas: 3, colunas: 3, paginas: 2 })!;
    const carta = { id: 'sv1-25', nome: 'Pikachu', imagem: '', qtd: 2 };

    expect(s.colocarCarta(f.id, 0, 0, carta)).toBe('ok');
    expect(s.colocarCarta(f.id, 0, 1, carta)).toBe('ok');
    expect(s.colocarCarta(f.id, 1, 0, carta)).toBe('sem-copias');
    expect(s.ficha(f.id)?.espacos['0:0']).toMatchObject({ id: 'sv1-25', nome: 'Pikachu', condicao: 'NM' });

    // as cópias contam em todos os fichários, não só neste
    const outro = s.criar({ nome: 'B', capa: null, linhas: 2, colunas: 2, paginas: 1 })!;
    expect(s.colocarCarta(outro.id, 0, 0, carta)).toBe('sem-copias');

    // trocar a carta de um espaço pela mesma não gasta uma cópia nova
    expect(s.colocarCarta(f.id, 0, 0, carta)).toBe('ok');

    s.removerCarta(f.id, 0, 1);
    expect(s.colocarCarta(outro.id, 0, 0, carta)).toBe('ok');
  });

  it('cada condição é uma carta diferente e cartas fora da coleção são recusadas', () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1, condicao: 'LP' });
    const s = iniciar();
    const f = s.criar({ nome: 'A', capa: null, linhas: 3, colunas: 3, paginas: 1 })!;
    expect(s.colocarCarta(f.id, 0, 0, { id: 'sv1-25', nome: 'Pikachu', imagem: '', qtd: 1, condicao: 'NM' })).toBe('sem-copias');
    expect(s.colocarCarta(f.id, 0, 0, { id: 'sv1-25', nome: 'Pikachu', imagem: '', qtd: 1, condicao: 'LP' })).toBe('ok');
    expect(s.colocarCarta(f.id, 0, 1, { id: 'xx', nome: 'Nada', imagem: '', qtd: 1 })).toBe('sem-copias');
  });

  it('recusa espaço ou página que não existem', () => {
    colecaoDe({ id: 'a', nome: 'A', qtd: 5 });
    const s = iniciar();
    const f = s.criar({ nome: 'A', capa: null, linhas: 2, colunas: 2, paginas: 2 })!;
    const carta = { id: 'a', nome: 'A', imagem: '', qtd: 5 };
    expect(s.colocarCarta(f.id, 2, 0, carta)).toBe('invalido');
    expect(s.colocarCarta(f.id, 0, 4, carta)).toBe('invalido');
    expect(s.colocarCarta('nao-existe', 0, 0, carta)).toBe('invalido');
  });

  it('adiciona páginas e exclui o fichário', () => {
    const s = iniciar();
    const f = s.criar({ nome: 'A', capa: null, linhas: 2, colunas: 2, paginas: 2 })!;
    expect(s.adicionarPagina(f.id)).toBe(true);
    expect(s.ficha(f.id)?.paginas).toBe(3);
    s.excluir(f.id);
    expect(s.fichas()).toEqual([]);
  });

  it('sinaliza quando o navegador não deixa salvar', () => {
    const s = iniciar();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('cheio', 'QuotaExceededError');
    };
    try {
      s.criar({ nome: 'A', capa: null, linhas: 2, colunas: 2, paginas: 1 });
      expect(s.erroAoSalvar()).toBe(true);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('Ficharios (página)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  async function abrir(logado = true) {
    const s = iniciar(logado);
    const fixture = TestBed.createComponent(Ficharios);
    await fixture.whenStable();
    return { s, fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function clicar(fixture: { whenStable(): Promise<unknown> }, el: HTMLElement, seletor: string, i = 0) {
    const alvo = el.querySelectorAll<HTMLElement>(seletor)[i];
    expect(alvo, `${seletor}[${i}]`).toBeTruthy();
    alvo.click();
    await fixture.whenStable();
  }

  async function digitar(fixture: { whenStable(): Promise<unknown> }, el: HTMLElement, id: string, valor: string) {
    const campo = el.querySelector<HTMLInputElement>('#' + id)!;
    expect(campo, id).toBeTruthy();
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('sem login mostra a área restrita', async () => {
    const { el } = await abrir(false);
    expect(el.textContent).toContain('Área Restrita');
    expect(el.querySelector('.estante')).toBeNull();
  });

  it('a prévia acompanha o tamanho e as páginas antes de criar', async () => {
    const { s, fixture, el } = await abrir();
    await clicar(fixture, el, '.topo .btn-primario');

    expect(el.querySelectorAll('.folha-previa .slot').length).toBe(9);

    await digitar(fixture, el, 'fich-linhas', '3');
    await digitar(fixture, el, 'fich-colunas', '4');
    await digitar(fixture, el, 'fich-paginas', '25');
    expect(el.querySelectorAll('.folha-previa .slot').length).toBe(12);
    expect(el.textContent).toContain('300 espaços no total');
    expect(el.textContent).toContain('Página 1 de 25');

    await clicar(fixture, el, '.previa .paginador .btn-mini', 1);
    expect(el.textContent).toContain('Página 2 de 25');

    // nada foi criado enquanto estava só na prévia
    expect(s.fichas().length).toBe(0);

    await clicar(fixture, el, '.chip', 0);
    expect(el.querySelectorAll('.folha-previa .slot').length).toBe(4);
  });

  it('exige nome e depois cria e abre o fichário no tamanho escolhido', async () => {
    const { s, fixture, el } = await abrir();
    await clicar(fixture, el, '.topo .btn-primario');

    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(el.querySelector('.erro')?.textContent).toContain('nome');
    expect(s.fichas().length).toBe(0);

    await digitar(fixture, el, 'fich-nome', 'Meu fichário');
    await clicar(fixture, el, '.chip', 2);
    await digitar(fixture, el, 'fich-paginas', '5');
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    expect(s.fichas()[0]).toMatchObject({ nome: 'Meu fichário', linhas: 3, colunas: 4, paginas: 5 });
    expect(el.querySelectorAll('.folha .slot').length).toBe(12);
    expect(el.textContent).toContain('de 5');
  });

  it('vira as páginas e coloca uma carta da coleção em um espaço', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 }, { id: 'sv1-6', nome: 'Charizard ex', qtd: 1 });
    const { s, fixture, el } = await abrir();
    const f = s.criar({ nome: 'A', capa: null, linhas: 3, colunas: 3, paginas: 3 })!;
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');

    await clicar(fixture, el, '.paginador.grande .btn-secundario', 1);
    expect(el.querySelector<HTMLInputElement>('#fich-pagina')!.value).toBe('2');
    await clicar(fixture, el, '.paginador.grande .btn-secundario', 1);
    expect(el.querySelector<HTMLInputElement>('#fich-pagina')!.value).toBe('3');
    expect(el.querySelectorAll<HTMLButtonElement>('.paginador.grande .btn-secundario')[1].disabled).toBe(true);

    await clicar(fixture, el, '.folha .slot', 4);
    expect(el.querySelector('[role="dialog"]')).toBeTruthy();
    expect(el.textContent).toContain('Página 3 · linha 2, coluna 2');

    const itens = [...el.querySelectorAll<HTMLElement>('.galeria-item')];
    expect(itens.length).toBe(2);
    itens.find((i) => i.textContent?.includes('Pikachu'))!.click();
    await fixture.whenStable();

    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(s.ficha(f.id)?.espacos['2:4']).toMatchObject({ nome: 'Pikachu' });
    expect(el.querySelectorAll('.folha .slot.cheio').length).toBe(1);
  });

  it('cartas sem cópias livres ficam desabilitadas na escolha', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 });
    const { s, fixture, el } = await abrir();
    const f = s.criar({ nome: 'A', capa: null, linhas: 2, colunas: 2, paginas: 1 })!;
    s.colocarCarta(f.id, 0, 0, { id: 'sv1-25', nome: 'Pikachu', imagem: '', qtd: 1 });
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');
    await clicar(fixture, el, '.folha .slot', 1);

    const item = el.querySelector<HTMLButtonElement>('.galeria-item')!;
    expect(item.disabled).toBe(true);
    expect(item.textContent).toContain('Todas em uso');
  });

  it('tira a carta de um espaço', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 });
    const { s, fixture, el } = await abrir();
    const f = s.criar({ nome: 'A', capa: null, linhas: 2, colunas: 2, paginas: 1 })!;
    s.colocarCarta(f.id, 0, 0, { id: 'sv1-25', nome: 'Pikachu', imagem: '', qtd: 1 });
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');
    await clicar(fixture, el, '.folha .slot', 0);
    await clicar(fixture, el, '.atual .perigo');

    expect(s.ficha(f.id)?.espacos['0:0']).toBeUndefined();
    expect(el.querySelectorAll('.folha .slot.cheio').length).toBe(0);
  });

  it('a busca mostra fichário, página e posição e abre o lugar da carta', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 2 }, { id: 'sv1-6', nome: 'Charizard ex', qtd: 1 });
    const { s, fixture, el } = await abrir();
    const a = s.criar({ nome: 'Escarlate', capa: null, linhas: 3, colunas: 3, paginas: 4 })!;
    const b = s.criar({ nome: 'Favoritas', capa: null, linhas: 2, colunas: 2, paginas: 2 })!;
    s.colocarCarta(a.id, 2, 4, { id: 'sv1-25', nome: 'Pikachu', imagem: '', qtd: 2 });
    s.colocarCarta(b.id, 1, 3, { id: 'sv1-25', nome: 'Pikachu', imagem: '', qtd: 2 });
    s.colocarCarta(a.id, 0, 0, { id: 'sv1-6', nome: 'Charizard ex', imagem: '', qtd: 1 });
    await fixture.whenStable();

    await digitar(fixture, el, 'fich-busca', 'pikachu');
    const grupos = [...el.querySelectorAll('.grupo')];
    expect(grupos.length).toBe(2);
    expect(grupos[0].textContent).toContain('Escarlate');
    expect(grupos[0].textContent).toContain('Página 3 · linha 2, coluna 2');
    expect(grupos[1].textContent).toContain('Favoritas');
    expect(grupos[1].textContent).toContain('Página 2 · linha 2, coluna 2');
    expect(el.textContent).not.toContain('Charizard');

    await digitar(fixture, el, 'fich-busca', 'zzz');
    expect(el.textContent).toContain('Nenhuma carta com esse nome');

    await digitar(fixture, el, 'fich-busca', 'pikachu');
    await clicar(fixture, el, '.resultado', 1);
    expect(el.querySelector('.titulo-ficha')?.textContent).toContain('Favoritas');
    expect(el.querySelector<HTMLInputElement>('#fich-pagina')!.value).toBe('2');
    const marcados = el.querySelectorAll('.folha .slot.destaque');
    expect(marcados.length).toBe(1);
    expect(marcados[0].getAttribute('aria-label')).toContain('Linha 2, coluna 2');
  });
});

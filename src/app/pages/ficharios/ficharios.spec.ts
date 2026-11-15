import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ficharios } from './ficharios';
import { AuthService } from '../../services/auth.service';
import { CORES_CAPA } from '../../services/fichario.logic';
import { FichariosService } from '../../services/fichario.service';

const EMAIL = 'colecionador@teste.com';

function colecaoDe(...itens: { id: string; nome: string; qtd: number; condicao?: string }[]): void {
  localStorage.setItem(
    'cardvault_colecao_' + EMAIL,
    JSON.stringify(itens.map((c) => ({ ...c, valor: 0, imagem: `https://img/${c.id}.png` }))),
  );
}

function colecaoSalva(): { id: string; nome: string; qtd: number; condicao?: string }[] {
  return JSON.parse(localStorage.getItem('cardvault_colecao_' + EMAIL) ?? '[]');
}

function iniciar(logado = true) {
  TestBed.resetTestingModule();
  if (logado) sessionStorage.setItem('cardvault_sessao', EMAIL);
  else sessionStorage.removeItem('cardvault_sessao');
  TestBed.configureTestingModule({ imports: [Ficharios], providers: [provideRouter([])] });
  return TestBed.inject(FichariosService);
}

const novo = (extra: Partial<Parameters<FichariosService['criar']>[0]> = {}) => ({
  nome: 'A',
  capa: null,
  cor: null,
  linhas: 3,
  colunas: 3,
  paginas: 2,
  ...extra,
});
const pikachu = { id: 'sv1-25', nome: 'Pikachu', imagem: 'p.png' };

describe('FichariosService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('cria um fichário com tamanho e páginas dentro dos limites e guarda por conta', () => {
    const s = iniciar();
    const f = s.criar(novo({ nome: '  Meu fichário  ', linhas: 3, colunas: 4, paginas: 20 }));
    expect(f).toMatchObject({ nome: 'Meu fichário', linhas: 3, colunas: 4, paginas: 20 });
    expect(JSON.parse(localStorage.getItem('cardvault_fichario_' + EMAIL) ?? '[]').length).toBe(1);

    const grande = s.criar(novo({ nome: 'Enorme', linhas: 50, colunas: 50, paginas: 5000 }));
    expect(grande).toMatchObject({ linhas: 6, colunas: 6, paginas: 200 });
  });

  it('usa a cor escolhida; sem cor (ou com cor inválida) sorteia uma da lista', () => {
    const s = iniciar();
    expect(s.criar(novo({ cor: '#112233' }))?.cor).toBe('#112233');
    expect(CORES_CAPA).toContain(s.criar(novo({ cor: null }))!.cor);
    expect(CORES_CAPA).toContain(s.criar(novo({ cor: 'azulzinho' }))!.cor);
  });

  it('não cria sem nome nem sem estar logado', () => {
    expect(iniciar().criar(novo({ nome: '   ' }))).toBeNull();
    expect(iniciar(false).criar(novo({ nome: 'X' }))).toBeNull();
  });

  it('edita nome, foto e cor sem mexer no tamanho nem nas cartas', () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 });
    const s = iniciar();
    const f = s.criar(novo({ cor: '#112233', linhas: 2, colunas: 4, paginas: 3 }))!;
    s.colocarCarta(f.id, 1, 0, pikachu);

    expect(s.editar(f.id, { nome: '  Novo nome  ', capa: 'data:image/jpeg;base64,AAA', cor: '#445566' })).toBe(true);
    expect(s.ficha(f.id)).toMatchObject({
      nome: 'Novo nome',
      capa: 'data:image/jpeg;base64,AAA',
      cor: '#445566',
      linhas: 2,
      colunas: 4,
      paginas: 3,
    });
    expect(s.ficha(f.id)?.espacos['1:0']).toMatchObject({ nome: 'Pikachu' });

    // tirar a foto devolve a capa à cor; nome vazio ou cor inválida não estragam nada
    s.editar(f.id, { nome: 'Novo nome', capa: null, cor: 'x' });
    expect(s.ficha(f.id)).toMatchObject({ capa: null, cor: '#445566' });
    expect(s.editar(f.id, { nome: '  ', capa: null, cor: '#000000' })).toBe(false);
    expect(s.editar('nao-existe', { nome: 'X', capa: null, cor: null })).toBe(false);
    expect(JSON.parse(localStorage.getItem('cardvault_fichario_' + EMAIL) ?? '[]')[0].nome).toBe('Novo nome');
  });

  it('o fichário sobrevive a recarregar a página', () => {
    iniciar().criar(novo({ nome: 'Persistente', cor: '#112233' }));
    const recarregado = iniciar();
    expect(recarregado.fichas().map((f) => [f.nome, f.cor])).toEqual([['Persistente', '#112233']]);
  });

  it('cada conta enxerga só os seus fichários', () => {
    const s = iniciar();
    s.criar(novo({ nome: 'Da conta A' }));
    sessionStorage.setItem('cardvault_sessao', 'outra@pessoa.com');
    TestBed.inject(AuthService).currentEmail.set('outra@pessoa.com');
    TestBed.tick();
    expect(s.fichas()).toEqual([]);
  });

  it('cada página tem frente e verso: 2 páginas são 4 lados', () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 9 });
    const s = iniciar();
    const f = s.criar(novo({ linhas: 2, colunas: 2, paginas: 2 }))!;
    expect(s.colocarCarta(f.id, 0, 0, pikachu)).toBe('ok');
    expect(s.colocarCarta(f.id, 1, 3, pikachu)).toBe('ok');
    expect(s.colocarCarta(f.id, 3, 0, pikachu)).toBe('ok');
    expect(s.colocarCarta(f.id, 4, 0, pikachu)).toBe('invalido');
    expect(s.colocarCarta(f.id, 0, 4, pikachu)).toBe('invalido');
    expect(s.colocarCarta(f.id, -1, 0, pikachu)).toBe('invalido');
    expect(s.colocarCarta('nao-existe', 0, 0, pikachu)).toBe('invalido');
  });

  it('aceita cartas que você não tem e marca o que falta na coleção', () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 });
    const s = iniciar();
    const f = s.criar(novo())!;

    expect(s.colocarCarta(f.id, 0, 0, pikachu)).toBe('ok');
    expect(s.faltando().size).toBe(0);

    // segunda cópia passa do que existe na coleção
    expect(s.colocarCarta(f.id, 0, 1, pikachu)).toBe('ok');
    expect([...s.faltando()]).toEqual([`${f.id}|0:1`]);

    // carta que não está na coleção, em outra condição ou de outro id
    expect(s.colocarCarta(f.id, 1, 0, { ...pikachu, condicao: 'LP' })).toBe('ok');
    expect(s.colocarCarta(f.id, 1, 1, { id: 'sv9-1', nome: 'Mew', imagem: 'm.png' })).toBe('ok');
    expect(s.faltantesDe(f.id).map((x) => [x.nome, x.condicao, x.faltam])).toEqual([
      ['Mew', 'NM', 1],
      ['Pikachu', 'LP', 1],
      ['Pikachu', 'NM', 1],
    ]);
  });

  it('adicionar à coleção soma as cópias, respeita a condição e faz o aviso sumir', () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1, condicao: 'NM' });
    const s = iniciar();
    const f = s.criar(novo())!;
    s.colocarCarta(f.id, 0, 0, pikachu);
    s.colocarCarta(f.id, 0, 1, pikachu);
    s.colocarCarta(f.id, 0, 2, { id: 'sv9-1', nome: 'Mew', imagem: 'https://img/m.png', condicao: 'LP' });
    expect(s.faltando().size).toBe(2);

    expect(s.adicionarFaltantesNaColecao(f.id)).toBe(true);

    const salva = colecaoSalva();
    expect(salva.find((c) => c.id === 'sv1-25')?.qtd).toBe(2);
    expect(salva.find((c) => c.id === 'sv9-1')).toMatchObject({ nome: 'Mew', qtd: 1, condicao: 'LP' });
    expect(salva.length).toBe(2);
    expect(s.faltando().size).toBe(0);
    expect(s.faltantesDe(f.id)).toEqual([]);
  });

  it('adicionar à coleção sem nada a adicionar, ou sem login, não faz nada', () => {
    const s = iniciar();
    const f = s.criar(novo())!;
    expect(s.adicionarFaltantesNaColecao(f.id)).toBe(false);
    expect(iniciar(false).adicionarNaColecao([{ id: 'a', nome: 'A', imagem: '', condicao: 'NM', qtd: 1 }])).toBe(false);
    expect(localStorage.getItem('cardvault_colecao_' + EMAIL)).toBeNull();
  });

  it('adiciona páginas e exclui o fichário', () => {
    const s = iniciar();
    const f = s.criar(novo({ paginas: 2 }))!;
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
      s.criar(novo());
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
  afterEach(() => vi.unstubAllGlobals());

  async function abrir(logado = true) {
    const s = iniciar(logado);
    const fixture = TestBed.createComponent(Ficharios);
    await fixture.whenStable();
    return { s, fixture, el: fixture.nativeElement as HTMLElement };
  }

  type Fix = { whenStable(): Promise<unknown> };

  async function clicar(fixture: Fix, el: HTMLElement, seletor: string, i = 0) {
    const alvo = el.querySelectorAll<HTMLElement>(seletor)[i];
    expect(alvo, `${seletor}[${i}]`).toBeTruthy();
    alvo.click();
    await fixture.whenStable();
  }

  async function digitar(fixture: Fix, el: HTMLElement, id: string, valor: string) {
    const campo = el.querySelector<HTMLInputElement>('#' + id)!;
    expect(campo, id).toBeTruthy();
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function enviar(fixture: Fix, el: HTMLElement) {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  }

  const nomesDosLados = (el: HTMLElement) =>
    [...el.querySelectorAll('.pagina-lado .lado-rotulo')].map((n) => n.textContent?.trim());

  it('sem login mostra a área restrita', async () => {
    const { el } = await abrir(false);
    expect(el.textContent).toContain('Área Restrita');
    expect(el.querySelector('.estante')).toBeNull();
  });

  it('a prévia acompanha o tamanho e as páginas e mostra frente e verso antes de criar', async () => {
    const { s, fixture, el } = await abrir();
    await clicar(fixture, el, '.topo .btn-primario');

    expect(el.querySelectorAll('.folha-previa .slot').length).toBe(9);

    await digitar(fixture, el, 'fich-linhas', '3');
    await digitar(fixture, el, 'fich-colunas', '4');
    await digitar(fixture, el, 'fich-paginas', '25');
    expect(el.querySelectorAll('.folha-previa .slot').length).toBe(12);
    expect(el.textContent).toContain('600 espaços no total, contando frente e verso');
    expect(el.textContent).toContain('Página 1 · frente · 25 páginas');

    await clicar(fixture, el, '.previa .paginador .btn-mini', 1);
    expect(el.textContent).toContain('Página 1 · verso');
    await clicar(fixture, el, '.previa .paginador .btn-mini', 1);
    expect(el.textContent).toContain('Página 2 · frente');

    expect(s.fichas().length).toBe(0);

    await clicar(fixture, el, '.chip', 0);
    expect(el.querySelectorAll('.folha-previa .slot').length).toBe(4);
  });

  it('exige nome e depois cria e abre o fichário no tamanho escolhido', async () => {
    const { s, fixture, el } = await abrir();
    await clicar(fixture, el, '.topo .btn-primario');

    await enviar(fixture, el);
    expect(el.querySelector('.erro')?.textContent).toContain('nome');
    expect(s.fichas().length).toBe(0);

    await digitar(fixture, el, 'fich-nome', 'Meu fichário');
    await clicar(fixture, el, '.chip', 2);
    await digitar(fixture, el, 'fich-paginas', '5');
    await enviar(fixture, el);

    expect(s.fichas()[0]).toMatchObject({ nome: 'Meu fichário', linhas: 3, colunas: 4, paginas: 5 });
    expect(el.textContent).toContain('3×4 · 12 bolsos por lado · 5 páginas');
  });

  it('sem escolher cor, o fichário fica com uma cor da lista; escolhida, fica com a escolhida', async () => {
    const { s, fixture, el } = await abrir();
    await clicar(fixture, el, '.topo .btn-primario');
    expect(el.textContent).toContain('Se você não escolher uma cor');
    await digitar(fixture, el, 'fich-nome', 'Sem cor');
    await enviar(fixture, el);
    expect(CORES_CAPA).toContain(s.fichas()[0].cor);

    await clicar(fixture, el, '.topo .btn-mini');
    await clicar(fixture, el, '.topo .btn-primario');
    await digitar(fixture, el, 'fich-nome', 'Com cor');
    await clicar(fixture, el, '.cor', 4);
    expect(el.textContent).not.toContain('Se você não escolher uma cor');
    await enviar(fixture, el);
    expect(s.fichas()[1].cor).toBe(CORES_CAPA[4]);
  });

  it('edita nome e cor de um fichário que já existe e permite cancelar', async () => {
    const { s, fixture, el } = await abrir();
    const f = s.criar(novo({ nome: 'Velho', cor: '#112233', linhas: 3, colunas: 3, paginas: 4 }))!;
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');
    await clicar(fixture, el, '.topo-acoes .btn-mini', 0); // Editar

    expect(el.querySelector<HTMLInputElement>('#fich-nome')!.value).toBe('Velho');
    expect(el.querySelector('#fich-linhas')).toBeNull(); // tamanho não se edita
    expect(el.querySelector('.previa')).toBeNull();

    // cancelar não muda nada
    await digitar(fixture, el, 'fich-nome', 'Descartado');
    await clicar(fixture, el, '.topo .btn-mini');
    expect(s.ficha(f.id)?.nome).toBe('Velho');
    expect(el.querySelector('.titulo-ficha')?.textContent).toContain('Velho');

    await clicar(fixture, el, '.topo-acoes .btn-mini', 0);
    await digitar(fixture, el, 'fich-nome', 'Novo nome');
    await clicar(fixture, el, '.cor', 2);
    await enviar(fixture, el);

    expect(s.ficha(f.id)).toMatchObject({ nome: 'Novo nome', cor: CORES_CAPA[2], paginas: 4 });
    expect(el.querySelector('.titulo-ficha')?.textContent).toContain('Novo nome');

    // nome vazio é recusado
    await clicar(fixture, el, '.topo-acoes .btn-mini', 0);
    await digitar(fixture, el, 'fich-nome', '   ');
    await enviar(fixture, el);
    expect(el.querySelector('.erro')?.textContent).toContain('nome');
    expect(s.ficha(f.id)?.nome).toBe('Novo nome');
  });

  it('abre mostrando só a frente da página 1 e depois folheia em folhas duplas, frente e verso', async () => {
    const { s, fixture, el } = await abrir();
    s.criar(novo({ nome: 'Livro', paginas: 3 }));
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');

    const proxima = () => el.querySelectorAll<HTMLButtonElement>('.paginador.grande .btn-secundario')[1];
    const anterior = () => el.querySelectorAll<HTMLButtonElement>('.paginador.grande .btn-secundario')[0];

    // vista 0: página 1 sozinha, na direita
    expect(nomesDosLados(el)).toEqual(['Página 1 · frente']);
    expect(el.querySelectorAll('.livro > .folha-vazia').length).toBe(1);
    expect(el.querySelector('.livro')!.children[0].classList.contains('folha-vazia')).toBe(true);
    expect(anterior().disabled).toBe(true);

    // vistas 1 e 2: folha dupla
    await clicar(fixture, el, '.paginador.grande .btn-secundario', 1);
    expect(nomesDosLados(el)).toEqual(['Página 1 · verso', 'Página 2 · frente']);
    expect(el.querySelectorAll('.folha-vazia').length).toBe(0);
    expect(el.querySelectorAll('.pagina-lado .slot').length).toBe(18);
    await clicar(fixture, el, '.paginador.grande .btn-secundario', 1);
    expect(nomesDosLados(el)).toEqual(['Página 2 · verso', 'Página 3 · frente']);

    // última vista: só o verso da última página, na esquerda
    await clicar(fixture, el, '.paginador.grande .btn-secundario', 1);
    expect(nomesDosLados(el)).toEqual(['Página 3 · verso']);
    expect(el.querySelector('.livro')!.lastElementChild!.classList.contains('folha-vazia')).toBe(true);
    expect(proxima().disabled).toBe(true);

    // voltar
    await clicar(fixture, el, '.paginador.grande .btn-secundario', 0);
    expect(nomesDosLados(el)).toEqual(['Página 2 · verso', 'Página 3 · frente']);
  });

  it('o campo "Página" vai para a frente da página e as setas do teclado folheiam', async () => {
    const { s, fixture, el } = await abrir();
    s.criar(novo({ paginas: 6 }));
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');

    const campo = el.querySelector<HTMLInputElement>('#fich-pagina')!;
    campo.value = '4';
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(nomesDosLados(el)).toEqual(['Página 3 · verso', 'Página 4 · frente']);
    expect(el.querySelector<HTMLInputElement>('#fich-pagina')!.value).toBe('4');

    campo.value = '1';
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(nomesDosLados(el)).toEqual(['Página 1 · frente']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();
    expect(nomesDosLados(el)).toEqual(['Página 1 · verso', 'Página 2 · frente']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await fixture.whenStable();
    expect(nomesDosLados(el)).toEqual(['Página 1 · frente']);
  });

  it('coloca cartas na frente e no verso e guarda o lado certo', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 }, { id: 'sv1-6', nome: 'Charizard ex', qtd: 1 });
    const { s, fixture, el } = await abrir();
    const f = s.criar(novo({ paginas: 3 }))!;
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');
    await clicar(fixture, el, '.paginador.grande .btn-secundario', 1); // vista 1: verso 1 | frente 2

    // slot 4 do lado direito (frente da página 2 = lado 2)
    await clicar(fixture, el, '.pagina-lado.dir .slot', 4);
    expect(el.querySelector('[role="dialog"]')).toBeTruthy();
    expect(el.textContent).toContain('Página 2 · frente · linha 2, coluna 2');
    const itens = [...el.querySelectorAll<HTMLElement>('.galeria-item')];
    itens.find((i) => i.textContent?.includes('Pikachu'))!.click();
    await fixture.whenStable();
    expect(s.ficha(f.id)?.espacos['2:4']).toMatchObject({ nome: 'Pikachu' });

    // slot 0 do lado esquerdo (verso da página 1 = lado 1)
    await clicar(fixture, el, '.pagina-lado.esq .slot', 0);
    expect(el.textContent).toContain('Página 1 · verso · linha 1, coluna 1');
    [...el.querySelectorAll<HTMLElement>('.galeria-item')].find((i) => i.textContent?.includes('Charizard'))!.click();
    await fixture.whenStable();
    expect(s.ficha(f.id)?.espacos['1:0']).toMatchObject({ nome: 'Charizard ex' });
    expect(el.querySelectorAll('.pagina-lado .slot.cheio').length).toBe(2);
  });

  it('carta da coleção sem cópia livre ainda pode ser usada, e fica marcada como fora da coleção', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 });
    const { s, fixture, el } = await abrir();
    const f = s.criar(novo({ linhas: 2, colunas: 2, paginas: 1 }))!;
    s.colocarCarta(f.id, 0, 0, pikachu);
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');
    expect(el.querySelectorAll('.slot .falta').length).toBe(0);

    await clicar(fixture, el, '.pagina-lado .slot', 1);
    const item = el.querySelector<HTMLButtonElement>('.galeria-item')!;
    expect(item.disabled).toBe(false);
    expect(item.textContent).toContain('Todas em uso');
    item.click();
    await fixture.whenStable();

    expect(s.ficha(f.id)?.espacos['0:1']).toMatchObject({ nome: 'Pikachu' });
    expect(el.querySelectorAll('.slot .falta').length).toBe(1);
    expect(el.querySelector('.faixa-falta')?.textContent).toContain('1 carta deste fichário não está');
  });

  it('busca qualquer carta, coloca no fichário e adiciona à coleção pelos botões', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 });
    const respostas: Record<string, unknown> = {
      pt: [{ id: 'sv9-12', name: 'Mewtwo ex', image: 'https://assets/sv9/12' }, { id: 'sv9-99', name: 'Sem imagem' }],
      en: [{ id: 'sv9-12', name: 'Mewtwo ex', image: 'https://assets/sv9/12' }, { id: 'swsh1-3', name: 'Mewtwo V', image: 'https://assets/swsh1/3' }],
    };
    vi.stubGlobal('fetch', async (url: string) => {
      const lingua = /\/v2\/(\w+)\//.exec(url)![1];
      return { ok: true, json: async () => respostas[lingua] };
    });

    const { s, fixture, el } = await abrir();
    const f = s.criar(novo({ linhas: 2, colunas: 2, paginas: 1 }))!;
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');
    await clicar(fixture, el, '.pagina-lado .slot', 0);

    await clicar(fixture, el, '.modo', 1);
    expect(el.querySelector('#fich-busca-api')).toBeTruthy();

    await digitar(fixture, el, 'fich-busca-api', 'mewtwo');
    await new Promise((r) => setTimeout(r, 600));
    await fixture.whenStable();

    const resultados = [...el.querySelectorAll<HTMLElement>('.galeria-item')];
    expect(resultados.map((r) => r.querySelector('.galeria-nome')?.textContent)).toEqual(['Mewtwo ex', 'Mewtwo V']);
    expect(resultados[0].textContent).toContain('Fora da coleção');

    const condicao = el.querySelector<HTMLSelectElement>('#fich-cond-api')!;
    condicao.value = 'LP';
    condicao.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    resultados[0].click();
    await fixture.whenStable();

    expect(s.ficha(f.id)?.espacos['0:0']).toEqual({
      id: 'sv9-12',
      nome: 'Mewtwo ex',
      imagem: 'https://assets/sv9/12/high.webp',
      condicao: 'LP',
    });
    expect(el.querySelectorAll('.slot .falta').length).toBe(1);

    // botão do bolso: abre o espaço, adiciona só aquela carta
    await clicar(fixture, el, '.pagina-lado .slot', 0);
    expect(el.querySelector('.aviso-falta')?.textContent).toContain('Não está na sua coleção');
    await clicar(fixture, el, '.atual .destaque-btn');
    expect(colecaoSalva().find((c) => c.id === 'sv9-12')).toMatchObject({ qtd: 1, condicao: 'LP', nome: 'Mewtwo ex' });
    expect(el.querySelector('.aviso-falta')).toBeNull();
    await clicar(fixture, el, '.fundo-modal');
    expect(el.querySelector('.faixa-falta')).toBeNull();
    expect(el.querySelectorAll('.slot .falta').length).toBe(0);
  });

  it('o botão do fichário leva tudo o que falta para a coleção de uma vez', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 });
    const { s, fixture, el } = await abrir();
    const f = s.criar(novo({ paginas: 2 }))!;
    s.colocarCarta(f.id, 0, 0, pikachu);
    s.colocarCarta(f.id, 0, 1, pikachu);
    s.colocarCarta(f.id, 1, 0, { id: 'sv9-1', nome: 'Mew', imagem: 'm.png' });
    await fixture.whenStable();

    await clicar(fixture, el, '.capa-card');
    expect(el.querySelector('.faixa-falta')?.textContent).toContain('2 cartas deste fichário não estão');

    await clicar(fixture, el, '.faixa-falta .btn-secundario');
    expect(colecaoSalva().map((c) => [c.id, c.qtd])).toEqual([['sv1-25', 2], ['sv9-1', 1]]);
    expect(el.querySelector('.faixa-falta')).toBeNull();
    expect(el.querySelector('.aviso-ok')?.textContent).toContain('2 cartas foram adicionadas');
  });

  it('a lista avisa quantas cartas de cada fichário estão fora da coleção', async () => {
    const { s, fixture, el } = await abrir();
    const f = s.criar(novo())!;
    s.colocarCarta(f.id, 0, 0, { id: 'sv9-1', nome: 'Mew', imagem: 'm.png' });
    await fixture.whenStable();
    expect(el.querySelector('.capa-falta')?.textContent).toContain('1 carta fora da coleção');
  });

  it('tira a carta de um espaço', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 1 });
    const { s, fixture, el } = await abrir();
    const f = s.criar(novo({ linhas: 2, colunas: 2, paginas: 1 }))!;
    s.colocarCarta(f.id, 0, 0, pikachu);
    await fixture.whenStable();
    await clicar(fixture, el, '.capa-card');
    await clicar(fixture, el, '.pagina-lado .slot', 0);
    await clicar(fixture, el, '.atual .perigo');

    expect(s.ficha(f.id)?.espacos['0:0']).toBeUndefined();
    expect(el.querySelectorAll('.pagina-lado .slot.cheio').length).toBe(0);
  });

  it('a busca mostra fichário, lado e posição e abre a vista certa com o bolso destacado', async () => {
    colecaoDe({ id: 'sv1-25', nome: 'Pikachu', qtd: 2 }, { id: 'sv1-6', nome: 'Charizard ex', qtd: 1 });
    const { s, fixture, el } = await abrir();
    const a = s.criar(novo({ nome: 'Escarlate', paginas: 4 }))!;
    const b = s.criar(novo({ nome: 'Favoritas', linhas: 2, colunas: 2, paginas: 2 }))!;
    s.colocarCarta(a.id, 3, 4, pikachu); // verso da página 2
    s.colocarCarta(b.id, 1, 3, pikachu); // verso da página 1
    s.colocarCarta(a.id, 0, 0, { id: 'sv1-6', nome: 'Charizard ex', imagem: '' });
    await fixture.whenStable();

    await digitar(fixture, el, 'fich-busca', 'pikachu');
    const grupos = [...el.querySelectorAll('.grupo')];
    expect(grupos.length).toBe(2);
    expect(grupos[0].textContent).toContain('Escarlate');
    expect(grupos[0].textContent).toContain('Página 2 · verso · linha 2, coluna 2');
    expect(grupos[1].textContent).toContain('Favoritas');
    expect(grupos[1].textContent).toContain('Página 1 · verso · linha 2, coluna 2');
    expect(el.textContent).not.toContain('Charizard');

    await digitar(fixture, el, 'fich-busca', 'zzz');
    expect(el.textContent).toContain('Nenhuma carta com esse nome');

    await digitar(fixture, el, 'fich-busca', 'pikachu');
    await clicar(fixture, el, '.resultado', 0);
    expect(el.querySelector('.titulo-ficha')?.textContent).toContain('Escarlate');
    expect(nomesDosLados(el)).toEqual(['Página 2 · verso', 'Página 3 · frente']);
    const marcados = el.querySelectorAll('.pagina-lado .slot.destaque');
    expect(marcados.length).toBe(1);
    expect(marcados[0].getAttribute('aria-label')).toContain('Página 2 · verso, linha 2, coluna 2');
  });
});

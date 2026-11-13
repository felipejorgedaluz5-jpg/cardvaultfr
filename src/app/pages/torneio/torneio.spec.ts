import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Torneio } from './torneio';
import { TorneioService } from '../../services/torneio.service';

describe('Torneio (página)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [Torneio] });
  });

  async function abrir() {
    const fixture = TestBed.createComponent(Torneio);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, el };
  }

  function clicar(el: HTMLElement, seletor: string, indice = 0): void {
    const alvo = el.querySelectorAll<HTMLElement>(seletor)[indice];
    expect(alvo, `elemento ${seletor}[${indice}]`).toBeTruthy();
    alvo.click();
  }

  it('digitar um número e enviar adiciona essa quantidade de jogadores', async () => {
    const { fixture, el } = await abrir();
    const servico = TestBed.inject(TorneioService);

    const campo = el.querySelector<HTMLInputElement>('#torneio-qtd')!;
    campo.value = '16';
    campo.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    expect(servico.jogadores().length).toBe(16);
    expect(servico.jogadores()[0].nome).toBe('Jogador 1');
    expect(servico.jogadores()[15].nome).toBe('Jogador 16');
    expect(el.querySelectorAll('.lista-jogadores li').length).toBe(16);

    campo.value = '2';
    campo.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(servico.jogadores()[17].nome).toBe('Jogador 18');
  });

  it('começa a rodada 1, lança resultados e libera a rodada 2', async () => {
    const { fixture, el } = await abrir();
    const servico = TestBed.inject(TorneioService);
    servico.adicionarVarios(16);
    await fixture.whenStable();

    clicar(el, '.faixa .btn-primario');
    await fixture.whenStable();

    expect(servico.rodadas().length).toBe(1);
    expect(el.querySelectorAll('.mesa').length).toBe(8);

    const proxima = () => el.querySelector<HTMLButtonElement>('.faixa .btn-primario')!;
    expect(proxima().disabled).toBe(true);

    for (let i = 0; i < 8; i++) {
      clicar(el, '.mesa .res:first-child', i);
    }
    await fixture.whenStable();
    expect(proxima().disabled).toBe(false);

    clicar(el, '.faixa .btn-primario');
    await fixture.whenStable();
    expect(servico.rodadas().length).toBe(2);
  });

  it('a classificação lista todos e pontua os vencedores', async () => {
    const { fixture, el } = await abrir();
    const servico = TestBed.inject(TorneioService);
    servico.adicionarVarios(4);
    servico.iniciarProximaRodada();
    servico.definirResultado(0, 0, 'a');
    servico.definirResultado(0, 1, 'e');
    await fixture.whenStable();

    clicar(el, '.aba', 2);
    await fixture.whenStable();

    const linhas = el.querySelectorAll('tbody tr');
    expect(linhas.length).toBe(4);
    expect(linhas[0].textContent).toContain('3');
  });

  it('guarda o torneio no navegador', async () => {
    const { fixture } = await abrir();
    const servico = TestBed.inject(TorneioService);
    servico.adicionarVarios(3);
    await fixture.whenStable();
    TestBed.tick();

    const salvo = JSON.parse(localStorage.getItem('cardvault-torneio-v1') ?? '{}');
    expect(salvo.jogadores?.length).toBe(3);
  });
});

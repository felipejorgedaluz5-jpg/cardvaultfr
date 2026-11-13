import { Injectable, computed, effect, signal } from '@angular/core';
import {
  Jogador,
  Resultado,
  Rodada,
  classificar,
  parearRodada,
  proximoNumero,
  rodadasRecomendadas,
} from './torneio.logic';

interface EstadoSalvo {
  jogadores: Jogador[];
  rodadas: Rodada[];
}

const LIMITE_POR_VEZ = 256;
const TAMANHO_MAX_NOME = 40;

/** Estado do torneio (jogadores e rodadas) com persistência em localStorage. */
@Injectable({ providedIn: 'root' })
export class TorneioService {
  private readonly chave = 'cardvault-torneio-v1';
  private contadorId = 0;

  readonly jogadores = signal<Jogador[]>([]);
  readonly rodadas = signal<Rodada[]>([]);

  readonly ativos = computed(() => this.jogadores().filter((j) => !j.saiu));
  readonly recomendadas = computed(() => rodadasRecomendadas(this.ativos().length));
  readonly classificacao = computed(() => classificar(this.jogadores(), this.rodadas()));
  private readonly nomes = computed(
    () => new Map(this.jogadores().map((j) => [j.id, j.nome] as const)),
  );

  constructor() {
    this.carregar();
    effect(() => this.salvar({ jogadores: this.jogadores(), rodadas: this.rodadas() }));
  }

  nome(id: string): string {
    return this.nomes().get(id) ?? '?';
  }

  adicionarNome(nome: string): boolean {
    const limpo = nome.trim().slice(0, TAMANHO_MAX_NOME);
    if (!limpo) return false;
    this.jogadores.update((lista) => [...lista, this.novoJogador(limpo)]);
    return true;
  }

  /** adiciona `quantidade` jogadores chamados "Jogador N", continuando a numeração existente */
  adicionarVarios(quantidade: number): number {
    if (!Number.isFinite(quantidade)) return 0;
    const total = Math.min(Math.floor(quantidade), LIMITE_POR_VEZ);
    if (total < 1) return 0;
    this.jogadores.update((lista) => {
      const inicio = proximoNumero(lista);
      const novos: Jogador[] = [];
      for (let i = 0; i < total; i++) novos.push(this.novoJogador(`Jogador ${inicio + i}`));
      return [...lista, ...novos];
    });
    return total;
  }

  /** só antes da primeira rodada; depois disso o jogador apenas sai ou volta */
  removerJogador(id: string): void {
    if (this.rodadas().length > 0) return;
    this.jogadores.update((lista) => lista.filter((j) => j.id !== id));
  }

  alternarSaida(id: string): void {
    this.jogadores.update((lista) => lista.map((j) => (j.id === id ? { ...j, saiu: !j.saiu } : j)));
  }

  iniciarProximaRodada(): void {
    if (this.ativos().length < 2) return;
    this.rodadas.update((rodadas) => [...rodadas, parearRodada(this.jogadores(), rodadas)]);
  }

  /** clicar de novo no mesmo resultado desfaz */
  definirResultado(indiceRodada: number, indicePartida: number, valor: Exclude<Resultado, null>): void {
    this.rodadas.update((rodadas) =>
      rodadas.map((rodada, r) =>
        r !== indiceRodada
          ? rodada
          : rodada.map((partida, p) =>
              p !== indicePartida || partida.b === null
                ? partida
                : { ...partida, resultado: partida.resultado === valor ? null : valor },
            ),
      ),
    );
  }

  reiniciar(): void {
    this.jogadores.set([]);
    this.rodadas.set([]);
  }

  private novoJogador(nome: string): Jogador {
    this.contadorId++;
    return { id: `j${Date.now().toString(36)}${this.contadorId}`, nome, saiu: false };
  }

  private carregar(): void {
    try {
      const bruto = localStorage.getItem(this.chave);
      if (!bruto) return;
      const salvo = JSON.parse(bruto) as Partial<EstadoSalvo>;
      if (Array.isArray(salvo.jogadores) && Array.isArray(salvo.rodadas)) {
        this.jogadores.set(salvo.jogadores);
        this.rodadas.set(salvo.rodadas);
      }
    } catch {
      // sem acesso ao armazenamento ou dados corrompidos: começa vazio
    }
  }

  private salvar(estado: EstadoSalvo): void {
    try {
      localStorage.setItem(this.chave, JSON.stringify(estado));
    } catch {
      // armazenamento indisponível: o torneio segue só em memória
    }
  }
}

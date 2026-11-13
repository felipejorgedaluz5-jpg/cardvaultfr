import { Component, computed, inject, signal } from '@angular/core';
import { Resultado } from '../../services/torneio.logic';
import { TorneioService } from '../../services/torneio.service';

type Aba = 'jogadores' | 'rodadas' | 'classificacao';

interface MesaView {
  mesa: number;
  indice: number;
  a: string;
  b: string;
  resultado: Resultado;
}

@Component({
  selector: 'app-torneio',
  templateUrl: './torneio.html',
  styleUrl: './torneio.css',
})
export class Torneio {
  protected readonly torneio = inject(TorneioService);

  protected readonly abas: { id: Aba; rotulo: string }[] = [
    { id: 'jogadores', rotulo: 'Jogadores' },
    { id: 'rodadas', rotulo: 'Rodadas' },
    { id: 'classificacao', rotulo: 'Classificação' },
  ];

  protected readonly aba = signal<Aba>('jogadores');
  protected readonly confirmandoReinicio = signal(false);
  private readonly indiceEscolhido = signal<number | null>(null);

  /** índice da rodada em exibição (a última, a menos que o usuário escolha outra); -1 sem rodadas */
  protected readonly indiceRodada = computed(() => {
    const total = this.torneio.rodadas().length;
    if (total === 0) return -1;
    const escolhido = this.indiceEscolhido();
    return escolhido === null || escolhido >= total ? total - 1 : escolhido;
  });

  protected readonly ehUltimaRodada = computed(
    () => this.indiceRodada() === this.torneio.rodadas().length - 1,
  );

  protected readonly mesas = computed<MesaView[]>(() => {
    const rodada = this.torneio.rodadas()[this.indiceRodada()];
    if (!rodada) return [];
    const resultado: MesaView[] = [];
    let numero = 0;
    rodada.forEach((p, indice) => {
      if (p.b === null) return;
      numero++;
      resultado.push({
        mesa: numero,
        indice,
        a: this.torneio.nome(p.a),
        b: this.torneio.nome(p.b),
        resultado: p.resultado,
      });
    });
    return resultado;
  });

  protected readonly folgas = computed(() => {
    const rodada = this.torneio.rodadas()[this.indiceRodada()];
    if (!rodada) return [];
    return rodada.filter((p) => p.b === null).map((p) => this.torneio.nome(p.a));
  });

  protected readonly pendentes = computed(
    () => this.mesas().filter((m) => m.resultado === null).length,
  );

  protected readonly metaAtingida = computed(
    () => this.torneio.rodadas().length >= this.torneio.recomendadas(),
  );

  protected adicionarVarios(evento: Event, campo: HTMLInputElement): void {
    evento.preventDefault();
    const adicionados = this.torneio.adicionarVarios(parseInt(campo.value, 10));
    if (adicionados > 0) campo.value = '';
    campo.focus();
  }

  protected adicionarNome(evento: Event, campo: HTMLInputElement): void {
    evento.preventDefault();
    if (this.torneio.adicionarNome(campo.value)) campo.value = '';
    campo.focus();
  }

  protected escolherRodada(indice: number): void {
    this.indiceEscolhido.set(indice);
  }

  protected iniciarRodada(): void {
    this.torneio.iniciarProximaRodada();
    this.indiceEscolhido.set(null);
    this.aba.set('rodadas');
  }

  protected definir(indicePartida: number, valor: Exclude<Resultado, null>): void {
    this.torneio.definirResultado(this.indiceRodada(), indicePartida, valor);
  }

  protected reiniciar(): void {
    this.torneio.reiniciar();
    this.indiceEscolhido.set(null);
    this.confirmandoReinicio.set(false);
  }

  protected porcentagem(valor: number): string {
    return (valor * 100).toFixed(1).replace('.', ',') + '%';
  }
}

import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FichariosService } from '../../services/fichario.service';
import {
  CartaDisponivel,
  Fichario,
  COLUNAS_MAX,
  LINHAS_MAX,
  NOME_MAX,
  PAGINAS_MAX,
  TAMANHOS,
  ResultadoBusca,
  agruparPorFichario,
  buscar,
  chaveEspaco,
  limitar,
  listarDisponiveis,
  normalizar,
  posicao,
  rotuloTamanho,
  totalEspacos,
  totalOcupados,
} from '../../services/fichario.logic';

type Tela = 'lista' | 'criar' | 'ver';

const LADO_MAX_CAPA = 480;
const TAMANHO_MAX_ARQUIVO = 10 * 1024 * 1024;

@Component({
  selector: 'app-ficharios',
  imports: [RouterLink],
  templateUrl: './ficharios.html',
  styleUrl: './ficharios.css',
})
export class Ficharios implements OnDestroy {
  protected readonly dados = inject(FichariosService);
  protected readonly auth = inject(AuthService);

  protected readonly tamanhos = TAMANHOS;
  protected readonly limites = { linhas: LINHAS_MAX, colunas: COLUNAS_MAX, paginas: PAGINAS_MAX, nome: NOME_MAX };

  protected readonly tela = signal<Tela>('lista');
  protected readonly fichaId = signal<string | null>(null);
  protected readonly pagina = signal(0);
  protected readonly destaque = signal<number | null>(null);
  private temporizadorDestaque: ReturnType<typeof setTimeout> | undefined;

  // formulário de novo fichário
  protected readonly nome = signal('');
  protected readonly capa = signal<string | null>(null);
  protected readonly linhas = signal(3);
  protected readonly colunas = signal(3);
  protected readonly paginas = signal(10);
  protected readonly paginaPrevia = signal(0);
  protected readonly erroFormulario = signal('');
  protected readonly lendoImagem = signal(false);

  // busca
  protected readonly termo = signal('');
  // janela de escolha de carta
  protected readonly espacoAberto = signal<number | null>(null);
  protected readonly filtroCartas = signal('');
  protected readonly erroEspaco = signal('');
  protected readonly confirmandoExclusao = signal(false);

  protected readonly logado = computed(() => !!this.auth.currentEmail());
  protected readonly ficha = computed(() => this.dados.ficha(this.fichaId()));

  protected readonly celulasPrevia = computed(() =>
    Array.from({ length: this.linhas() * this.colunas() }, (_, i) => i),
  );
  protected readonly totalPrevia = computed(() => this.linhas() * this.colunas() * this.paginas());

  protected readonly celulas = computed(() => {
    const f = this.ficha();
    return f ? Array.from({ length: f.linhas * f.colunas }, (_, i) => i) : [];
  });

  protected readonly grupos = computed(() => agruparPorFichario(buscar(this.dados.fichas(), this.termo())));
  protected readonly totalResultados = computed(() => this.grupos().reduce((n, g) => n + g.itens.length, 0));

  protected readonly cartaAtual = computed(() => {
    const f = this.ficha();
    const i = this.espacoAberto();
    return f && i !== null ? (f.espacos[chaveEspaco(this.pagina(), i)] ?? null) : null;
  });

  protected readonly candidatas = computed<CartaDisponivel[]>(() => {
    const palavras = normalizar(this.filtroCartas()).split(/\s+/).filter(Boolean);
    return listarDisponiveis(this.dados.colecao(), this.dados.fichas(), this.cartaAtual())
      .filter((c) => {
        const nome = normalizar(c.carta.nome);
        return palavras.every((p) => nome.includes(p));
      })
      .sort((a, b) => Number(b.livres > 0) - Number(a.livres > 0) || a.carta.nome.localeCompare(b.carta.nome));
  });

  ngOnDestroy(): void {
    clearTimeout(this.temporizadorDestaque);
  }

  // ---------- navegação entre telas ----------

  protected voltarParaLista(): void {
    this.tela.set('lista');
    this.fichaId.set(null);
    this.espacoAberto.set(null);
    this.confirmandoExclusao.set(false);
    this.destaque.set(null);
  }

  protected abrirFormulario(): void {
    this.nome.set('');
    this.capa.set(null);
    this.linhas.set(3);
    this.colunas.set(3);
    this.paginas.set(10);
    this.paginaPrevia.set(0);
    this.erroFormulario.set('');
    this.tela.set('criar');
  }

  protected abrirFichario(id: string, pagina = 0, destaque: number | null = null): void {
    this.dados.atualizarColecao();
    this.fichaId.set(id);
    this.pagina.set(pagina);
    this.espacoAberto.set(null);
    this.confirmandoExclusao.set(false);
    this.tela.set('ver');
    this.marcarDestaque(destaque);
  }

  protected abrirResultado(r: ResultadoBusca): void {
    this.abrirFichario(r.fichaId, r.pagina, r.indice);
  }

  private marcarDestaque(indice: number | null): void {
    clearTimeout(this.temporizadorDestaque);
    this.destaque.set(indice);
    if (indice !== null) {
      this.temporizadorDestaque = setTimeout(() => this.destaque.set(null), 4000);
    }
  }

  // ---------- formulário ----------

  protected escolherTamanho(linhas: number, colunas: number): void {
    this.linhas.set(linhas);
    this.colunas.set(colunas);
  }

  protected tamanhoAtivo(linhas: number, colunas: number): boolean {
    return this.linhas() === linhas && this.colunas() === colunas;
  }

  protected digitarLinhas(valor: string): void {
    this.linhas.set(limitar(parseInt(valor, 10), 1, LINHAS_MAX));
  }

  protected digitarColunas(valor: string): void {
    this.colunas.set(limitar(parseInt(valor, 10), 1, COLUNAS_MAX));
  }

  protected digitarPaginas(valor: string): void {
    this.paginas.set(limitar(parseInt(valor, 10), 1, PAGINAS_MAX));
    this.paginaPrevia.set(Math.min(this.paginaPrevia(), this.paginas() - 1));
  }

  protected virarPrevia(passo: number): void {
    this.paginaPrevia.set(limitar(this.paginaPrevia() + passo, 0, this.paginas() - 1));
  }

  protected async aoEscolherImagem(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    campo.value = '';
    if (!arquivo) return;
    this.erroFormulario.set('');

    if (!arquivo.type.startsWith('image/')) {
      this.erroFormulario.set('Escolha um arquivo de imagem (JPG, PNG ou WebP).');
      return;
    }
    if (arquivo.size > TAMANHO_MAX_ARQUIVO) {
      this.erroFormulario.set('A imagem é grande demais. Use uma de até 10 MB.');
      return;
    }

    this.lendoImagem.set(true);
    try {
      this.capa.set(await this.reduzirImagem(arquivo));
    } catch {
      this.erroFormulario.set('Não foi possível ler essa imagem. Tente outro arquivo.');
    } finally {
      this.lendoImagem.set(false);
    }
  }

  /** reduz a foto para caber no armazenamento do navegador (cada fichário guarda a sua capa) */
  private reduzirImagem(arquivo: File): Promise<string> {
    return new Promise((resolver, rejeitar) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const escala = Math.min(1, LADO_MAX_CAPA / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          rejeitar(new Error('canvas indisponível'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolver(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        rejeitar(new Error('imagem inválida'));
      };
      img.src = url;
    });
  }

  protected criar(evento: Event): void {
    evento.preventDefault();
    if (!this.nome().trim()) {
      this.erroFormulario.set('Dê um nome ao fichário.');
      return;
    }
    const ficha = this.dados.criar({
      nome: this.nome(),
      capa: this.capa(),
      linhas: this.linhas(),
      colunas: this.colunas(),
      paginas: this.paginas(),
    });
    if (!ficha) {
      this.erroFormulario.set('Não foi possível criar o fichário. Entre na sua conta e tente de novo.');
      return;
    }
    this.abrirFichario(ficha.id);
  }

  // ---------- visualização do fichário ----------

  protected irParaPagina(n: number): void {
    const f = this.ficha();
    if (!f) return;
    this.pagina.set(limitar(n, 0, f.paginas - 1));
  }

  protected digitarPagina(valor: string): void {
    const n = parseInt(valor, 10);
    if (Number.isFinite(n)) this.irParaPagina(n - 1);
  }

  protected adicionarPagina(): void {
    const f = this.ficha();
    if (f && this.dados.adicionarPagina(f.id)) this.pagina.set(f.paginas);
  }

  protected excluirFichario(): void {
    const f = this.ficha();
    if (f) this.dados.excluir(f.id);
    this.voltarParaLista();
  }

  protected cartaEm(indice: number) {
    return this.ficha()?.espacos[chaveEspaco(this.pagina(), indice)] ?? null;
  }

  protected rotuloEspaco(indice: number): string {
    const f = this.ficha();
    if (!f) return '';
    const { linha, coluna } = posicao(indice, f.colunas);
    const carta = this.cartaEm(indice);
    const lugar = `Linha ${linha}, coluna ${coluna}`;
    return carta ? `${lugar}: ${carta.nome} (${carta.condicao})` : `${lugar}: vazio`;
  }

  protected tituloEspaco(): string {
    const f = this.ficha();
    const i = this.espacoAberto();
    if (!f || i === null) return '';
    const { linha, coluna } = posicao(i, f.colunas);
    return `Página ${this.pagina() + 1} · linha ${linha}, coluna ${coluna}`;
  }

  protected abrirEspaco(indice: number): void {
    this.dados.atualizarColecao();
    this.filtroCartas.set('');
    this.erroEspaco.set('');
    this.espacoAberto.set(indice);
    setTimeout(() => document.getElementById('fich-filtro')?.focus());
  }

  protected fecharEspaco(): void {
    this.espacoAberto.set(null);
  }

  protected escolher(item: CartaDisponivel): void {
    const f = this.ficha();
    const i = this.espacoAberto();
    if (!f || i === null || item.livres < 1) return;
    const resultado = this.dados.colocarCarta(f.id, this.pagina(), i, item.carta);
    if (resultado === 'ok') this.fecharEspaco();
    else if (resultado === 'sem-copias') this.erroEspaco.set('Você não tem mais cópias livres dessa carta.');
    else this.erroEspaco.set('Não foi possível colocar a carta nesse espaço.');
  }

  protected removerDoEspaco(): void {
    const f = this.ficha();
    const i = this.espacoAberto();
    if (!f || i === null) return;
    this.dados.removerCarta(f.id, this.pagina(), i);
    this.fecharEspaco();
  }

  // ---------- resumos ----------

  protected tamanho(f: Fichario): string {
    return rotuloTamanho(f);
  }

  protected ocupados(f: Fichario): number {
    return totalOcupados(f);
  }

  protected total(f: Fichario): number {
    return totalEspacos(f);
  }

  protected porcentagem(f: Fichario): number {
    const t = totalEspacos(f);
    return t ? Math.round((totalOcupados(f) / t) * 100) : 0;
  }

  protected ocupadosNaPagina(f: Fichario): number {
    const p = this.pagina();
    const prefixo = `${p}:`;
    return Object.keys(f.espacos).filter((k) => k.startsWith(prefixo)).length;
  }

  // ---------- teclado ----------

  @HostListener('document:keydown', ['$event'])
  protected aoTeclar(evento: KeyboardEvent): void {
    if (evento.key === 'Escape' && this.espacoAberto() !== null) {
      this.fecharEspaco();
      return;
    }
    if (this.tela() !== 'ver' || this.espacoAberto() !== null) return;
    const alvo = evento.target as HTMLElement | null;
    if (alvo && ['INPUT', 'SELECT', 'TEXTAREA'].includes(alvo.tagName)) return;
    if (evento.key === 'ArrowLeft') this.irParaPagina(this.pagina() - 1);
    else if (evento.key === 'ArrowRight') this.irParaPagina(this.pagina() + 1);
  }
}

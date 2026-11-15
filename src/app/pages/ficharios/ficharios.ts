import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CartaBusca, CartasApiService } from '../../services/cartas-api.service';
import { FichariosService } from '../../services/fichario.service';
import { CONDICOES } from '../colecao/colecao';
import {
  CartaDisponivel,
  Fichario,
  COLUNAS_MAX,
  CORES_CAPA,
  LINHAS_MAX,
  NOME_MAX,
  PAGINAS_MAX,
  TAMANHOS,
  ResultadoBusca,
  agruparPorFichario,
  buscar,
  chaveCarta,
  chaveEspaco,
  chaveFaltando,
  corAleatoria,
  corDaCapa,
  corDoTexto,
  ladosDaVista,
  limitar,
  listarDisponiveis,
  normalizar,
  posicao,
  rotuloLado,
  rotuloTamanho,
  rotuloVista,
  totalEspacos,
  totalOcupados,
  totalVistas,
  vistaDoLado,
} from '../../services/fichario.logic';

type Tela = 'lista' | 'criar' | 'editar' | 'ver';
type ModoEscolha = 'colecao' | 'busca';

/** um bolso do fichário: o lado (frente ou verso de uma página) e o índice do espaço nele */
interface Local {
  lado: number;
  indice: number;
}

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
  private readonly api = inject(CartasApiService);

  protected readonly tamanhos = TAMANHOS;
  protected readonly cores = CORES_CAPA;
  protected readonly condicoes = CONDICOES;
  protected readonly limites = { linhas: LINHAS_MAX, colunas: COLUNAS_MAX, paginas: PAGINAS_MAX, nome: NOME_MAX };
  protected readonly corDaCapa = corDaCapa;
  protected readonly corDoTexto = corDoTexto;

  protected readonly tela = signal<Tela>('lista');
  protected readonly fichaId = signal<string | null>(null);
  /** vista aberta: 0 = só a frente da página 1; depois folhas duplas (veja `ladosDaVista`) */
  protected readonly vista = signal(0);
  protected readonly destaque = signal<Local | null>(null);
  private temporizadorDestaque: ReturnType<typeof setTimeout> | undefined;
  private temporizadorAviso: ReturnType<typeof setTimeout> | undefined;

  // formulário (criar e editar)
  protected readonly nome = signal('');
  protected readonly capa = signal<string | null>(null);
  /** cor que a pessoa escolheu; null = ainda não escolheu */
  protected readonly cor = signal<string | null>(null);
  /** cor sorteada ao abrir o formulário: é a que vale se nenhuma for escolhida */
  protected readonly corSugerida = signal(corAleatoria());
  protected readonly corEfetiva = computed(() => this.cor() ?? this.corSugerida());
  protected readonly inicial = computed(() => (this.nome().trim().charAt(0) || '?').toUpperCase());
  protected readonly linhas = signal(3);
  protected readonly colunas = signal(3);
  protected readonly paginas = signal(10);
  protected readonly paginaPrevia = signal(0);
  protected readonly erroFormulario = signal('');
  protected readonly lendoImagem = signal(false);

  // busca dentro dos fichários
  protected readonly termo = signal('');

  // janela de escolha de carta
  protected readonly espacoAberto = signal<Local | null>(null);
  protected readonly modoEscolha = signal<ModoEscolha>('colecao');
  protected readonly filtroCartas = signal('');
  protected readonly confirmandoExclusao = signal(false);
  protected readonly aviso = signal('');

  // busca de qualquer carta (fora da coleção)
  protected readonly termoApi = signal('');
  protected readonly condicaoExterna = signal('NM');
  protected readonly resultadosApi = signal<CartaBusca[]>([]);
  protected readonly buscandoApi = signal(false);
  protected readonly erroApi = signal('');
  private temporizadorApi: ReturnType<typeof setTimeout> | undefined;
  private sequenciaApi = 0;

  protected readonly logado = computed(() => !!this.auth.currentEmail());
  protected readonly ficha = computed(() => this.dados.ficha(this.fichaId()));

  protected readonly celulasPrevia = computed(() =>
    Array.from({ length: this.linhas() * this.colunas() }, (_, i) => i),
  );
  protected readonly totalPrevia = computed(() => this.linhas() * this.colunas() * this.paginas() * 2);

  protected readonly celulas = computed(() => {
    const f = this.ficha();
    return f ? Array.from({ length: f.linhas * f.colunas }, (_, i) => i) : [];
  });

  /** os dois lados da vista: [esquerda, direita], com null onde não há página */
  protected readonly ladosVisiveis = computed<[number | null, number | null]>(() => {
    const f = this.ficha();
    return f ? ladosDaVista(this.vista(), f.paginas) : [null, null];
  });
  protected readonly rotuloDaVista = computed(() => {
    const f = this.ficha();
    return f ? rotuloVista(this.vista(), f.paginas) : '';
  });
  protected readonly ultimaVista = computed(() => {
    const f = this.ficha();
    return f ? totalVistas(f.paginas) - 1 : 0;
  });
  /** número mostrado no campo "Página": a da direita da vista (ou a da esquerda, se não houver direita) */
  protected readonly paginaNoCampo = computed(() => {
    const [esq, dir] = this.ladosVisiveis();
    const lado = dir ?? esq ?? 0;
    return Math.floor(lado / 2) + 1;
  });

  protected readonly grupos = computed(() => agruparPorFichario(buscar(this.dados.fichas(), this.termo())));
  protected readonly totalResultados = computed(() => this.grupos().reduce((n, g) => n + g.itens.length, 0));

  /** quantos espaços de cada fichário têm carta que falta na coleção */
  protected readonly faltamPorFichario = computed(() => {
    const mapa = new Map<string, number>();
    for (const chave of this.dados.faltando()) {
      const id = chave.slice(0, chave.indexOf('|'));
      mapa.set(id, (mapa.get(id) ?? 0) + 1);
    }
    return mapa;
  });
  protected readonly faltantes = computed(() => this.dados.faltantesDe(this.fichaId()));
  protected readonly totalFaltam = computed(() => this.faltantes().reduce((n, f) => n + f.faltam, 0));

  protected readonly cartaAtual = computed(() => {
    const f = this.ficha();
    const local = this.espacoAberto();
    return f && local ? (f.espacos[chaveEspaco(local.lado, local.indice)] ?? null) : null;
  });
  protected readonly faltaAtual = computed(() => {
    const local = this.espacoAberto();
    return !!local && this.falta(local.lado, local.indice);
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
    clearTimeout(this.temporizadorAviso);
    clearTimeout(this.temporizadorApi);
  }

  // ---------- navegação entre telas ----------

  protected voltarParaLista(): void {
    this.tela.set('lista');
    this.fichaId.set(null);
    this.espacoAberto.set(null);
    this.confirmandoExclusao.set(false);
    this.destaque.set(null);
    this.aviso.set('');
  }

  protected abrirFormulario(): void {
    this.nome.set('');
    this.capa.set(null);
    this.cor.set(null);
    this.corSugerida.set(corAleatoria());
    this.linhas.set(3);
    this.colunas.set(3);
    this.paginas.set(10);
    this.paginaPrevia.set(0);
    this.erroFormulario.set('');
    this.tela.set('criar');
  }

  protected abrirEdicao(): void {
    const f = this.ficha();
    if (!f) return;
    this.nome.set(f.nome);
    this.capa.set(f.capa);
    this.cor.set(null);
    this.corSugerida.set(corDaCapa(f));
    this.erroFormulario.set('');
    this.confirmandoExclusao.set(false);
    this.tela.set('editar');
  }

  protected cancelarEdicao(): void {
    this.tela.set('ver');
  }

  protected abrirFichario(id: string, lado = 0, destaque: Local | null = null): void {
    this.dados.atualizarColecao();
    this.fichaId.set(id);
    this.vista.set(vistaDoLado(lado));
    this.espacoAberto.set(null);
    this.confirmandoExclusao.set(false);
    this.aviso.set('');
    this.tela.set('ver');
    this.marcarDestaque(destaque);
  }

  protected abrirResultado(r: ResultadoBusca): void {
    this.abrirFichario(r.fichaId, r.lado, { lado: r.lado, indice: r.indice });
  }

  private marcarDestaque(local: Local | null): void {
    clearTimeout(this.temporizadorDestaque);
    this.destaque.set(local);
    if (local !== null) {
      this.temporizadorDestaque = setTimeout(() => this.destaque.set(null), 4000);
    }
  }

  private mostrarAviso(texto: string): void {
    clearTimeout(this.temporizadorAviso);
    this.aviso.set(texto);
    this.temporizadorAviso = setTimeout(() => this.aviso.set(''), 6000);
  }

  // ---------- formulário ----------

  protected escolherCor(cor: string): void {
    this.cor.set(cor);
  }

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
    this.paginaPrevia.set(Math.min(this.paginaPrevia(), this.paginas() * 2 - 1));
  }

  protected virarPrevia(passo: number): void {
    this.paginaPrevia.set(limitar(this.paginaPrevia() + passo, 0, this.paginas() * 2 - 1));
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

  protected enviarFormulario(evento: Event): void {
    evento.preventDefault();
    if (!this.nome().trim()) {
      this.erroFormulario.set('Dê um nome ao fichário.');
      return;
    }

    if (this.tela() === 'editar') {
      const f = this.ficha();
      if (f && this.dados.editar(f.id, { nome: this.nome(), capa: this.capa(), cor: this.corEfetiva() })) {
        this.tela.set('ver');
      } else {
        this.erroFormulario.set('Não foi possível salvar as alterações.');
      }
      return;
    }

    const ficha = this.dados.criar({
      nome: this.nome(),
      capa: this.capa(),
      cor: this.corEfetiva(),
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

  protected irParaVista(n: number): void {
    this.vista.set(limitar(n, 0, this.ultimaVista()));
  }

  /** "ir para a página N": abre a vista onde a frente da página N aparece */
  protected digitarPagina(valor: string): void {
    const f = this.ficha();
    const n = parseInt(valor, 10);
    if (!f || !Number.isFinite(n)) return;
    this.irParaVista(vistaDoLado((limitar(n, 1, f.paginas) - 1) * 2));
  }

  /** acrescenta uma página (frente e verso) no fim e abre a frente dela */
  protected adicionarPagina(): void {
    const f = this.ficha();
    if (f && this.dados.adicionarPagina(f.id)) this.vista.set(vistaDoLado(f.paginas * 2));
  }

  protected excluirFichario(): void {
    const f = this.ficha();
    if (f) this.dados.excluir(f.id);
    this.voltarParaLista();
  }

  protected cartaEm(lado: number, indice: number) {
    return this.ficha()?.espacos[chaveEspaco(lado, indice)] ?? null;
  }

  protected ehDestaque(lado: number, indice: number): boolean {
    const d = this.destaque();
    return !!d && d.lado === lado && d.indice === indice;
  }

  /** a carta desse espaço não está coberta pela coleção */
  protected falta(lado: number, indice: number): boolean {
    const f = this.ficha();
    return !!f && this.dados.faltando().has(chaveFaltando(f.id, chaveEspaco(lado, indice)));
  }

  protected rotuloLado(lado: number): string {
    return rotuloLado(lado);
  }

  protected readonly rotuloPrevia = computed(() => rotuloLado(this.paginaPrevia()));

  protected rotuloEspaco(lado: number, indice: number): string {
    const f = this.ficha();
    if (!f) return '';
    const { linha, coluna } = posicao(indice, f.colunas);
    const carta = this.cartaEm(lado, indice);
    const lugar = `${rotuloLado(lado)}, linha ${linha}, coluna ${coluna}`;
    if (!carta) return `${lugar}: vazio`;
    return `${lugar}: ${carta.nome} (${carta.condicao})${this.falta(lado, indice) ? ', não está na sua coleção' : ''}`;
  }

  protected tituloEspaco(): string {
    const f = this.ficha();
    const local = this.espacoAberto();
    if (!f || !local) return '';
    const { linha, coluna } = posicao(local.indice, f.colunas);
    return `${rotuloLado(local.lado)} · linha ${linha}, coluna ${coluna}`;
  }

  protected abrirEspaco(lado: number, indice: number): void {
    this.dados.atualizarColecao();
    this.filtroCartas.set('');
    this.termoApi.set('');
    this.resultadosApi.set([]);
    this.erroApi.set('');
    this.buscandoApi.set(false);
    this.sequenciaApi++;
    clearTimeout(this.temporizadorApi);
    this.modoEscolha.set(this.dados.colecao().length > 0 ? 'colecao' : 'busca');
    this.espacoAberto.set({ lado, indice });
    setTimeout(() => document.getElementById(this.modoEscolha() === 'busca' ? 'fich-busca-api' : 'fich-filtro')?.focus());
  }

  protected fecharEspaco(): void {
    this.espacoAberto.set(null);
  }

  protected trocarModo(modo: ModoEscolha): void {
    this.modoEscolha.set(modo);
    setTimeout(() => document.getElementById(modo === 'busca' ? 'fich-busca-api' : 'fich-filtro')?.focus());
  }

  /** carta da coleção: pode usar mesmo sem cópia livre, e o que passar do que você tem vira "falta" */
  protected escolher(item: CartaDisponivel): void {
    const f = this.ficha();
    const local = this.espacoAberto();
    if (!f || !local) return;
    if (this.dados.colocarCarta(f.id, local.lado, local.indice, item.carta) === 'ok') this.fecharEspaco();
  }

  protected escolherDaBusca(carta: CartaBusca): void {
    const f = this.ficha();
    const local = this.espacoAberto();
    if (!f || !local) return;
    const resultado = this.dados.colocarCarta(f.id, local.lado, local.indice, {
      id: carta.id,
      nome: carta.nome,
      imagem: carta.imagemAlta,
      condicao: this.condicaoExterna(),
    });
    if (resultado === 'ok') this.fecharEspaco();
  }

  protected possuiNaColecao(carta: CartaBusca): boolean {
    const k = chaveCarta(carta.id, this.condicaoExterna());
    return this.dados.colecao().some((c) => chaveCarta(c.id, c.condicao) === k);
  }

  protected digitarBuscaApi(valor: string): void {
    this.termoApi.set(valor);
    clearTimeout(this.temporizadorApi);
    const texto = valor.trim();
    this.sequenciaApi++;
    this.erroApi.set('');

    if (texto.length < 3) {
      this.resultadosApi.set([]);
      this.buscandoApi.set(false);
      return;
    }
    this.buscandoApi.set(true);
    this.temporizadorApi = setTimeout(() => void this.executarBuscaApi(texto), 400);
  }

  private async executarBuscaApi(texto: string): Promise<void> {
    const id = ++this.sequenciaApi;
    try {
      const resultados = await this.api.buscarPorNome(texto);
      if (id !== this.sequenciaApi) return;
      this.resultadosApi.set(resultados);
    } catch {
      if (id !== this.sequenciaApi) return;
      this.resultadosApi.set([]);
      this.erroApi.set('Não foi possível buscar agora. Verifique sua conexão e tente de novo.');
    } finally {
      if (id === this.sequenciaApi) this.buscandoApi.set(false);
    }
  }

  protected removerDoEspaco(): void {
    const f = this.ficha();
    const local = this.espacoAberto();
    if (!f || !local) return;
    this.dados.removerCarta(f.id, local.lado, local.indice);
    this.fecharEspaco();
  }

  // ---------- adicionar à coleção ----------

  /** uma cópia da carta deste espaço vai para a coleção */
  protected adicionarAtualNaColecao(): void {
    const atual = this.cartaAtual();
    if (!atual) return;
    if (this.dados.adicionarNaColecao([{ ...atual, qtd: 1 }])) {
      this.mostrarAviso(`${atual.nome} (${atual.condicao}) foi adicionada à sua coleção.`);
    } else {
      this.mostrarAviso('Não foi possível adicionar à coleção.');
    }
  }

  protected adicionarFaltantesNaColecao(): void {
    const f = this.ficha();
    if (!f) return;
    const quantas = this.totalFaltam();
    if (this.dados.adicionarFaltantesNaColecao(f.id)) {
      this.mostrarAviso(
        quantas === 1 ? '1 carta foi adicionada à sua coleção.' : `${quantas} cartas foram adicionadas à sua coleção.`,
      );
    } else {
      this.mostrarAviso('Não foi possível adicionar à coleção.');
    }
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

  /** espaços com carta nos lados que estão na tela */
  protected ocupadosNaVista(f: Fichario): number {
    const prefixos = this.ladosVisiveis()
      .filter((l): l is number => l !== null)
      .map((l) => `${l}:`);
    return Object.keys(f.espacos).filter((k) => prefixos.some((p) => k.startsWith(p))).length;
  }

  protected espacosNaVista(f: Fichario): number {
    return this.ladosVisiveis().filter((l) => l !== null).length * f.linhas * f.colunas;
  }

  protected letra(f: Fichario): string {
    return (f.nome.trim().charAt(0) || '?').toUpperCase();
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
    if (evento.key === 'ArrowLeft') this.irParaVista(this.vista() - 1);
    else if (evento.key === 'ArrowRight') this.irParaVista(this.vista() + 1);
  }
}

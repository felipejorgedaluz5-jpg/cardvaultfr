import { ChangeDetectorRef, Component, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ImageLightbox } from '../../shared/image-lightbox/image-lightbox';

export interface Carta {
  id: string;
  nome: string;
  /** preço unitário em R$ (0 enquanto não houver preço de mercado) */
  valor: number;
  imagem: string;
  qtd: number;
  /** de onde veio o preço; ausente = ainda não consultado */
  fonte?: 'tcgplayer' | 'cardmarket' | 'indisponivel';
  precoOriginal?: number;
  moeda?: 'USD' | 'EUR';
  precoAtualizadoEm?: number;
}

export interface BaralhoCarta {
  id: string;
  nome: string;
  imagem: string;
  qtd: number;
}

export interface Baralho {
  nome: string;
  cartas: BaralhoCarta[];
}

export interface CartaApi {
  id: string;
  name: string;
  image?: string;
  set?: { id: string; name: string };
  releaseDate?: string;
  setName?: string;
}

interface TipoTreinador {
  valor: string;
  label: string;
}

type Contexto = 'colecao' | 'baralho';

/** dados de uma carta necessários para validar/exportar (vindos da TCGdex) */
interface DetalheCarta {
  nome: string;
  nomeEn: string;
  categoria: 'Pokemon' | 'Trainer' | 'Energy' | 'Desconhecida';
  estagio?: string;
  evoluiDe?: string;
  raridade?: string;
  energiaBasica: boolean;
  legalStandard?: boolean;
  legalExpandido?: boolean;
  marca?: string;
  setCodigo: string;
  numero: string;
}

export interface ProblemaBaralho {
  tipo: 'erro' | 'aviso';
  texto: string;
}

export interface ResultadoVerificacao {
  valido: boolean;
  total: number;
  problemas: ProblemaBaralho[];
}

@Component({
  selector: 'app-colecao',
  imports: [CommonModule, FormsModule, RouterLink, ImageLightbox],
  templateUrl: './colecao.html',
  styleUrl: './colecao.css',
})
export class Colecao {
  aba = signal<'colecao' | 'baralhos'>('colecao');
  mostrarValores = signal<boolean>(true);
  atualizandoPrecos = signal<boolean>(false);
  private carregandoPrecos = new Set<string>();
  private taxas: { USD: number; EUR: number } | null = null;
  private readonly VALIDADE_PRECO_MS = 12 * 60 * 60 * 1000;

  colecao: Carta[] = [];
  baralhos: Baralho[] = [];
  setsCache: any[] = [];
  private setsCacheEn: any[] = [];
  baralhoAtivoIndex = -1;

  filtroLingua = 'pt';
  filtroTipo = '';
  filtroExpansao = '';
  tipos: string[] = [];
  expansoes: any[] = [];

  tiposTreinador: TipoTreinador[] = [
    { valor: 'Item', label: 'Treinador - Item' },
    { valor: 'Tool', label: 'Treinador - Ferramenta' },
    { valor: 'Supporter', label: 'Treinador - Apoiador' },
    { valor: 'Stadium', label: 'Treinador - Estádio' },
  ];

  private readonly SET_ENERGIAS_ID = 'sve';
  private cacheSetEnergias: Record<string, CartaApi[]> = {};

  codigoBaralhoPendente: string | null = null;
  codigoImportar = '';
  linkCompartilhar: string | null = null;

  novoNomeColecao = '';
  dropdownColecao: CartaApi[] = [];
  mostrarDropdownColecao = false;

  novoNomeBaralho = '';
  dropdownBaralho: CartaApi[] = [];
  mostrarDropdownBaralho = false;

  nomeNovoBaralho = '';
  mostrarColecaoNoBaralho = false;
  filtroColecaoBaralho = '';

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // verificação de formato e exportação do baralho
  private cacheDetalhes = new Map<string, DetalheCarta | null>();
  /** livre = qualquer carta (inclui as antigas); standard/expandido checam a legalidade */
  formatoBaralho: 'livre' | 'standard' | 'expandido' = 'livre';
  get nomeFormato(): string {
    return this.formatoBaralho === 'standard' ? 'Standard' : this.formatoBaralho === 'expandido' ? 'Expandido' : 'Livre';
  }
  verificando = signal<boolean>(false);
  exportando = signal<boolean>(false);
  resultadoVerificacao: ResultadoVerificacao | null = null;
  textoExportado: string | null = null;
  copiadoExport = false;

  constructor(
    public auth: AuthService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    if (this.auth.currentEmail()) {
      this.carregarDadosUsuario();
      this.carregarFiltrosIniciais();
    }

    const codigoUrl = this.route.snapshot.queryParamMap.get('baralho');
    if (codigoUrl) {
      const importou = this.importarBaralhoDeCodigo(codigoUrl);
      if (importou) {
        this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      }
    }
  }

  get logado(): boolean {
    return !!this.auth.currentEmail();
  }

  imagemExpandida: { url: string; alt: string } | null = null;

  abrirImagem(url: string, alt: string): void {
    if (!url) return;
    this.imagemExpandida = { url, alt };
  }

  fecharImagem(): void {
    this.imagemExpandida = null;
  }

  private extrairSetId(id: string): string {
    const partes = id.split('-');
    partes.pop();
    return partes.join('-');
  }

  get colecaoFiltrada(): Carta[] {
    if (!this.filtroExpansao) return this.colecao;
    return this.colecao.filter((c) => this.extrairSetId(c.id) === this.filtroExpansao);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.busca-wrap')) {
      this.mostrarDropdownColecao = false;
      this.mostrarDropdownBaralho = false;
    }
  }

  mudarAba(aba: 'colecao' | 'baralhos'): void {
    this.aba.set(aba);
    if (aba === 'colecao' && this.colecao.length === 0 && this.baralhos.length === 0) {
      this.carregarDadosUsuario();
    }
  }

  carregarDadosUsuario(): void {
    const email = this.auth.usuarioAtualEmail();
    if (!email) {
      this.colecao = [];
      this.baralhos = [];
      return;
    }
    try {
      const bruto: Carta[] = JSON.parse(localStorage.getItem('cardvault_colecao_' + email) || '[]');
      this.colecao = this.consolidarQuantidades(bruto).map((c) =>
        // preços antigos (sem fonte) eram estimativas aleatórias: descarta e busca o real
        c.fonte ? c : { ...c, valor: 0 },
      );
      this.baralhos = JSON.parse(localStorage.getItem('cardvault_baralhos_' + email) || '[]');
    } catch {
      this.colecao = [];
      this.baralhos = [];
    }
    this.mostrarValores.set(localStorage.getItem('cardvault_mostrarValores_' + email) !== 'nao');
    void this.atualizarPrecos();
  }

  // junta linhas repetidas em uma só com qtd (dados antigos vinham sem isso)
  private consolidarQuantidades(cartas: Carta[]): Carta[] {
    const agrupadas = new Map<string, Carta>();
    for (const c of cartas) {
      const chave = c.id || c.nome;
      const existente = agrupadas.get(chave);
      if (existente) existente.qtd += c.qtd ?? 1;
      else agrupadas.set(chave, { ...c, qtd: c.qtd ?? 1 });
    }
    return [...agrupadas.values()];
  }

  toggleMostrarValores(): void {
    this.mostrarValores.update((v) => !v);
    const email = this.auth.usuarioAtualEmail();
    if (!email) return;
    localStorage.setItem('cardvault_mostrarValores_' + email, this.mostrarValores() ? 'sim' : 'nao');
  }

  salvarDados(): void {
    const email = this.auth.usuarioAtualEmail();
    if (!email) return;
    localStorage.setItem('cardvault_colecao_' + email, JSON.stringify(this.colecao));
    localStorage.setItem('cardvault_baralhos_' + email, JSON.stringify(this.baralhos));
  }

  async carregarFiltrosIniciais(): Promise<void> {
    try {
      const resTipos = await fetch(`https://api.tcgdex.net/v2/${this.filtroLingua}/types`);
      this.tipos = await resTipos.json();

      const resSets = await fetch(`https://api.tcgdex.net/v2/${this.filtroLingua}/sets`);
      this.setsCache = await resSets.json();
      this.expansoes = [...this.setsCache].reverse();

      // sets em inglês (os antigos que não existem em pt) para nome/data nos resultados da busca
      if (this.filtroLingua !== 'en') {
        try {
          const resEn = await fetch('https://api.tcgdex.net/v2/en/sets');
          const dadosEn = await resEn.json();
          this.setsCacheEn = Array.isArray(dadosEn) ? dadosEn : [];
        } catch {}
      } else {
        this.setsCacheEn = [];
      }
    } catch (e) {
      console.error('Erro na API:', e);
    } finally {
      // zoneless, então precisa forçar a detecção de mudança manualmente
      this.cdr.markForCheck();
    }
  }

  // ---------- Preços reais (TCGdex: TCGplayer em USD / Cardmarket em EUR) ----------

  private precisaAtualizar(c: Carta): boolean {
    if (this.carregandoPrecos.has(c.id)) return false;
    if (!c.fonte || !c.precoAtualizadoEm) return true;
    return Date.now() - c.precoAtualizadoEm > this.VALIDADE_PRECO_MS;
  }

  private async obterTaxas(): Promise<{ USD: number; EUR: number } | null> {
    if (this.taxas) return this.taxas;
    try {
      const resp = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL');
      const dados = await resp.json();
      const USD = parseFloat(dados?.USDBRL?.bid);
      const EUR = parseFloat(dados?.EURBRL?.bid);
      if (USD > 0 && EUR > 0) {
        this.taxas = { USD, EUR };
        localStorage.setItem('cardvault_taxas', JSON.stringify(this.taxas));
        return this.taxas;
      }
    } catch (e) {
      console.warn('Não foi possível obter a cotação do dólar/euro', e);
    }
    // sem rede para a cotação: usa a última cotação real que ficou salva
    try {
      const salvas = JSON.parse(localStorage.getItem('cardvault_taxas') || 'null');
      if (salvas?.USD > 0 && salvas?.EUR > 0) return (this.taxas = { USD: salvas.USD, EUR: salvas.EUR });
    } catch {}
    return null;
  }

  // undefined = falha de rede; null = carta não encontrada / sem dados de preço
  private async buscarPricing(id: string): Promise<any | null | undefined> {
    let falhouRede = false;
    for (const lingua of ['en', this.filtroLingua]) {
      try {
        const resp = await fetch(`https://api.tcgdex.net/v2/${lingua}/cards/${encodeURIComponent(id)}`);
        if (!resp.ok) continue;
        const carta = await resp.json();
        return carta?.pricing ?? null;
      } catch {
        falhouRede = true;
      }
    }
    return falhouRede ? undefined : null;
  }

  private extrairPreco(pricing: any): { fonte: 'tcgplayer' | 'cardmarket'; valor: number; moeda: 'USD' | 'EUR' } | null {
    const tp = pricing?.tcgplayer;
    if (tp) {
      // prefere a versão normal; se a carta só existir holo/reverse, usa a que houver
      for (const variante of ['normal', 'holo', 'reverse']) {
        const v = tp[variante];
        const p = v?.marketPrice ?? v?.midPrice;
        if (typeof p === 'number' && p > 0) return { fonte: 'tcgplayer', valor: p, moeda: 'USD' };
      }
    }
    const cm = pricing?.cardmarket;
    if (cm) {
      for (const campo of ['trend', 'avg', 'trend-holo', 'avg-holo']) {
        const p = cm[campo];
        if (typeof p === 'number' && p > 0) return { fonte: 'cardmarket', valor: p, moeda: 'EUR' };
      }
    }
    return null;
  }

  private async atualizarPrecoCarta(c: Carta, taxas: { USD: number; EUR: number }): Promise<void> {
    const pricing = await this.buscarPricing(c.id);
    if (pricing === undefined) return; // falha de rede: tenta de novo na próxima vez

    const preco = this.extrairPreco(pricing);
    if (preco) {
      c.fonte = preco.fonte;
      c.moeda = preco.moeda;
      c.precoOriginal = preco.valor;
      c.valor = Math.round(preco.valor * taxas[preco.moeda] * 100) / 100;
    } else {
      c.fonte = 'indisponivel';
      c.valor = 0;
      c.precoOriginal = undefined;
      c.moeda = undefined;
    }
    c.precoAtualizadoEm = Date.now();
  }

  async atualizarPrecos(forcar = false): Promise<void> {
    const alvo = this.colecao.filter((c) => (forcar ? !this.carregandoPrecos.has(c.id) : this.precisaAtualizar(c)));
    if (alvo.length === 0) return;

    const taxas = await this.obterTaxas();
    if (!taxas) return;

    alvo.forEach((c) => this.carregandoPrecos.add(c.id));
    this.atualizandoPrecos.set(true);
    this.cdr.markForCheck();

    try {
      for (let i = 0; i < alvo.length; i += 5) {
        await Promise.all(alvo.slice(i, i + 5).map((c) => this.atualizarPrecoCarta(c, taxas)));
        this.cdr.markForCheck();
      }
    } finally {
      alvo.forEach((c) => this.carregandoPrecos.delete(c.id));
      this.atualizandoPrecos.set(false);
      this.salvarDados();
      this.cdr.markForCheck();
    }
  }

  temPreco(c: Carta): boolean {
    return c.fonte === 'tcgplayer' || c.fonte === 'cardmarket';
  }

  textoPreco(c: Carta): string {
    if (this.carregandoPrecos.has(c.id)) return 'Buscando preço...';
    if (!this.temPreco(c)) return 'Sem preço';
    return 'R$ ' + (c.valor * c.qtd).toFixed(2).replace('.', ',');
  }

  dicaPreco(c: Carta): string {
    if (!this.temPreco(c) || c.precoOriginal == null) return 'Sem preço de mercado disponível para esta carta';
    const fonte = c.fonte === 'tcgplayer' ? 'TCGplayer' : 'Cardmarket';
    const simbolo = c.moeda === 'USD' ? 'US$' : '€';
    return `${fonte}: ${simbolo} ${c.precoOriginal.toFixed(2).replace('.', ',')} por unidade`;
  }

  cartasSemPreco(): number {
    return this.colecao.filter((c) => !this.temPreco(c)).length;
  }

  totalColecao(): number {
    return this.colecao.reduce((soma, c) => soma + c.valor * c.qtd, 0);
  }

  buscarCartas(contexto: Contexto): void {
    const termo = (contexto === 'colecao' ? this.novoNomeColecao : this.novoNomeBaralho).trim();

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    if (termo.length < 3 && !this.filtroTipo && !this.filtroExpansao) {
      if (contexto === 'colecao') this.mostrarDropdownColecao = false;
      else this.mostrarDropdownBaralho = false;
      return;
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        const params: string[] = [];
        if (termo) params.push(`name=${encodeURIComponent(termo)}`);
        if (this.filtroTipo && contexto === 'colecao') {
          if (this.filtroTipo.startsWith('trainer:')) {
            const trainerType = this.filtroTipo.slice('trainer:'.length);
            params.push('category=Trainer');
            params.push(`trainerType=${encodeURIComponent(trainerType)}`);
          } else {
            params.push(`types=${encodeURIComponent(this.filtroTipo)}`);
          }
        }
        if (this.filtroExpansao && contexto === 'colecao') params.push(`set=${encodeURIComponent(this.filtroExpansao)}`);

        // a base em português cobre poucos sets antigos: busca também em inglês e junta os resultados
        // (filtro de tipo de Pokémon usa o nome no idioma selecionado, então só vale para ele)
        const filtroTipoPokemon = !!this.filtroTipo && !this.filtroTipo.startsWith('trainer:') && contexto === 'colecao';
        const linguas = this.filtroLingua === 'en' || filtroTipoPokemon ? [this.filtroLingua] : [this.filtroLingua, 'en'];

        const respostas = await Promise.all(
          linguas.map(async (lingua) => {
            try {
              const resp = await fetch(`https://api.tcgdex.net/v2/${lingua}/cards?${params.join('&')}`);
              const dados = await resp.json();
              return Array.isArray(dados) ? (dados as CartaApi[]) : [];
            } catch {
              return [] as CartaApi[];
            }
          }),
        );

        // mesma carta nos dois idiomas: mantém o nome do idioma selecionado e a imagem que existir
        const porId = new Map<string, CartaApi>();
        for (const lista of respostas) {
          for (const c of lista) {
            const atual = porId.get(c.id);
            if (!atual) porId.set(c.id, c);
            else if (!atual.image && c.image) atual.image = c.image;
          }
        }
        const cards: CartaApi[] = [...porId.values()];

        cards.forEach((c) => {
          const idSet = c.set?.id ?? this.extrairSetId(c.id);
          const setInfo =
            this.setsCache.find((s) => s.id === idSet) ||
            this.setsCacheEn.find((s) => s.id === idSet) ||
            this.setsCache.find((s) => s.name === c.set?.name);
          c.releaseDate = setInfo?.releaseDate || '1990-01-01';
          c.setName = setInfo?.name || c.set?.name || idSet || 'Desconhecido';
        });
        cards.sort((a, b) => new Date(b.releaseDate!).getTime() - new Date(a.releaseDate!).getTime());

        // filtra cartas sem imagem, com exceção de energia básica (tem fallback)
        const comImagem: CartaApi[] = [];
        for (const c of cards) {
          if (c.image) {
            comImagem.push(c);
            continue;
          }
          if (this.pareceEnergiaBasica(c.name)) {
            const imagemEnergia = await this.resolverImagemEnergiaBasica(c.name);
            if (imagemEnergia) {
              c.image = imagemEnergia;
              comImagem.push(c);
            }
          }
        }

        const top = comImagem.slice(0, 100);
        if (contexto === 'colecao') {
          this.dropdownColecao = top;
          this.mostrarDropdownColecao = true;
        } else {
          this.dropdownBaralho = top;
          this.mostrarDropdownBaralho = true;
        }
      } catch (e) {
        console.warn('Busca falhou', e);
      } finally {
        this.cdr.markForCheck();
      }
    }, 400);
  }

  private pareceEnergiaBasica(nome: string): boolean {
    const n = nome.toLowerCase();
    return n.includes('energy') || n.includes('energia');
  }

  private async carregarSetEnergias(lingua: string): Promise<CartaApi[]> {
    if (this.cacheSetEnergias[lingua]) return this.cacheSetEnergias[lingua];
    try {
      const resp = await fetch(`https://api.tcgdex.net/v2/${lingua}/sets/${this.SET_ENERGIAS_ID}`);
      const set = await resp.json();
      const cartas: CartaApi[] = Array.isArray(set?.cards) ? set.cards : [];
      this.cacheSetEnergias[lingua] = cartas;
      return cartas;
    } catch (e) {
      console.warn('Não foi possível carregar as imagens de referência das energias', e);
      this.cacheSetEnergias[lingua] = [];
      return [];
    }
  }

  private async resolverImagemEnergiaBasica(nome: string): Promise<string | undefined> {
    const cartas = await this.carregarSetEnergias(this.filtroLingua);
    const alvo = nome.trim().toLowerCase();
    const achada = cartas.find((c) => c.name?.trim().toLowerCase() === alvo);
    return achada?.image;
  }

  imagemBaixa(c: CartaApi): string {
    return c.image ? `${c.image}/low.webp` : 'https://placehold.co/32x45?text=?';
  }

  aoFalharImagem(evento: Event, largura: number, altura: number): void {
    const img = evento.target as HTMLImageElement;
    const fallback = `https://placehold.co/${largura}x${altura}?text=?`;
    if (img.src !== fallback) img.src = fallback;
  }

  ehNovoGrupo(lista: CartaApi[], i: number): boolean {
    return i === 0 || lista[i].setName !== lista[i - 1].setName;
  }

  selecionarCarta(contexto: Contexto, c: CartaApi): void {
    const imagemAlta = c.image ? `${c.image}/high.webp` : '';
    if (contexto === 'colecao') {
      this.mostrarDropdownColecao = false;
      this.novoNomeColecao = '';

      const existente = this.colecao.find((item) => item.id === c.id);
      if (existente) {
        existente.qtd++;
      } else {
        this.colecao.push({
          id: c.id,
          nome: c.name,
          valor: 0,
          imagem: imagemAlta || 'https://placehold.co/130x180?text=?',
          qtd: 1,
        });
      }
      this.salvarDados();
      void this.atualizarPrecos();
    } else {
      this.novoNomeBaralho = '';
      this.mostrarDropdownBaralho = false;
      this.adicionarAoBaralho(c.id, c.name, imagemAlta);
    }
  }

  incrementarColecao(carta: Carta): void {
    carta.qtd++;
    this.salvarDados();
  }

  decrementarColecao(carta: Carta): void {
    carta.qtd--;
    if (carta.qtd <= 0) {
      const idx = this.colecao.indexOf(carta);
      if (idx > -1) this.colecao.splice(idx, 1);
    }
    this.salvarDados();
  }

  removerDaColecao(carta: Carta): void {
    const idx = this.colecao.indexOf(carta);
    if (idx > -1) this.colecao.splice(idx, 1);
    this.salvarDados();
  }

  get colecaoParaBaralho(): Carta[] {
    const termo = this.filtroColecaoBaralho.trim().toLowerCase();
    if (!termo) return this.colecao;
    return this.colecao.filter((c) => c.nome.toLowerCase().includes(termo));
  }

  toggleColecaoNoBaralho(): void {
    this.mostrarColecaoNoBaralho = !this.mostrarColecaoNoBaralho;
    if (!this.mostrarColecaoNoBaralho) this.filtroColecaoBaralho = '';
  }

  aoTrocarBaralho(): void {
    this.mostrarColecaoNoBaralho = false;
    this.filtroColecaoBaralho = '';
    this.linkCompartilhar = null;
    this.resultadoVerificacao = null;
    this.textoExportado = null;
    this.copiadoExport = false;
  }

  qtdNoBaralho(nome: string): number {
    if (this.baralhoAtivoIndex < 0 || !this.baralhos[this.baralhoAtivoIndex]) return 0;
    return this.baralhos[this.baralhoAtivoIndex].cartas
      .filter((c) => c.nome === nome)
      .reduce((soma, c) => soma + c.qtd, 0);
  }

  adicionarDaColecao(c: Carta): void {
    if (this.qtdNoBaralho(c.nome) >= this.qtdNaColecao(c.nome)) return;
    this.adicionarAoBaralho(c.id, c.nome, c.imagem);
  }

  criarBaralho(): void {
    const nome = this.nomeNovoBaralho.trim();
    if (!nome) return;
    this.baralhos.push({ nome, cartas: [] });
    this.nomeNovoBaralho = '';
    this.baralhoAtivoIndex = this.baralhos.length - 1;
    this.aoTrocarBaralho();
    this.salvarDados();
  }

  excluirBaralho(index: number): void {
    const baralho = this.baralhos[index];
    if (!baralho) return;

    if (!confirm(`Tem certeza que deseja excluir o baralho "${baralho.nome}"? Essa ação não pode ser desfeita.`)) return;

    this.baralhos.splice(index, 1);

    if (this.baralhoAtivoIndex === index) this.baralhoAtivoIndex = -1;
    else if (this.baralhoAtivoIndex > index) this.baralhoAtivoIndex--;

    this.aoTrocarBaralho();
    this.salvarDados();
  }

  private readonly BASE_ASSETS = 'https://assets.tcgdex.net/';

  private codificarBaralho(b: Baralho): string {
    const compacto = {
      n: b.nome,
      c: b.cartas.map((c) => ({
        i: c.id,
        m: c.nome,
        q: c.qtd,
        g: c.imagem.startsWith(this.BASE_ASSETS) ? c.imagem.slice(this.BASE_ASSETS.length) : c.imagem,
      })),
    };
    const json = JSON.stringify(compacto);
    return btoa(unescape(encodeURIComponent(json)));
  }

  private decodificarBaralho(codigo: string): Baralho | null {
    try {
      const json = decodeURIComponent(escape(atob(codigo)));
      const compacto = JSON.parse(json);
      if (!compacto?.n || !Array.isArray(compacto.c)) return null;
      return {
        nome: String(compacto.n),
        cartas: compacto.c.map((c: any) => ({
          id: String(c.i ?? ''),
          nome: String(c.m ?? ''),
          qtd: Number(c.q) || 1,
          imagem: c.g ? (String(c.g).startsWith('http') ? c.g : this.BASE_ASSETS + c.g) : 'https://placehold.co/130x180?text=?',
        })),
      };
    } catch {
      return null;
    }
  }

  private extrairCodigoDoTexto(texto: string): string {
    const marcador = 'baralho=';
    const idx = texto.indexOf(marcador);
    return idx >= 0 ? decodeURIComponent(texto.slice(idx + marcador.length)) : texto.trim();
  }

  private importarBaralhoDeCodigo(codigo: string): boolean {
    const baralho = this.decodificarBaralho(codigo.trim());
    if (!baralho || baralho.cartas.length === 0) {
      alert('Esse código de baralho não é válido.');
      return false;
    }
    if (!this.logado) {
      this.codigoBaralhoPendente = codigo;
      alert('Encontramos um baralho compartilhado! Entre na sua conta e volte a este link pra importar.');
      return false;
    }

    let nomeFinal = baralho.nome || 'Baralho compartilhado';
    if (this.baralhos.some((b) => b.nome === nomeFinal)) nomeFinal = `${nomeFinal} (importado)`;

    this.baralhos.push({ nome: nomeFinal, cartas: baralho.cartas });
    this.baralhoAtivoIndex = this.baralhos.length - 1;
    this.aoTrocarBaralho();
    this.aba.set('baralhos');
    this.salvarDados();
    this.codigoBaralhoPendente = null;
    this.cdr.markForCheck();
    alert(`Baralho "${nomeFinal}" importado com sucesso!`);
    return true;
  }

  importarPorTexto(): void {
    const texto = this.codigoImportar.trim();
    if (!texto) return;
    this.importarBaralhoDeCodigo(this.extrairCodigoDoTexto(texto));
    this.codigoImportar = '';
  }

  async compartilharBaralho(): Promise<void> {
    if (this.baralhoAtivoIndex < 0) return;
    const baralho = this.baralhos[this.baralhoAtivoIndex];
    const codigo = this.codificarBaralho(baralho);
    const link = `${location.origin}/colecao?baralho=${encodeURIComponent(codigo)}`;
    this.linkCompartilhar = link;

    try {
      await navigator.clipboard.writeText(link);
      alert('Link copiado para a área de transferência. Quem acessar verá este baralho exatamente como está neste momento.');
    } catch {
      prompt('Não foi possível copiar automaticamente. Copie o link abaixo para compartilhar o baralho:', link);
    }
  }

  fecharLinkCompartilhar(): void {
    this.linkCompartilhar = null;
  }

  adicionarAoBaralho(id: string, nome: string, imagem: string): void {
    if (this.baralhoAtivoIndex < 0) {
      alert('Selecione um baralho primeiro!');
      return;
    }
    const deck = this.baralhos[this.baralhoAtivoIndex].cartas;
    const totalCartas = deck.reduce((soma, c) => soma + c.qtd, 0);
    if (totalCartas >= 60) {
      alert('O baralho já tem 60 cartas!');
      return;
    }

    const isEnergiaBasica = this.pareceEnergiaBasica(nome);
    const existente = deck.find((c) => c.nome === nome);

    if (existente) {
      if (!isEnergiaBasica && existente.qtd >= 4) {
        alert('Só pode ter 4 cópias da mesma carta (exceto Energias Básicas)!');
        return;
      }
      existente.qtd++;
    } else {
      deck.push({ id, nome, imagem: imagem || 'https://placehold.co/130x180?text=?', qtd: 1 });
    }
    this.salvarDados();
  }

  incrementarNoBaralho(c: BaralhoCarta): void {
    this.adicionarAoBaralho(c.id, c.nome, c.imagem);
  }

  removerDoBaralho(nome: string): void {
    if (this.baralhoAtivoIndex < 0) return;
    const deck = this.baralhos[this.baralhoAtivoIndex].cartas;
    const idx = deck.findIndex((c) => c.nome === nome);
    if (idx > -1) {
      deck[idx].qtd--;
      if (deck[idx].qtd <= 0) deck.splice(idx, 1);
    }
    this.salvarDados();
  }

  totalCartasBaralho(): number {
    if (this.baralhoAtivoIndex < 0 || !this.baralhos[this.baralhoAtivoIndex]) return 0;
    return this.baralhos[this.baralhoAtivoIndex].cartas.reduce((soma, c) => soma + c.qtd, 0);
  }

  // ---------- Verificação de formato (Pokémon TCG, Standard) e exportação ----------

  /** busca (e guarda em cache) os dados da carta; null = não encontrada / sem rede */
  private async obterDetalhe(id: string, nomeFallback: string): Promise<DetalheCarta | null> {
    if (this.cacheDetalhes.has(id)) return this.cacheDetalhes.get(id)!;

    const buscar = async (lingua: string): Promise<any | null> => {
      try {
        const resp = await fetch(`https://api.tcgdex.net/v2/${lingua}/cards/${encodeURIComponent(id)}`);
        return resp.ok ? await resp.json() : null;
      } catch {
        return null;
      }
    };

    const [en, local] = await Promise.all([buscar('en'), buscar('pt')]);
    const base = en ?? local;
    if (!base) return null; // não guarda: tenta de novo na próxima verificação

    const categoriaApi = String(base.category ?? '');
    const categoria: DetalheCarta['categoria'] =
      categoriaApi === 'Pokemon' || categoriaApi === 'Pokémon' ? 'Pokemon'
      : categoriaApi === 'Trainer' ? 'Trainer'
      : categoriaApi === 'Energy' ? 'Energy'
      : 'Desconhecida';

    const nomeEn: string = base.name ?? nomeFallback;
    const energiaBasica = categoria === 'Energy' && (base.energyType === 'Normal' || /^basic .*energy$/i.test(nomeEn));
    const abreviacao: string | undefined = base.set?.abbreviation?.official ?? base.set?.abbreviation?.normal;
    const setCodigo = String(abreviacao ?? base.set?.id ?? this.extrairSetId(id)).toUpperCase();

    const detalhe: DetalheCarta = {
      nome: local?.name ?? base.name ?? nomeFallback,
      nomeEn,
      categoria,
      estagio: base.stage,
      evoluiDe: base.evolveFrom,
      raridade: base.rarity,
      energiaBasica,
      legalStandard: typeof base.legal?.standard === 'boolean' ? base.legal.standard : undefined,
      legalExpandido: typeof base.legal?.expanded === 'boolean' ? base.legal.expanded : undefined,
      marca: base.regulationMark,
      setCodigo,
      numero: String(base.localId ?? id.split('-').pop() ?? ''),
    };
    this.cacheDetalhes.set(id, detalhe);
    return detalhe;
  }

  private async carregarDetalhes(cartas: BaralhoCarta[]): Promise<Map<string, DetalheCarta | null>> {
    const mapa = new Map<string, DetalheCarta | null>();
    for (let i = 0; i < cartas.length; i += 5) {
      const lote = cartas.slice(i, i + 5);
      const res = await Promise.all(lote.map((c) => this.obterDetalhe(c.id, c.nome)));
      lote.forEach((c, k) => mapa.set(c.id, res[k]));
    }
    return mapa;
  }

  private ehPokemonBasico(d: DetalheCarta): boolean {
    return d.categoria === 'Pokemon' && /^basic$|^b[aá]sico$/i.test(d.estagio ?? '');
  }

  async verificarFormato(): Promise<void> {
    if (this.baralhoAtivoIndex < 0) return;
    const baralho = this.baralhos[this.baralhoAtivoIndex];
    this.textoExportado = null;
    this.verificando.set(true);
    this.resultadoVerificacao = null;
    this.cdr.markForCheck();

    try {
      const detalhes = await this.carregarDetalhes(baralho.cartas);
      this.resultadoVerificacao = this.validarBaralho(baralho, detalhes);
    } finally {
      this.verificando.set(false);
      this.cdr.markForCheck();
    }
  }

  private validarBaralho(baralho: Baralho, detalhes: Map<string, DetalheCarta | null>): ResultadoVerificacao {
    const problemas: ProblemaBaralho[] = [];
    const erro = (texto: string) => problemas.push({ tipo: 'erro', texto });
    const aviso = (texto: string) => problemas.push({ tipo: 'aviso', texto });

    const total = baralho.cartas.reduce((soma, c) => soma + c.qtd, 0);
    if (total !== 60) {
      erro(total < 60 ? `O baralho tem ${total} cartas: faltam ${60 - total} para chegar a 60.` : `O baralho tem ${total} cartas: remova ${total - 60} para chegar a 60.`);
    }

    // agrupa por nome em inglês (regra das 4 cópias vale pelo nome da carta, não pela impressão)
    const porNome = new Map<string, { nome: string; qtd: number; basica: boolean }>();
    const semDados: string[] = [];
    let temBasico = false;
    const nomesNoBaralho = new Set<string>();
    let aceSpec = 0;
    let radiante = 0;
    const naoLegais = new Set<string>();
    const semLegalidade = new Set<string>();

    for (const c of baralho.cartas) {
      const d = detalhes.get(c.id) ?? null;
      if (!d) {
        semDados.push(c.nome);
        const chave = c.nome.toLowerCase();
        const atual = porNome.get(chave);
        const basica = this.pareceEnergiaBasica(c.nome);
        if (atual) atual.qtd += c.qtd;
        else porNome.set(chave, { nome: c.nome, qtd: c.qtd, basica });
        continue;
      }

      const chave = d.nomeEn.toLowerCase();
      const atual = porNome.get(chave);
      if (atual) atual.qtd += c.qtd;
      else porNome.set(chave, { nome: c.nome, qtd: c.qtd, basica: d.energiaBasica });

      nomesNoBaralho.add(d.nomeEn.toLowerCase());
      if (this.ehPokemonBasico(d)) temBasico = true;

      const raridade = (d.raridade ?? '').toLowerCase();
      if (raridade.includes('ace spec')) aceSpec += c.qtd;
      if (raridade.includes('radiant') || (d.nomeEn.startsWith('Radiant ') && d.categoria === 'Pokemon')) radiante += c.qtd;

      let legal = this.formatoBaralho === 'standard' ? d.legalStandard : this.formatoBaralho === 'expandido' ? d.legalExpandido : undefined;
      // reserva: a API não informou a legalidade. No Standard, carta sem marca de regulação
      // (e que não seja Energia Básica) é das eras antigas, portanto fora do formato.
      if (legal === undefined && this.formatoBaralho === 'standard' && !d.marca && !d.energiaBasica) legal = false;
      if (legal === undefined && this.formatoBaralho !== 'livre') semLegalidade.add(c.nome);
      if (legal === false) {
        naoLegais.add(`${c.nome}${d.marca ? ` (marca ${d.marca})` : ''}`);
      }
    }

    // 4 cópias por nome (exceto Energia Básica)
    for (const item of porNome.values()) {
      if (!item.basica && item.qtd > 4) erro(`"${item.nome}" aparece ${item.qtd}x: o máximo é 4 cópias por nome (só Energia Básica é ilimitada).`);
    }

    if (semDados.length === 0 && !temBasico && baralho.cartas.length > 0) {
      erro('O baralho precisa ter pelo menos 1 Pokémon Básico.');
    }
    if (aceSpec > 1) erro(`O baralho tem ${aceSpec} cartas ACE SPEC: só é permitida 1.`);
    if (radiante > 1) erro(`O baralho tem ${radiante} cartas Pokémon Radiante: só é permitida 1.`);

    if (naoLegais.size > 0) {
      erro(`Cartas fora do formato ${this.formatoBaralho === 'standard' ? 'Standard' : 'Expandido'}: ${[...naoLegais].join(', ')}.`);
    }

    if (semLegalidade.size > 0) {
      aviso(`A API não informou a legalidade de: ${[...semLegalidade].join(', ')}. Confira essas cartas manualmente.`);
    }

    // evoluções sem a pré-evolução no baralho (aviso: pode ser uma carta que evolui por outra regra)
    const semPre = new Set<string>();
    for (const c of baralho.cartas) {
      const d = detalhes.get(c.id);
      if (d && d.categoria === 'Pokemon' && d.evoluiDe && !nomesNoBaralho.has(d.evoluiDe.toLowerCase())) {
        semPre.add(`${c.nome} (evolui de ${d.evoluiDe})`);
      }
    }
    if (semPre.size > 0) aviso(`Evoluções sem a pré-evolução no baralho: ${[...semPre].join(', ')}.`);

    if (semDados.length > 0) {
      aviso(`Não foi possível consultar ${semDados.length} carta(s) (${[...new Set(semDados)].join(', ')}): a checagem de Pokémon Básico, ACE SPEC, Radiante e legalidade ficou incompleta. Verifique a conexão e tente de novo.`);
    }

    return { valido: !problemas.some((p) => p.tipo === 'erro'), total, problemas };
  }

  fecharVerificacao(): void {
    this.resultadoVerificacao = null;
  }

  /** gera o texto no formato de importação do Pokémon TCG Live */
  async exportarTexto(): Promise<void> {
    if (this.baralhoAtivoIndex < 0) return;
    const baralho = this.baralhos[this.baralhoAtivoIndex];
    this.resultadoVerificacao = null;
    this.copiadoExport = false;
    this.exportando.set(true);
    this.cdr.markForCheck();

    try {
      const detalhes = await this.carregarDetalhes(baralho.cartas);
      const grupos: Record<'Pokemon' | 'Trainer' | 'Energy', string[]> = { Pokemon: [], Trainer: [], Energy: [] };
      const totais = { Pokemon: 0, Trainer: 0, Energy: 0 };

      for (const c of baralho.cartas) {
        const d = detalhes.get(c.id) ?? null;
        let cat: 'Pokemon' | 'Trainer' | 'Energy';
        let linha: string;
        if (d) {
          cat = d.categoria === 'Desconhecida' ? 'Trainer' : d.categoria;
          linha = `${c.qtd} ${d.nomeEn} ${d.setCodigo} ${d.numero}`;
        } else {
          // sem dados da API: exporta só o que se sabe, pelo id (ex.: sv01-057)
          cat = this.pareceEnergiaBasica(c.nome) ? 'Energy' : 'Trainer';
          const partes = c.id.split('-');
          const num = partes.pop() ?? '';
          linha = `${c.qtd} ${c.nome} ${partes.join('-').toUpperCase()} ${num}`.trim();
        }
        grupos[cat].push(linha);
        totais[cat] += c.qtd;
      }

      const bloco = (titulo: string, cat: 'Pokemon' | 'Trainer' | 'Energy') =>
        grupos[cat].length ? [`${titulo}: ${totais[cat]}`, ...grupos[cat], ''] : [];

      const total = totais.Pokemon + totais.Trainer + totais.Energy;
      this.textoExportado = [
        ...bloco('Pokémon', 'Pokemon'),
        ...bloco('Trainer', 'Trainer'),
        ...bloco('Energy', 'Energy'),
        `Total Cards: ${total}`,
      ].join('\n');
    } finally {
      this.exportando.set(false);
      this.cdr.markForCheck();
    }
  }

  async copiarTextoExportado(): Promise<void> {
    if (!this.textoExportado) return;
    try {
      await navigator.clipboard.writeText(this.textoExportado);
      this.copiadoExport = true;
      setTimeout(() => {
        this.copiadoExport = false;
        this.cdr.markForCheck();
      }, 2000);
    } catch {
      prompt('Não foi possível copiar automaticamente. Copie o texto abaixo:', this.textoExportado);
    }
    this.cdr.markForCheck();
  }

  baixarTextoExportado(): void {
    if (!this.textoExportado || this.baralhoAtivoIndex < 0) return;
    const nome = this.baralhos[this.baralhoAtivoIndex].nome.replace(/[^\w\-]+/g, '_') || 'baralho';
    const url = URL.createObjectURL(new Blob([this.textoExportado], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nome}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  fecharExportacao(): void {
    this.textoExportado = null;
  }

  qtdNaColecao(nome: string): number {
    return this.colecao.filter((c) => c.nome === nome).reduce((soma, c) => soma + c.qtd, 0);
  }

  faltamNaColecao(c: BaralhoCarta): number {
    return c.qtd - this.qtdNaColecao(c.nome);
  }
}

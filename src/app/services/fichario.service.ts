import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import {
  CartaColecao,
  CartaEscolhida,
  CartaNoEspaco,
  Faltante,
  Fichario,
  COLUNAS_MAX,
  LINHAS_MAX,
  NOME_MAX,
  PAGINAS_MAX,
  chaveEspaco,
  corAleatoria,
  ehCorValida,
  espacosFaltando,
  espacosPorPagina,
  faltantesDoFichario,
  limitar,
  sanitizar,
  totalLados,
} from './fichario.logic';

export interface NovoFichario {
  nome: string;
  capa: string | null;
  /** null = sortear uma cor */
  cor: string | null;
  linhas: number;
  colunas: number;
  paginas: number;
}

export interface EdicaoFichario {
  nome: string;
  capa: string | null;
  cor: string | null;
}

export type ResultadoColocar = 'ok' | 'invalido';

/** Fichários do usuário logado, guardados no navegador junto com a coleção dele. */
@Injectable({ providedIn: 'root' })
export class FichariosService {
  private readonly auth = inject(AuthService);
  private emailCarregado: string | null | undefined;

  readonly fichas = signal<Fichario[]>([]);
  /** cópia da coleção lida do armazenamento; atualize com `atualizarColecao()` ao abrir a tela */
  readonly colecao = signal<CartaColecao[]>([]);
  /** true quando o navegador recusou salvar (normalmente falta de espaço) */
  readonly erroAoSalvar = signal(false);

  /** espaços cuja carta a coleção não cobre (veja `espacosFaltando`) */
  readonly faltando = computed(() => espacosFaltando(this.fichas(), this.colecao()));

  constructor() {
    this.carregar(this.auth.currentEmail());
    effect(() => {
      const email = this.auth.currentEmail();
      untracked(() => {
        if (email !== this.emailCarregado) this.carregar(email);
      });
    });
  }

  ficha(id: string | null): Fichario | null {
    return this.fichas().find((f) => f.id === id) ?? null;
  }

  faltantesDe(fichaId: string | null): Faltante[] {
    return fichaId ? faltantesDoFichario(this.fichas(), this.colecao(), fichaId) : [];
  }

  criar(dados: NovoFichario): Fichario | null {
    const nome = dados.nome.trim().slice(0, NOME_MAX);
    if (!nome || !this.chave()) return null;
    const ficha: Fichario = {
      id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      nome,
      capa: dados.capa,
      cor: ehCorValida(dados.cor) ? dados.cor : corAleatoria(),
      linhas: limitar(dados.linhas, 1, LINHAS_MAX),
      colunas: limitar(dados.colunas, 1, COLUNAS_MAX),
      paginas: limitar(dados.paginas, 1, PAGINAS_MAX),
      espacos: {},
    };
    this.gravar([...this.fichas(), ficha]);
    return ficha;
  }

  /** muda nome, foto e cor; tamanho e páginas não mudam porque as cartas estão nos espaços */
  editar(id: string, dados: EdicaoFichario): boolean {
    const nome = dados.nome.trim().slice(0, NOME_MAX);
    if (!nome || !this.ficha(id)) return false;
    this.atualizarFicha(id, (f) => ({
      ...f,
      nome,
      capa: dados.capa,
      cor: ehCorValida(dados.cor) ? dados.cor : f.cor,
    }));
    return true;
  }

  excluir(id: string): void {
    this.gravar(this.fichas().filter((f) => f.id !== id));
  }

  adicionarPagina(id: string): boolean {
    const ficha = this.ficha(id);
    if (!ficha || ficha.paginas >= PAGINAS_MAX) return false;
    this.gravar(this.fichas().map((f) => (f.id === id ? { ...f, paginas: f.paginas + 1 } : f)));
    return true;
  }

  /**
   * Coloca a carta no espaço. Não precisa estar na coleção: o que passar do que você tem
   * fica marcado como "falta" (`faltando`) e pode ser adicionado à coleção depois.
   */
  colocarCarta(fichaId: string, lado: number, indice: number, carta: CartaEscolhida): ResultadoColocar {
    const ficha = this.ficha(fichaId);
    if (!ficha) return 'invalido';
    if (lado < 0 || lado >= totalLados(ficha) || indice < 0 || indice >= espacosPorPagina(ficha)) return 'invalido';
    if (!carta.id || !carta.nome) return 'invalido';

    const nova: CartaNoEspaco = {
      id: carta.id,
      nome: carta.nome,
      imagem: carta.imagem,
      condicao: carta.condicao || 'NM',
    };
    this.atualizarFicha(fichaId, (f) => ({ ...f, espacos: { ...f.espacos, [chaveEspaco(lado, indice)]: nova } }));
    return 'ok';
  }

  removerCarta(fichaId: string, lado: number, indice: number): void {
    this.atualizarFicha(fichaId, (f) => {
      const espacos = { ...f.espacos };
      delete espacos[chaveEspaco(lado, indice)];
      return { ...f, espacos };
    });
  }

  /** soma as cartas à coleção da conta (mesma chave que a página Coleção usa); os preços são buscados lá */
  adicionarNaColecao(itens: { id: string; nome: string; imagem: string; condicao: string; qtd: number }[]): boolean {
    const email = this.auth.currentEmail();
    const validos = itens.filter((i) => i.id && i.nome && i.qtd > 0);
    if (!email || validos.length === 0) return false;

    const chave = 'cardvault_colecao_' + email;
    let lista: Record<string, unknown>[] = [];
    try {
      const bruto: unknown = JSON.parse(localStorage.getItem(chave) || '[]');
      if (Array.isArray(bruto)) lista = bruto.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object');
    } catch {
      lista = [];
    }

    for (const item of validos) {
      const condicao = item.condicao || 'NM';
      const existente = lista.find((c) => c['id'] === item.id && ((c['condicao'] as string) || 'NM') === condicao);
      if (existente) {
        existente['qtd'] = (Number(existente['qtd']) || 1) + item.qtd;
      } else {
        lista.push({
          id: item.id,
          nome: item.nome,
          valor: 0,
          imagem: item.imagem || 'https://placehold.co/130x180?text=?',
          qtd: item.qtd,
          condicao,
        });
      }
    }

    try {
      localStorage.setItem(chave, JSON.stringify(lista));
    } catch {
      this.erroAoSalvar.set(true);
      return false;
    }
    this.atualizarColecao();
    return true;
  }

  /** adiciona à coleção tudo o que falta para cobrir o fichário */
  adicionarFaltantesNaColecao(fichaId: string): boolean {
    const faltantes = this.faltantesDe(fichaId);
    return this.adicionarNaColecao(faltantes.map((f) => ({ ...f, qtd: f.faltam })));
  }

  atualizarColecao(): void {
    const email = this.auth.currentEmail();
    if (!email) {
      this.colecao.set([]);
      return;
    }
    try {
      const bruto: unknown = JSON.parse(localStorage.getItem('cardvault_colecao_' + email) || '[]');
      const lista = Array.isArray(bruto) ? bruto : [];
      this.colecao.set(
        lista
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
          .filter((c) => typeof c['id'] === 'string' && typeof c['nome'] === 'string')
          .map((c) => ({
            id: c['id'] as string,
            nome: c['nome'] as string,
            imagem: typeof c['imagem'] === 'string' ? c['imagem'] : '',
            qtd: Math.max(1, Number(c['qtd']) || 1),
            condicao: typeof c['condicao'] === 'string' ? c['condicao'] : 'NM',
          })),
      );
    } catch {
      this.colecao.set([]);
    }
  }

  private atualizarFicha(id: string, alterar: (f: Fichario) => Fichario): void {
    this.gravar(this.fichas().map((f) => (f.id === id ? alterar(f) : f)));
  }

  private chave(): string | null {
    const email = this.auth.currentEmail();
    return email ? 'cardvault_fichario_' + email : null;
  }

  private carregar(email: string | null): void {
    this.emailCarregado = email;
    this.erroAoSalvar.set(false);
    this.atualizarColecao();
    const chave = this.chave();
    if (!chave) {
      this.fichas.set([]);
      return;
    }
    try {
      this.fichas.set(sanitizar(JSON.parse(localStorage.getItem(chave) || '[]')));
    } catch {
      this.fichas.set([]);
    }
  }

  private gravar(proximas: Fichario[]): void {
    this.fichas.set(proximas);
    const chave = this.chave();
    if (!chave) return;
    try {
      localStorage.setItem(chave, JSON.stringify(proximas));
      this.erroAoSalvar.set(false);
    } catch {
      this.erroAoSalvar.set(true);
    }
  }
}

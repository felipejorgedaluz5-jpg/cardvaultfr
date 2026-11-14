import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import {
  CartaColecao,
  CartaNoEspaco,
  Fichario,
  COLUNAS_MAX,
  LINHAS_MAX,
  NOME_MAX,
  PAGINAS_MAX,
  chaveCarta,
  chaveEspaco,
  contarUsadas,
  espacosPorPagina,
  limitar,
  sanitizar,
} from './fichario.logic';

export interface NovoFichario {
  nome: string;
  capa: string | null;
  linhas: number;
  colunas: number;
  paginas: number;
}

export type ResultadoColocar = 'ok' | 'sem-copias' | 'invalido';

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

  criar(dados: NovoFichario): Fichario | null {
    const nome = dados.nome.trim().slice(0, NOME_MAX);
    if (!nome || !this.chave()) return null;
    const ficha: Fichario = {
      id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      nome,
      capa: dados.capa,
      linhas: limitar(dados.linhas, 1, LINHAS_MAX),
      colunas: limitar(dados.colunas, 1, COLUNAS_MAX),
      paginas: limitar(dados.paginas, 1, PAGINAS_MAX),
      espacos: {},
    };
    this.gravar([...this.fichas(), ficha]);
    return ficha;
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

  /** coloca uma cópia da carta no espaço, respeitando quantas cópias a coleção realmente tem */
  colocarCarta(fichaId: string, pagina: number, indice: number, carta: CartaColecao): ResultadoColocar {
    const ficha = this.ficha(fichaId);
    if (!ficha) return 'invalido';
    if (pagina < 0 || pagina >= ficha.paginas || indice < 0 || indice >= espacosPorPagina(ficha)) return 'invalido';

    this.atualizarColecao();
    const condicao = carta.condicao || 'NM';
    const naColecao = this.colecao().find((c) => chaveCarta(c.id, c.condicao) === chaveCarta(carta.id, condicao));
    if (!naColecao) return 'sem-copias';

    const chave = chaveEspaco(pagina, indice);
    const atual = ficha.espacos[chave];
    let usadas = contarUsadas(this.fichas()).get(chaveCarta(carta.id, condicao)) ?? 0;
    if (atual && chaveCarta(atual.id, atual.condicao) === chaveCarta(carta.id, condicao)) usadas--;
    if (usadas >= naColecao.qtd) return 'sem-copias';

    const nova: CartaNoEspaco = { id: naColecao.id, nome: naColecao.nome, imagem: naColecao.imagem, condicao };
    this.atualizarFicha(fichaId, (f) => ({ ...f, espacos: { ...f.espacos, [chave]: nova } }));
    return 'ok';
  }

  removerCarta(fichaId: string, pagina: number, indice: number): void {
    this.atualizarFicha(fichaId, (f) => {
      const espacos = { ...f.espacos };
      delete espacos[chaveEspaco(pagina, indice)];
      return { ...f, espacos };
    });
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

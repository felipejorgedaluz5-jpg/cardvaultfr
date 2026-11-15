import { Injectable } from '@angular/core';

export interface CartaBusca {
  id: string;
  nome: string;
  /** miniatura para a lista de resultados */
  imagemBaixa: string;
  /** imagem grande, a mesma que a coleção guarda */
  imagemAlta: string;
}

interface CartaApiResumo {
  id: string;
  name: string;
  image?: string;
}

const LIMITE_RESULTADOS = 60;

/** Busca de cartas por nome na TCGdex (português e inglês), para escolher cartas que ainda não estão na coleção. */
@Injectable({ providedIn: 'root' })
export class CartasApiService {
  /**
   * Cartas com esse nome, sem repetir ids; português primeiro, inglês completa.
   * Só entram cartas com imagem. Falha só quando nenhum dos dois idiomas respondeu.
   */
  async buscarPorNome(termo: string): Promise<CartaBusca[]> {
    const nome = termo.trim();
    if (nome.length < 3) return [];

    const respostas = await Promise.all(
      ['pt', 'en'].map(async (lingua) => {
        try {
          const resp = await fetch(`https://api.tcgdex.net/v2/${lingua}/cards?name=${encodeURIComponent(nome)}`);
          if (!resp.ok) return null;
          const dados: unknown = await resp.json();
          return Array.isArray(dados) ? (dados as CartaApiResumo[]) : [];
        } catch {
          return null;
        }
      }),
    );
    if (respostas.every((r) => r === null)) throw new Error('A busca de cartas não respondeu.');

    const porId = new Map<string, CartaBusca>();
    for (const lista of respostas) {
      for (const c of lista ?? []) {
        if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !c.image) continue;
        if (!porId.has(c.id)) {
          porId.set(c.id, {
            id: c.id,
            nome: c.name,
            imagemBaixa: `${c.image}/low.webp`,
            imagemAlta: `${c.image}/high.webp`,
          });
        }
      }
    }
    return [...porId.values()].slice(0, LIMITE_RESULTADOS);
  }
}

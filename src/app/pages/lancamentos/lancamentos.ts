import { Component, ElementRef, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ImageLightbox } from '../../shared/image-lightbox/image-lightbox';

interface ItemPreco {
  carta: string;
  loja: string;
  preco: number;
}

interface CartaApi {
  id: string;
  name: string;
  image?: string;
}

interface InfoCarta {
  imagem: string;
  setId: string;
  setName: string;
}

@Component({
  selector: 'app-lancamentos',
  imports: [CommonModule, FormsModule, ImageLightbox],
  templateUrl: './lancamentos.html',
  styleUrl: './lancamentos.css',
})
export class Lancamentos implements OnInit {
  @ViewChild('carouselEl') carouselEl?: ElementRef<HTMLDivElement>;

  termo = '';
  filtroExpansao = '';

  imagemExpandida: { url: string; alt: string } | null = null;

  abrirImagem(url: string, alt: string): void {
    if (!url) return;
    this.imagemExpandida = { url, alt };
  }

  fecharImagem(): void {
    this.imagemExpandida = null;
  }

  expansoes = signal<any[]>([]);
  cartasPopulares = signal<CartaApi[]>([]);
  carregandoPopulares = signal(true);
  private infoPorNome = signal(new Map<string, InfoCarta>());

  dadosPrecos: ItemPreco[] = [
    { carta: 'Charizard ex', loja: 'Liga X', preco: 189.9 },
    { carta: 'Charizard ex', loja: 'Card Games', preco: 174.5 },
    { carta: 'Charizard ex', loja: 'Mercado Livre', preco: 165.0 },
    { carta: 'Pikachu VMAX', loja: 'Liga X', preco: 89.9 },
    { carta: 'Pikachu VMAX', loja: 'Card Games', preco: 94.0 },
    { carta: 'Mewtwo GX', loja: 'Mercado Livre', preco: 42.0 },
    { carta: 'Mewtwo GX', loja: 'Liga X', preco: 45.9 },
    { carta: 'Umbreon VMAX Alt Art', loja: 'Card Games', preco: 1290.0 },
    { carta: 'Umbreon VMAX Alt Art', loja: 'Mercado Livre', preco: 1150.0 },
    { carta: 'Rayquaza VMAX', loja: 'Liga X', preco: 210.0 },
  ];

  async ngOnInit(): Promise<void> {
    await this.carregarExpansoes();
    this.carregarImagensDosPrecos();
    this.carregarCartasPopulares();
  }

  private async carregarExpansoes(): Promise<void> {
    try {
      const resp = await fetch('https://api.tcgdex.net/v2/pt/sets');
      const sets = await resp.json();
      this.expansoes.set([...sets].reverse());
    } catch (e) {
      console.error('Erro ao carregar expansões:', e);
    }
  }

  private async carregarImagensDosPrecos(): Promise<void> {
    const nomes = [...new Set(this.dadosPrecos.map((i) => i.carta))];
    await Promise.all(nomes.map((nome) => this.buscarInfoCarta(nome)));
  }

  private async buscarInfoCarta(nome: string): Promise<void> {
    try {
      const resp = await fetch(`https://api.tcgdex.net/v2/pt/cards?name=${encodeURIComponent(nome)}`);
      const cards: CartaApi[] = await resp.json();
      if (!Array.isArray(cards) || cards.length === 0) return;

      const carta = cards[0];
      const detalheResp = await fetch(`https://api.tcgdex.net/v2/pt/cards/${carta.id}`);
      const detalhe = await detalheResp.json();

      const novoMapa = new Map(this.infoPorNome());
      novoMapa.set(nome, {
        imagem: carta.image ? `${carta.image}/low.webp` : '',
        setId: detalhe?.set?.id || '',
        setName: detalhe?.set?.name || '',
      });
      this.infoPorNome.set(novoMapa);
    } catch (e) {
      console.warn('Não achei imagem/expansão para', nome, e);
    }
  }

  private async carregarCartasPopulares(): Promise<void> {
    this.carregandoPopulares.set(true);
    try {
      const expansoes = this.expansoes();
      if (expansoes.length === 0) return;
      const maisRecente = expansoes[0];
      const resp = await fetch(`https://api.tcgdex.net/v2/pt/sets/${maisRecente.id}`);
      const setCompleto = await resp.json();
      this.cartasPopulares.set((setCompleto.cards || []).slice(0, 14));
    } catch (e) {
      console.error('Erro ao carregar cartas populares:', e);
    } finally {
      this.carregandoPopulares.set(false);
    }
  }

  imagemItem(item: ItemPreco): string {
    return this.infoPorNome().get(item.carta)?.imagem || 'https://placehold.co/60x84?text=?';
  }

  imagemAltaItem(item: ItemPreco): string {
    return this.imagemItem(item).replace('/low.webp', '/high.webp');
  }

  imagemAlta(c: CartaApi): string {
    return c.image ? `${c.image}/high.webp` : 'https://placehold.co/130x180?text=?';
  }

  aoFalharImagem(evento: Event, largura: number, altura: number): void {
    const img = evento.target as HTMLImageElement;
    const fallback = `https://placehold.co/${largura}x${altura}?text=?`;
    if (img.src !== fallback) img.src = fallback;
  }

  scrollCarousel(direcao: number): void {
    this.carouselEl?.nativeElement.scrollBy({ left: direcao * 240, behavior: 'smooth' });
  }

  get filtrados(): ItemPreco[] {
    const termo = this.termo.toLowerCase();
    const infoPorNome = this.infoPorNome();
    return this.dadosPrecos.filter((i) => {
      const bateNome = i.carta.toLowerCase().includes(termo);
      if (!bateNome) return false;
      if (!this.filtroExpansao) return true;
      return infoPorNome.get(i.carta)?.setId === this.filtroExpansao;
    });
  }
}

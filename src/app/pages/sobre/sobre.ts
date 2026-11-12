import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface Valor {
  titulo: string;
  descricao: string;
}

@Component({
  selector: 'app-sobre',
  imports: [CommonModule, RouterLink],
  templateUrl: './sobre.html',
  styleUrl: './sobre.css',
})
export class Sobre {
  valores: Valor[] = [
    {
      titulo: 'Simplicidade antes de tudo',
      descricao:
        'Cada tela existe pra resolver um problema real de quem coleciona — sem recurso extra só pra parecer completo.',
    },
    {
      titulo: 'Seus dados, suas regras',
      descricao:
        'Você decide o que compartilha, pode baixar uma cópia do que guardamos e apagar tudo quando quiser.',
    },
    {
      titulo: 'Feito por quem coleciona',
      descricao:
        'Cada funcionalidade nasceu de uma dor real: organizar cartas, comparar preço e fechar um baralho.',
    },
    {
      titulo: 'Transparência sobre segurança',
      descricao:
        'Explicamos exatamente onde seus dados ficam e o que ainda falta amadurecer nesta fase do projeto.',
    },
  ];

  stack: string[] = ['Angular', 'TypeScript', 'RxJS', 'CSS puro', 'Armazenamento local no navegador'];
}

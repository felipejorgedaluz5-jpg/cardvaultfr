import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface SecaoPolitica {
  id: string;
  titulo: string;
}

@Component({
  selector: 'app-privacidade',
  imports: [CommonModule, RouterLink],
  templateUrl: './privacidade.html',
  styleUrl: './privacidade.css',
})
export class Privacidade {
  secoes: SecaoPolitica[] = [
    { id: 'coleta', titulo: 'Quais dados coletamos' },
    { id: 'uso', titulo: 'Para que usamos esses dados' },
    { id: 'armazenamento', titulo: 'Onde seus dados ficam guardados' },
    { id: 'direitos', titulo: 'Seus direitos sobre os dados' },
    { id: 'terceiros', titulo: 'Compartilhamento com terceiros' },
    { id: 'seguranca', titulo: 'Medidas de segurança' },
    { id: 'alteracoes', titulo: 'Alterações nesta política' },
    { id: 'contato', titulo: 'Contato' },
  ];
}

import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-lightbox',
  imports: [CommonModule],
  templateUrl: './image-lightbox.html',
  styleUrl: './image-lightbox.css',
})
export class ImageLightbox {
  @Input({ required: true }) url!: string;
  @Input() alt = '';
  @Output() fechar = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  aoPressionarEsc(): void {
    this.fechar.emit();
  }
}

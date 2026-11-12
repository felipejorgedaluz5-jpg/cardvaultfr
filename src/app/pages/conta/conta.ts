import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-conta',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './conta.html',
  styleUrl: './conta.css',
})
export class Conta {
  modo = signal<'login' | 'cadastro'>('login');

  loginEmail = '';
  loginSenha = '';
  loginErro = '';

  cadNome = '';
  cadEmail = '';
  cadSenha = '';
  cadSenha2 = '';
  consentimento = false;
  cadastroErro = '';

  constructor(public auth: AuthService, private router: Router) {}

  mostrarCadastro(): void { this.modo.set('cadastro'); }
  mostrarLogin(): void { this.modo.set('login'); }

  async fazerLogin(): Promise<void> {
    this.loginErro = '';
    const erro = await this.auth.login(this.loginEmail, this.loginSenha);
    if (erro) { this.loginErro = erro; return; }
    this.loginEmail = '';
    this.loginSenha = '';
    this.router.navigate(['/colecao']);
  }

  async fazerCadastro(): Promise<void> {
    this.cadastroErro = '';
    const erro = await this.auth.cadastrar(this.cadNome, this.cadEmail, this.cadSenha, this.cadSenha2, this.consentimento);
    if (erro) { this.cadastroErro = erro; return; }
    this.cadNome = '';
    this.cadEmail = '';
    this.cadSenha = '';
    this.cadSenha2 = '';
    this.consentimento = false;
  }

  sair(): void {
    this.auth.sair();
    this.modo.set('login');
  }

  excluirConta(): void {
    if (this.auth.usuarioAtualEmail() === 'devtest') {
      alert('A conta de teste não pode ser excluída.');
      return;
    }
    if (!confirm('Isso vai apagar sua conta e toda a sua coleção permanentemente. Continuar?')) return;
    this.auth.excluirConta();
    this.modo.set('login');
  }

  baixarMeusDados(): void {
    const email = this.auth.usuarioAtualEmail();
    if (!email) return;

    let pacote: Record<string, unknown> = {};
    if (email === 'devtest') {
      pacote = {
        nome: 'Desenvolvedor',
        email: 'devtest',
        colecao: JSON.parse(localStorage.getItem('cardvault_colecao_devtest') || '[]'),
        baralhos: JSON.parse(localStorage.getItem('cardvault_baralhos_devtest') || '[]'),
      };
    } else {
      const usuario = this.auth.carregarUsuarios().find((u) => u.email === email);
      pacote = {
        nome: usuario?.nome,
        email: usuario?.email,
        consentimentoRegistradoEm: usuario?.consentimentoEm,
        colecao: JSON.parse(localStorage.getItem('cardvault_colecao_' + email) || '[]'),
        baralhos: JSON.parse(localStorage.getItem('cardvault_baralhos_' + email) || '[]'),
      };
    }

    const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meus-dados-cardvault.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  qtdCartas(): number {
    const email = this.auth.usuarioAtualEmail();
    if (!email) return 0;
    return JSON.parse(localStorage.getItem('cardvault_colecao_' + email) || '[]').length;
  }
}

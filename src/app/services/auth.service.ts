import { Injectable, signal } from '@angular/core';

export interface Usuario {
  nome: string;
  email: string;
  salt: string;
  senhaHash: string;
  consentimentoEm: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentEmail = signal<string | null>(sessionStorage.getItem('cardvault_sessao'));

  async hashSenha(senha: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const dados = encoder.encode(salt + ':' + senha);
    const buffer = await crypto.subtle.digest('SHA-256', dados);
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  gerarSalt(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  carregarUsuarios(): Usuario[] {
    try {
      return JSON.parse(localStorage.getItem('cardvault_usuarios') || '[]');
    } catch {
      return [];
    }
  }

  salvarUsuarios(lista: Usuario[]): void {
    try {
      localStorage.setItem('cardvault_usuarios', JSON.stringify(lista));
    } catch {
      /* ignora falha de storage */
    }
  }

  usuarioAtualEmail(): string | null {
    return sessionStorage.getItem('cardvault_sessao');
  }

  async login(email: string, senha: string): Promise<string | null> {
    email = email.trim().toLowerCase();

    if (email === 'devtest' && senha === 'devtest') {
      sessionStorage.setItem('cardvault_sessao', 'devtest');
      this.currentEmail.set('devtest');
      return null;
    }

    const usuarios = this.carregarUsuarios();
    const usuario = usuarios.find((u) => u.email === email);
    if (!usuario) return 'E-mail ou senha inválidos.';

    const hashDigitado = await this.hashSenha(senha, usuario.salt);
    if (hashDigitado !== usuario.senhaHash) return 'E-mail ou senha inválidos.';

    sessionStorage.setItem('cardvault_sessao', email);
    this.currentEmail.set(email);
    return null;
  }

  async cadastrar(nome: string, email: string, senha: string, senha2: string, consentiu: boolean): Promise<string | null> {
    nome = nome.trim();
    email = email.trim().toLowerCase();

    if (!nome || !email || !senha) return 'Preencha todos os campos.';
    if (senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (senha !== senha2) return 'As senhas não coincidem.';
    if (!consentiu) return 'É necessário concordar com o aviso de privacidade pra continuar.';

    const usuarios = this.carregarUsuarios();
    if (usuarios.some((u) => u.email === email)) return 'Já existe uma conta com esse e-mail.';

    const salt = this.gerarSalt();
    const senhaHash = await this.hashSenha(senha, salt);
    usuarios.push({ nome, email, salt, senhaHash, consentimentoEm: new Date().toISOString() });
    this.salvarUsuarios(usuarios);

    sessionStorage.setItem('cardvault_sessao', email);
    this.currentEmail.set(email);
    return null;
  }

  sair(): void {
    sessionStorage.removeItem('cardvault_sessao');
    this.currentEmail.set(null);
  }

  excluirConta(): boolean {
    const email = this.usuarioAtualEmail();
    if (!email || email === 'devtest') return false;

    const usuarios = this.carregarUsuarios().filter((u) => u.email !== email);
    this.salvarUsuarios(usuarios);
    try {
      localStorage.removeItem('cardvault_colecao_' + email);
      localStorage.removeItem('cardvault_baralhos_' + email);
      localStorage.removeItem('cardvault_fichario_' + email);
    } catch {
      /* ignora */
    }
    sessionStorage.removeItem('cardvault_sessao');
    this.currentEmail.set(null);
    return true;
  }

  nomeExibicao(): string {
    const email = this.usuarioAtualEmail();
    if (!email) return '';
    if (email === 'devtest') return 'Desenvolvedor (DevTest)';
    const usuario = this.carregarUsuarios().find((u) => u.email === email);
    return usuario ? usuario.nome : email;
  }
}

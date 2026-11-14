import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Lancamentos } from './pages/lancamentos/lancamentos';
import { Colecao } from './pages/colecao/colecao';
import { Ficharios } from './pages/ficharios/ficharios';
import { Torneio } from './pages/torneio/torneio';
import { Conta } from './pages/conta/conta';
import { Sobre } from './pages/sobre/sobre';
import { Privacidade } from './pages/privacidade/privacidade';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'lancamentos', component: Lancamentos },
  { path: 'colecao', component: Colecao },
  { path: 'ficharios', component: Ficharios },
  { path: 'torneio', component: Torneio },
  { path: 'conta', component: Conta },
  { path: 'sobre', component: Sobre },
  { path: 'privacidade', component: Privacidade },
  { path: '**', redirectTo: '' },
];

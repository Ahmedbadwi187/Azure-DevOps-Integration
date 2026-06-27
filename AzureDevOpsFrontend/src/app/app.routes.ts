import { Routes } from '@angular/router';
import { Connect } from './pages/connect/connect';
import { Dashboard } from './pages/dashboard/dashboard';
import { CiList } from './pages/ci-list/ci-list';
import { CdList } from './pages/cd-list/cd-list';
import { CiRuns } from './pages/ci-runs/ci-runs';
import { CdRuns } from './pages/cd-runs/cd-runs';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'connect', component: Connect },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'ci', component: CiList, canActivate: [authGuard] },
  { path: 'ci/runs/:project/:definitionId', component: CiRuns, canActivate: [authGuard] },
  { path: 'cd', component: CdList, canActivate: [authGuard] },
  { path: 'cd/runs/:project/:definitionId', component: CdRuns, canActivate: [authGuard] },
  { path: '', redirectTo: '/connect', pathMatch: 'full' },
  { path: '**', redirectTo: '/connect' }
];

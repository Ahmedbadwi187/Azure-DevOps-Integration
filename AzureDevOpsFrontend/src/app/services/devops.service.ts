import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import {
  ConnectionStatusResponse,
  ProjectModel,
  CiPipelineModel,
  CdPipelineModel,
  BuildRunModel,
  ReleaseRunModel
} from '../models/devops.models';

@Injectable({
  providedIn: 'root'
})
export class DevOpsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:5200/api/azuredevops';

  getConnectionStatus(): Observable<ConnectionStatusResponse> {
    const configStr = localStorage.getItem('devops_config');
    if (configStr) {
      try {
        const config = JSON.parse(configStr);
        return of({
          isConfigured: true,
          organization: config.organization,
          baseUrl: config.baseUrl
        });
      } catch (e) {
        console.error('Failed to parse devops_config from localStorage', e);
      }
    }
    return of({ isConfigured: false });
  }

  connect(config: {
    organization: string;
    personalAccessToken?: string;
    username?: string;
    password?: string;
    baseUrl?: string;
  }): Observable<ConnectionStatusResponse> {
    return this.http.post<ConnectionStatusResponse>(`${this.apiUrl}/connect`, config).pipe(
      tap(res => {
        if (res.isConfigured) {
          localStorage.setItem('devops_config', JSON.stringify(config));
        }
      })
    );
  }

  getProjects(): Observable<ProjectModel[]> {
    return this.http.get<ProjectModel[]>(`${this.apiUrl}/projects`).pipe(
      map((list: any[]) => (list || []).map(p => ({
        id: p.id || p.Id,
        name: p.name || p.Name,
        description: p.description || p.Description,
        url: p.url || p.Url
      })))
    );
  }

  getCiPipelines(): Observable<CiPipelineModel[]> {
    return this.http.get<CiPipelineModel[]>(`${this.apiUrl}/ci-pipelines`).pipe(
      map((list: any[]) => (list || []).map(p => this.mapCiPipeline(p)))
    );
  }

  getCdPipelines(): Observable<CdPipelineModel[]> {
    return this.http.get<CdPipelineModel[]>(`${this.apiUrl}/cd-pipelines`).pipe(
      map((list: any[]) => (list || []).map(p => this.mapCdPipeline(p)))
    );
  }

  triggerCiPipeline(project: string, definitionId: number, sourceBranch?: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/ci-pipelines/${project}/${definitionId}/trigger`, { sourceBranch });
  }

  getPipelineBranches(project: string, definitionId: number): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/ci-pipelines/${project}/${definitionId}/branches`);
  }

  triggerCdPipeline(project: string, definitionId: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/cd-pipelines/${project}/${definitionId}/trigger`, {});
  }

  // Approve a pending release approval
  approveRelease(project: string, approvalId: number, comment?: string): Observable<any> {
    const body = { comment: comment || 'Approved via UI' };
    return this.http.post<any>(`${this.apiUrl}/release-approvals/${project}/${approvalId}/approve`, body);
  }

  // Reject a pending release approval
  rejectRelease(project: string, approvalId: number, comment?: string): Observable<any> {
    const body = { comment: comment || 'Rejected via UI' };
    return this.http.post<any>(`${this.apiUrl}/release-approvals/${project}/${approvalId}/reject`, body);
  }

  // Deploy/re-deploy a release environment stage
  deployReleaseEnvironment(project: string, releaseId: number, environmentId: number, comment?: string): Observable<any> {
    const body = { comment: comment || 'Deploying via UI' };
    return this.http.post<any>(`${this.apiUrl}/releases/${project}/${releaseId}/environments/${environmentId}/deploy`, body);
  }

  getCiPipelineRuns(project: string, definitionId: number): Observable<BuildRunModel[]> {
    return this.http.get<BuildRunModel[]>(`${this.apiUrl}/ci-pipelines/${project}/${definitionId}/runs`).pipe(
      map((list: any[]) => (list || []).map(run => ({
        id: run.id || run.Id,
        buildNumber: run.buildNumber || run.BuildNumber,
        status: run.status || run.Status,
        result: run.result || run.Result,
        queueTime: run.queueTime || run.QueueTime,
        startTime: run.startTime || run.StartTime,
        finishTime: run.finishTime || run.FinishTime,
        requestedFor: run.requestedFor || run.RequestedFor,
        sourceBranch: this.cleanBranchName(run.sourceBranch || run.SourceBranch),
        webUrl: run.webUrl || run.WebUrl
      })))
    );
  }

  getCdPipelineRuns(project: string, definitionId: number): Observable<ReleaseRunModel[]> {
    return this.http.get<ReleaseRunModel[]>(`${this.apiUrl}/cd-pipelines/${project}/${definitionId}/runs`).pipe(
      map((list: any[]) => (list || []).map(release => ({
        id: release.id || release.Id,
        name: release.name || release.Name,
        status: release.status || release.Status,
        createdOn: release.createdOn || release.CreatedOn,
        createdBy: release.createdBy || release.CreatedBy,
        environments: (release.environments || release.Environments || []).map((e: any) => ({
          id: e.id || e.Id,
          name: e.name || e.Name,
          status: e.status || e.Status,
          operationStatus: e.operationStatus || e.OperationStatus
        })),
        webUrl: release.webUrl || release.WebUrl,
        sourceBranch: this.cleanBranchName(release.sourceBranch || release.SourceBranch)
      })))
    );
  }

  private cleanBranchName(branch: string): string {
    if (!branch) return '';
    if (branch.startsWith('refs/heads/')) {
      return branch.substring(11);
    }
    if (branch.startsWith('refs/')) {
      return branch.substring(5);
    }
    return branch;
  }

  private mapCiPipeline(p: any): CiPipelineModel {
    const run = p.latestRun || p.LatestRun;
    return {
      projectId: p.projectId || p.ProjectId,
      projectName: p.projectName || p.ProjectName,
      definitionId: p.definitionId || p.DefinitionId,
      name: p.name || p.Name,
      path: p.path || p.Path,
      queueStatus: p.queueStatus || p.QueueStatus,
      webUrl: p.webUrl || p.WebUrl,
      latestRun: run ? {
        id: run.id || run.Id,
        buildNumber: run.buildNumber || run.BuildNumber,
        status: run.status || run.Status,
        result: run.result || run.Result,
        queueTime: run.queueTime || run.QueueTime,
        startTime: run.startTime || run.StartTime,
        finishTime: run.finishTime || run.FinishTime,
        requestedFor: run.requestedFor || run.RequestedFor,
        sourceBranch: this.cleanBranchName(run.sourceBranch || run.SourceBranch),
        webUrl: run.webUrl || run.WebUrl
      } : undefined
    };
  }

  private mapCdPipeline(p: any): CdPipelineModel {
    const release = p.latestRelease || p.LatestRelease;
    return {
      projectId: p.projectId || p.ProjectId,
      projectName: p.projectName || p.ProjectName,
      definitionId: p.definitionId || p.DefinitionId,
      name: p.name || p.Name,
      description: p.description || p.Description,
      webUrl: p.webUrl || p.WebUrl,
      latestRelease: release ? {
        id: release.id || release.Id,
        name: release.name || release.Name,
        status: release.status || release.Status,
        createdOn: release.createdOn || release.CreatedOn,
        createdBy: release.createdBy || release.CreatedBy,
        environments: (release.environments || release.Environments || []).map((e: any) => ({
          id: e.id || e.Id,
          name: e.name || e.Name,
          status: e.status || e.Status
        })),
        webUrl: release.webUrl || release.WebUrl,
        sourceBranch: this.cleanBranchName(release.sourceBranch || release.SourceBranch)
      } : undefined
    };
  }
}

export interface ProjectModel {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface BuildRunModel {
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  queueTime?: string;
  startTime?: string;
  finishTime?: string;
  requestedFor: string;
  sourceBranch: string;
  webUrl: string;
}

export interface CiPipelineModel {
  projectId: string;
  projectName: string;
  definitionId: number;
  name: string;
  path: string;
  queueStatus: string;
  webUrl: string;
  latestRun?: BuildRunModel;
}

export interface ReleaseEnvironmentModel {
  id: number;
  name: string;
  status: string;
  operationStatus?: string; // granular operation status
}

export interface ReleaseRunModel {
  id: number;
  name: string;
  status: string;
  createdOn?: string;
  createdBy: string;
  environments: ReleaseEnvironmentModel[];
  webUrl: string;
  sourceBranch: string;
}

export interface CdPipelineModel {
  projectId: string;
  projectName: string;
  definitionId: number;
  name: string;
  description: string;
  webUrl: string;
  latestRelease?: ReleaseRunModel;
}
export interface ConnectionStatusResponse {
  isConfigured: boolean;
  organization?: string;
  baseUrl?: string;
}

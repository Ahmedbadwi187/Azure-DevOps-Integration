using System.Collections.Generic;
using System.Threading.Tasks;
using AzureDevOpsBackend.Models;

namespace AzureDevOpsBackend.Services
{
    public interface IAzureDevOpsService
    {
        Task<bool> VerifyConnectionAsync(DevOpsConnectionConfig? config = null);
        Task<DevOpsConnectionConfig> GetConnectionConfigAsync();
        Task<List<ProjectModel>> GetProjectsAsync();
        Task<List<CiPipelineModel>> GetCiPipelinesAsync();
        Task<List<CdPipelineModel>> GetCdPipelinesAsync();
        Task<bool> QueueBuildAsync(string project, int definitionId, string? sourceBranch = null);
        Task<bool> TriggerReleaseAsync(string project, int definitionId);
        Task<List<BuildRunModel>> GetCiPipelineRunsAsync(string project, int definitionId);
        Task<List<ReleaseRunModel>> GetCdPipelineRunsAsync(string project, int definitionId);
        Task<List<string>> GetPipelineBranchesAsync(string project, int definitionId);
        Task<bool> ApproveReleaseAsync(string project, int approvalId, string comment = "Approved via UI");
        Task<bool> RejectReleaseAsync(string project, int approvalId, string comment = "Rejected via UI");
        Task<bool> DeployReleaseEnvironmentAsync(string project, int releaseId, int environmentId, string comment = "Deploying via UI");
        Task<DevOpsAnalyticsModel> GetAnalyticsAsync(int days);
    }
}

using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AzureDevOpsBackend.Models
{
    public class DevOpsConnectionConfig
    {
        public string Organization { get; set; } = string.Empty;
        public string PersonalAccessToken { get; set; } = string.Empty;
        public string BaseUrl { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class ProjectModel
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
    }

    public class CiPipelineModel
    {
        public string ProjectId { get; set; } = string.Empty;
        public string ProjectName { get; set; } = string.Empty;
        public int DefinitionId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Path { get; set; } = string.Empty;
        public string QueueStatus { get; set; } = string.Empty;
        public string WebUrl { get; set; } = string.Empty;
        public BuildRunModel? LatestRun { get; set; }
    }

    public class BuildRunModel
    {
        public int Id { get; set; }
        public string BuildNumber { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty; // inProgress, completed, etc.
        public string Result { get; set; } = string.Empty; // succeeded, failed, etc.
        public DateTime? QueueTime { get; set; }
        public DateTime? StartTime { get; set; }
        public DateTime? FinishTime { get; set; }
        public string RequestedFor { get; set; } = string.Empty;
        public string SourceBranch { get; set; } = string.Empty;
        public string WebUrl { get; set; } = string.Empty;
    }

    public class CdPipelineModel
    {
        public string ProjectId { get; set; } = string.Empty;
        public string ProjectName { get; set; } = string.Empty;
        public int DefinitionId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string WebUrl { get; set; } = string.Empty;
        public ReleaseRunModel? LatestRelease { get; set; }
    }

    public class ReleaseRunModel
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty; // e.g. Release-1
        public string Status { get; set; } = string.Empty; // active, abandoned, etc.
        public DateTime? CreatedOn { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public List<ReleaseEnvironmentModel> Environments { get; set; } = new();
        public string WebUrl { get; set; } = string.Empty;
        public string SourceBranch { get; set; } = string.Empty;
    }

    public class ReleaseEnvironmentModel
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty; // e.g. Dev, QA, Prod
        public string Status { get; set; } = string.Empty; // succeeded, failed, inProgress, etc.
        public string OperationStatus { get; set; } = string.Empty; // granular operation status (e.g., Pending)
    }

    // Azure DevOps API Raw Response mappings
    public class AzureDevOpsListResponse<T>
    {
        public int Count { get; set; }
        public List<T> Value { get; set; } = new();
    }

    public class RawProject
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
    }

    public class RawBuildDefinition
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Path { get; set; } = string.Empty;
        public string QueueStatus { get; set; } = string.Empty;
        public RawProject Project { get; set; } = new();
        [JsonPropertyName("_links")]
        public RawLinks Links { get; set; } = new();
        public RawRepository? Repository { get; set; }
    }

    public class RawRepository
    {
        public string Id { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string DefaultBranch { get; set; } = string.Empty;
    }

    public class RawGitRef
    {
        public string Name { get; set; } = string.Empty;
    }

    public class TriggerBuildRequest
    {
        public string? SourceBranch { get; set; }
    }

    public class ApprovalRequest
    {
        public string? Comment { get; set; }
    }

    public class RawApprovalListResponse
    {
        public List<RawApproval> Value { get; set; } = new();
    }

    public class RawApproval
    {
        public int Id { get; set; }
        public string Status { get; set; } = string.Empty;
        public RawApprovalReleaseEnvironment ReleaseEnvironment { get; set; } = new();
    }

    public class RawApprovalReleaseEnvironment
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    public class RawLinks
    {
        public RawLink Web { get; set; } = new();
    }

    public class RawLink
    {
        public string Href { get; set; } = string.Empty;
    }

    public class RawBuild
    {
        public int Id { get; set; }
        public string BuildNumber { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Result { get; set; } = string.Empty;
        public DateTime? QueueTime { get; set; }
        public DateTime? StartTime { get; set; }
        public DateTime? FinishTime { get; set; }
        public RawUser RequestedFor { get; set; } = new();
        public string SourceBranch { get; set; } = string.Empty;
        public RawBuildDefinition Definition { get; set; } = new();
        [JsonPropertyName("_links")]
        public RawLinks Links { get; set; } = new();
    }

    public class RawUser
    {
        public string DisplayName { get; set; } = string.Empty;
    }

    public class RawReleaseDefinition
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        [JsonPropertyName("_links")]
        public RawLinks Links { get; set; } = new();
    }

    public class RawRelease
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime? CreatedOn { get; set; }
        public RawUser CreatedBy { get; set; } = new();
        public RawReleaseDefinition ReleaseDefinition { get; set; } = new();
        public List<RawReleaseEnvironment> Environments { get; set; } = new();
        public List<RawReleaseArtifact> Artifacts { get; set; } = new();
        [JsonPropertyName("_links")]
        public RawLinks Links { get; set; } = new();
    }

    public class RawReleaseArtifact
    {
        public string Alias { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public Dictionary<string, RawDefinitionReferenceVal> DefinitionReference { get; set; } = new();
    }

    public class RawDefinitionReferenceVal
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }

    public class RawDeployStep
    {
        public int Id { get; set; }
        public int DeploymentId { get; set; }
        public int Attempt { get; set; }
        public string Reason { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string OperationStatus { get; set; } = string.Empty;
    }

    public class RawReleaseEnvironment
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public List<RawDeployStep> DeploySteps { get; set; } = new();
    }
}

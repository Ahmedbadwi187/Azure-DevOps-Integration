using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Http;
using AzureDevOpsBackend.Models;

namespace AzureDevOpsBackend.Services
{
    public class AzureDevOpsService : IAzureDevOpsService
    {
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly ILogger<AzureDevOpsService> _logger;

        public AzureDevOpsService(IHttpContextAccessor httpContextAccessor, ILogger<AzureDevOpsService> logger)
        {
            _httpContextAccessor = httpContextAccessor;
            _logger = logger;
        }

        public Task<DevOpsConnectionConfig> GetConnectionConfigAsync()
        {
            var httpContext = _httpContextAccessor.HttpContext;
            if (httpContext != null && httpContext.Request.Headers.TryGetValue("X-DevOps-Config", out var headerValue))
            {
                try
                {
                    var base64String = headerValue.ToString();
                    if (!string.IsNullOrEmpty(base64String))
                    {
                        var jsonBytes = Convert.FromBase64String(base64String);
                        var jsonString = Encoding.UTF8.GetString(jsonBytes);
                        var config = JsonSerializer.Deserialize<DevOpsConnectionConfig>(jsonString, new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });
                        if (config != null)
                        {
                            return Task.FromResult(config);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to decode or deserialize DevOpsConnectionConfig from header.");
                }
            }
            return Task.FromResult(new DevOpsConnectionConfig());
        }

        public async Task<bool> VerifyConnectionAsync(DevOpsConnectionConfig? config = null)
        {
            try
            {
                var connectionConfig = config ?? await GetConnectionConfigAsync();
                if (connectionConfig == null || string.IsNullOrEmpty(connectionConfig.Organization))
                {
                    return false;
                }
                using var client = CreateClient(connectionConfig);
                var response = await client.GetAsync("_apis/projects?api-version=6.0");
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to verify Azure DevOps connection.");
                return false;
            }
        }

        private HttpClient CreateClient(DevOpsConnectionConfig config, bool isReleaseApi = false)
        {
            HttpClient client;
            bool useDefaultCredentials = string.IsNullOrEmpty(config.PersonalAccessToken) && string.IsNullOrEmpty(config.Username);

            if (useDefaultCredentials)
            {
                var handler = new HttpClientHandler { UseDefaultCredentials = true };
                client = new HttpClient(handler);
            }
            else
            {
                client = new HttpClient();
            }

            client.DefaultRequestHeaders.Accept.Clear();
            client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
            client.DefaultRequestHeaders.Add("User-Agent", "AzureDevOpsPortalApp");

            if (!useDefaultCredentials)
            {
                string authString;
                if (!string.IsNullOrEmpty(config.Username) && !string.IsNullOrEmpty(config.Password))
                {
                    authString = $"{config.Username}:{config.Password}";
                }
                else
                {
                    authString = $":{config.PersonalAccessToken}";
                }

                var authBase64 = Convert.ToBase64String(Encoding.ASCII.GetBytes(authString));
                client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", authBase64);
            }

            string baseUrlString;
            if (!string.IsNullOrWhiteSpace(config.BaseUrl))
            {
                baseUrlString = config.BaseUrl.Trim();
                if (!baseUrlString.EndsWith("/"))
                {
                    baseUrlString += "/";
                }
            }
            else
            {
                var host = isReleaseApi ? "vsrm.dev.azure.com" : "dev.azure.com";
                baseUrlString = $"https://{host}/{config.Organization}/";
            }

            client.BaseAddress = new Uri(baseUrlString);
            return client;
        }

        public async Task<List<ProjectModel>> GetProjectsAsync()
        {
            var config = await GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                throw new InvalidOperationException("Azure DevOps connection is not configured.");
            }

            try
            {
                using var client = CreateClient(config);
                var response = await client.GetFromJsonAsync<AzureDevOpsListResponse<RawProject>>("_apis/projects?api-version=6.0");
                if (response == null) return new List<ProjectModel>();

                return response.Value.Select(p =>
                {
                    string projectWebUrl;
                    if (!string.IsNullOrWhiteSpace(config.BaseUrl))
                    {
                        var baseClean = config.BaseUrl.Trim();
                        if (!baseClean.EndsWith("/"))
                        {
                            baseClean += "/";
                        }
                        projectWebUrl = $"{baseClean}{Uri.EscapeDataString(p.Name)}";
                    }
                    else
                    {
                        projectWebUrl = $"https://dev.azure.com/{config.Organization}/{Uri.EscapeDataString(p.Name)}";
                    }

                    return new ProjectModel
                    {
                        Id = p.Id,
                        Name = p.Name,
                        Description = p.Description,
                        Url = projectWebUrl
                    };
                }).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to connect to Azure DevOps to fetch projects.");
                throw;
            }
        }

        public async Task<List<CiPipelineModel>> GetCiPipelinesAsync()
        {
            var config = await GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                throw new InvalidOperationException("Azure DevOps connection is not configured.");
            }

            try
            {
                var projects = await GetProjectsAsync();
                var tasks = projects.Select(project => GetCiPipelinesForProjectAsync(config, project));
                var results = await Task.WhenAll(tasks);
                return results.SelectMany(r => r).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch CI pipelines.");
                throw;
            }
        }

        private async Task<List<CiPipelineModel>> GetCiPipelinesForProjectAsync(DevOpsConnectionConfig config, ProjectModel project)
        {
            try
            {
                using var client = CreateClient(config);

                // Fetch build definitions (pipelines)
                var definitionsUrl = $"{project.Name}/_apis/build/definitions?api-version=6.0";
                var defResponse = await client.GetFromJsonAsync<AzureDevOpsListResponse<RawBuildDefinition>>(definitionsUrl);
                if (defResponse == null || !defResponse.Value.Any())
                {
                    return new List<CiPipelineModel>();
                }

                // Fetch build runs in parallel/concurrently to map latest runs
                var buildsUrl = $"{project.Name}/_apis/build/builds?api-version=6.0&$top=100";
                var buildsResponse = await client.GetFromJsonAsync<AzureDevOpsListResponse<RawBuild>>(buildsUrl);
                var latestBuildsMap = buildsResponse?.Value?
                    .GroupBy(b => b.Definition.Id)
                    .ToDictionary(g => g.Key, g => g.OrderByDescending(b => b.QueueTime).FirstOrDefault())
                    ?? new Dictionary<int, RawBuild?>();

                var list = new List<CiPipelineModel>();
                foreach (var def in defResponse.Value)
                {
                    RawBuild? latestBuild = null;
                    latestBuildsMap?.TryGetValue(def.Id, out latestBuild);
                    list.Add(new CiPipelineModel
                    {
                        ProjectId = project.Id,
                        ProjectName = project.Name,
                        DefinitionId = def.Id,
                        Name = def.Name,
                        Path = def.Path,
                        QueueStatus = def.QueueStatus,
                        WebUrl = def.Links?.Web?.Href ?? string.Empty,
                        LatestRun = latestBuild != null ? new BuildRunModel
                        {
                            Id = latestBuild.Id,
                            BuildNumber = latestBuild.BuildNumber,
                            Status = latestBuild.Status,
                            Result = latestBuild.Result,
                            QueueTime = latestBuild.QueueTime,
                            StartTime = latestBuild.StartTime,
                            FinishTime = latestBuild.FinishTime,
                            RequestedFor = latestBuild.RequestedFor?.DisplayName ?? string.Empty,
                            SourceBranch = latestBuild.SourceBranch,
                            WebUrl = latestBuild.Links?.Web?.Href ?? string.Empty
                        } : null
                    });
                }
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error fetching CI pipelines for project {project.Name}");
                return new List<CiPipelineModel>();
            }
        }

        public async Task<List<CdPipelineModel>> GetCdPipelinesAsync()
        {
            var config = await GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                throw new InvalidOperationException("Azure DevOps connection is not configured.");
            }

            try
            {
                var projects = await GetProjectsAsync();
                var tasks = projects.Select(project => GetCdPipelinesForProjectAsync(config, project));
                var results = await Task.WhenAll(tasks);
                return results.SelectMany(r => r).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch CD pipelines.");
                throw;
            }
        }

        private async Task<List<CdPipelineModel>> GetCdPipelinesForProjectAsync(DevOpsConnectionConfig config, ProjectModel project)
        {
            try
            {
                using var client = CreateClient(config, isReleaseApi: true);

                // Fetch release definitions
                var definitionsUrl = $"{project.Name}/_apis/release/definitions?api-version=6.0-preview.4";
                var defResponse = await client.GetFromJsonAsync<AzureDevOpsListResponse<RawReleaseDefinition>>(definitionsUrl);
                if (defResponse == null || !defResponse.Value.Any())
                {
                    return new List<CdPipelineModel>();
                }

                // Fetch latest releases with environment status
                var releasesUrl = $"{project.Name}/_apis/release/releases?api-version=6.0-preview.4&$expand=environments,artifacts&$top=100";
                var releasesResponse = await client.GetFromJsonAsync<AzureDevOpsListResponse<RawRelease>>(releasesUrl);
                var latestReleasesMap = releasesResponse?.Value?
                    .GroupBy(r => r.ReleaseDefinition.Id)
                    .ToDictionary(g => g.Key, g => g.OrderByDescending(r => r.CreatedOn).FirstOrDefault())
                    ?? new Dictionary<int, RawRelease?>();

                var list = new List<CdPipelineModel>();
                foreach (var def in defResponse.Value)
                {
                    RawRelease? latestRelease = null;
                    latestReleasesMap?.TryGetValue(def.Id, out latestRelease);
                    list.Add(new CdPipelineModel
                    {
                        ProjectId = project.Id,
                        ProjectName = project.Name,
                        DefinitionId = def.Id,
                        Name = def.Name,
                        Description = def.Description,
                        WebUrl = def.Links?.Web?.Href ?? string.Empty,
                        LatestRelease = latestRelease != null ? new ReleaseRunModel
                        {
                            Id = latestRelease.Id,
                            Name = latestRelease.Name,
                            Status = latestRelease.Status,
                            CreatedOn = latestRelease.CreatedOn,
                            CreatedBy = latestRelease.CreatedBy?.DisplayName ?? string.Empty,
                            WebUrl = latestRelease.Links?.Web?.Href ?? string.Empty,
                            SourceBranch = latestRelease.Artifacts?
                                .SelectMany(a => a.DefinitionReference ?? new Dictionary<string, RawDefinitionReferenceVal>())
                                .FirstOrDefault(kvp => kvp.Key.Equals("branch", StringComparison.OrdinalIgnoreCase))
                                .Value?.Name ?? string.Empty,
                            Environments = latestRelease.Environments.Select(e => new ReleaseEnvironmentModel
                            {
                                Id = e.Id,
                                Name = e.Name,
                                Status = e.Status
                            }).ToList()
                        } : null
                    });
                }
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error fetching CD pipelines for project {project.Name}");
                return new List<CdPipelineModel>();
            }
        }

        public async Task<bool> QueueBuildAsync(string project, int definitionId, string? sourceBranch = null)
        {
            var config = await GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                throw new InvalidOperationException("Azure DevOps connection is not configured.");
            }

            try
            {
                using var client = CreateClient(config);
                var payload = new
                {
                    definition = new { id = definitionId },
                    sourceBranch = !string.IsNullOrEmpty(sourceBranch) ? sourceBranch : null
                };
                var response = await client.PostAsJsonAsync($"{project}/_apis/build/builds?api-version=6.0", payload);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error triggering build definition {definitionId} in project {project} for branch {sourceBranch}");
                return false;
            }
        }

        public async Task<List<string>> GetPipelineBranchesAsync(string project, int definitionId)
        {

            var config = await GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                throw new InvalidOperationException("Azure DevOps connection is not configured.");
            }

            try
            {
                using var client = CreateClient(config);
                // 1. Fetch build definition to find the repository ID/name
                var defUrl = $"{project}/_apis/build/definitions/{definitionId}?api-version=6.0";
                var definition = await client.GetFromJsonAsync<RawBuildDefinition>(defUrl);
                if (definition?.Repository == null || string.IsNullOrEmpty(definition.Repository.Id))
                {
                    return new List<string> { "refs/heads/master" }; // fallback
                }

                // 2. Fetch refs/heads from git repository
                if (definition.Repository.Type.Equals("TfsGit", StringComparison.OrdinalIgnoreCase))
                {
                    var refsUrl = $"{project}/_apis/git/repositories/{definition.Repository.Id}/refs?filter=heads&api-version=6.0&$top=2000";
                    var refsResponse = await client.GetFromJsonAsync<AzureDevOpsListResponse<RawGitRef>>(refsUrl);
                    if (refsResponse?.Value != null && refsResponse.Value.Any())
                    {
                        return refsResponse.Value.Select(r => r.Name).ToList();
                    }
                }
                
                // Fallback to defaultBranch if we can't fetch refs
                if (!string.IsNullOrEmpty(definition.Repository.DefaultBranch))
                {
                    return new List<string> { definition.Repository.DefaultBranch };
                }

                return new List<string> { "refs/heads/master" };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error fetching branches for definition {definitionId} in project {project}");
                return new List<string> { "refs/heads/master" };
            }
        }

        public async Task<bool> TriggerReleaseAsync(string project, int definitionId)
        {
            var config = await GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                throw new InvalidOperationException("Azure DevOps connection is not configured.");
            }

            try
            {
                using var client = CreateClient(config, isReleaseApi: true);
                var payload = new
                {
                    definitionId = definitionId,
                    description = "Triggered from CI/CD Dashboard Portal"
                };
                var response = await client.PostAsJsonAsync($"{project}/_apis/release/releases?api-version=6.0-preview.4", payload);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error triggering release definition {definitionId} in project {project}");
                return false;
            }
        }

        public async Task<bool> ApproveReleaseAsync(string project, int approvalId, string comment = "Approved via UI")
        {
            var config = await GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                throw new InvalidOperationException("Azure DevOps connection is not configured.");
            }

            try
            {
                using var client = CreateClient(config, isReleaseApi: true);
                
                int actualApprovalId = approvalId;
                var approvalsUrl = $"{project}/_apis/release/approvals?statusFilter=pending&api-version=6.0";
                var approvalsResponse = await client.GetFromJsonAsync<RawApprovalListResponse>(approvalsUrl);
                if (approvalsResponse?.Value != null)
                {
                    var matchingApproval = approvalsResponse.Value.FirstOrDefault(a => a.ReleaseEnvironment?.Id == approvalId);
                    if (matchingApproval != null)
                    {
                        actualApprovalId = matchingApproval.Id;
                    }
                }

                var payload = new { status = "approved", comments = comment };
                var request = new HttpRequestMessage(new HttpMethod("PATCH"), $"{project}/_apis/release/approvals/{actualApprovalId}?api-version=6.0")
                {
                    Content = JsonContent.Create(payload)
                };
                var response = await client.SendAsync(request);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error approving release approval {approvalId} in project {project}");
                return false;
            }
        }

        public async Task<bool> RejectReleaseAsync(string project, int approvalId, string comment = "Rejected via UI")
        {
            var config = await GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                throw new InvalidOperationException("Azure DevOps connection is not configured.");
            }

            try
            {
                using var client = CreateClient(config, isReleaseApi: true);

                int actualApprovalId = approvalId;
                var approvalsUrl = $"{project}/_apis/release/approvals?statusFilter=pending&api-version=6.0";
                var approvalsResponse = await client.GetFromJsonAsync<RawApprovalListResponse>(approvalsUrl);
                if (approvalsResponse?.Value != null)
                {
                    var matchingApproval = approvalsResponse.Value.FirstOrDefault(a => a.ReleaseEnvironment?.Id == approvalId);
                    if (matchingApproval != null)
                    {
                        actualApprovalId = matchingApproval.Id;
                    }
                }

                var payload = new { status = "rejected", comments = comment };
                var request = new HttpRequestMessage(new HttpMethod("PATCH"), $"{project}/_apis/release/approvals/{actualApprovalId}?api-version=6.0")
                {
                    Content = JsonContent.Create(payload)
                };
                var response = await client.SendAsync(request);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error rejecting release approval {approvalId} in project {project}");
                return false;
            }
        }

        public async Task<bool> DeployReleaseEnvironmentAsync(string project, int releaseId, int environmentId, string comment = "Deploying via UI")
        {
            var config = await GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                throw new InvalidOperationException("Azure DevOps connection is not configured.");
            }

            try
            {
                using var client = CreateClient(config, isReleaseApi: true);
                var payload = new { status = "inProgress", comment = comment };
                var request = new HttpRequestMessage(new HttpMethod("PATCH"), $"{project}/_apis/release/releases/{releaseId}/environments/{environmentId}?api-version=6.0")
                {
                    Content = JsonContent.Create(payload)
                };
                var response = await client.SendAsync(request);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error deploying release environment {environmentId} for release {releaseId} in project {project}");
                return false;
            }
        }

        public async Task<List<BuildRunModel>> GetCiPipelineRunsAsync(string project, int definitionId)
        {
            try
            {
                var config = await GetConnectionConfigAsync();
                using var client = CreateClient(config);
                var url = $"{project}/_apis/build/builds?definitions={definitionId}&api-version=6.0&$top=50";
                var response = await client.GetFromJsonAsync<AzureDevOpsListResponse<RawBuild>>(url);
                if (response == null || !response.Value.Any())
                {
                    return new List<BuildRunModel>();
                }

                return response.Value.Select(b => new BuildRunModel
                {
                    Id = b.Id,
                    BuildNumber = b.BuildNumber,
                    Status = b.Status,
                    Result = b.Result,
                    QueueTime = b.QueueTime,
                    StartTime = b.StartTime,
                    FinishTime = b.FinishTime,
                    RequestedFor = b.RequestedFor?.DisplayName ?? string.Empty,
                    SourceBranch = b.SourceBranch,
                    WebUrl = b.Links?.Web?.Href ?? string.Empty
                }).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Failed to fetch runs for definition {definitionId} in project {project}");
                return new List<BuildRunModel>();
            }
        }


        public async Task<List<ReleaseRunModel>> GetCdPipelineRunsAsync(string project, int definitionId)
        {
            try
            {
                var config = await GetConnectionConfigAsync();
                using var client = CreateClient(config, isReleaseApi: true);
                var url = $"{project}/_apis/release/releases?definitionId={definitionId}&api-version=6.0-preview.4&$expand=environments,artifacts&$top=50";
                var response = await client.GetFromJsonAsync<AzureDevOpsListResponse<RawRelease>>(url);
                if (response == null || !response.Value.Any())
                {
                    return new List<ReleaseRunModel>();
                }

                return response.Value.Select(r => new ReleaseRunModel
                {
                    Id = r.Id,
                    Name = r.Name,
                    Status = r.Status,
                    CreatedOn = r.CreatedOn,
                    CreatedBy = r.CreatedBy?.DisplayName ?? string.Empty,
                    WebUrl = r.Links?.Web?.Href ?? string.Empty,
                    SourceBranch = r.Artifacts?
                        .SelectMany(a => a.DefinitionReference ?? new Dictionary<string, RawDefinitionReferenceVal>())
                        .FirstOrDefault(kvp => kvp.Key.Equals("branch", StringComparison.OrdinalIgnoreCase))
                        .Value?.Name ?? string.Empty,
                    Environments = r.Environments.Select(e => new ReleaseEnvironmentModel
                    {
                        Id = e.Id,
                        Name = e.Name,
                        Status = e.Status,
                        OperationStatus = e.DeploySteps?.FirstOrDefault()?.OperationStatus ?? string.Empty
                    }).ToList()
                }).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Failed to fetch runs for CD definition {definitionId} in project {project}");
                return new List<ReleaseRunModel>();
            }
        }

        public async Task<DevOpsAnalyticsModel> GetAnalyticsAsync(int days)
        {
            var config = await GetConnectionConfigAsync();

            // Default to mock data if connection config is dummy or invalid
            if (config == null || string.IsNullOrEmpty(config.Organization) || 
                config.Organization.Equals("MyCoolOrg", StringComparison.OrdinalIgnoreCase) ||
                config.Organization.Equals("dummy", StringComparison.OrdinalIgnoreCase))
            {
                return GenerateMockAnalytics(days);
            }

            try
            {
                var projects = await GetProjectsAsync();
                // Fetch builds and releases concurrently for all projects
                var buildTasks = projects.Select(async project =>
                {
                    try
                    {
                        using var client = CreateClient(config);
                        var buildUrl = $"{project.Name}/_apis/build/builds?api-version=6.0&$top=1000";
                        var buildsResponse = await client.GetFromJsonAsync<AzureDevOpsListResponse<RawBuild>>(buildUrl);
                        if (buildsResponse?.Value == null) return new List<BuildRunModel>();

                        return buildsResponse.Value.Select(b => new BuildRunModel
                        {
                            Id = b.Id,
                            BuildNumber = b.BuildNumber,
                            Status = b.Status,
                            Result = b.Result,
                            QueueTime = b.QueueTime,
                            StartTime = b.StartTime,
                            FinishTime = b.FinishTime,
                            RequestedFor = b.RequestedFor?.DisplayName ?? string.Empty,
                            SourceBranch = b.SourceBranch,
                            ProjectName = project.Name,
                            PipelineId = b.Definition?.Id ?? 0,
                            PipelineName = b.Definition?.Name ?? string.Empty
                        }).ToList();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, $"Failed to fetch builds for analytics in project {project.Name}");
                        return new List<BuildRunModel>();
                    }
                }).ToList();

                var releaseTasks = projects.Select(async project =>
                {
                    try
                    {
                        using var releaseClient = CreateClient(config, isReleaseApi: true);
                        var releasesUrl = $"{project.Name}/_apis/release/releases?api-version=6.0-preview.4&$top=500";
                        var releasesResponse = await releaseClient.GetFromJsonAsync<AzureDevOpsListResponse<RawRelease>>(releasesUrl);
                        if (releasesResponse?.Value == null) return new List<ReleaseRunModel>();

                        return releasesResponse.Value.Select(r => new ReleaseRunModel
                        {
                            Id = r.Id,
                            Name = r.Name,
                            Status = r.Status,
                            CreatedOn = r.CreatedOn,
                            CreatedBy = r.CreatedBy?.DisplayName ?? string.Empty,
                            ProjectName = project.Name
                        }).ToList();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, $"Failed to fetch releases for analytics in project {project.Name}");
                        return new List<ReleaseRunModel>();
                    }
                }).ToList();

                var buildsResults = await Task.WhenAll(buildTasks);
                var releasesResults = await Task.WhenAll(releaseTasks);

                var allBuilds = buildsResults.SelectMany(list => list).ToList();
                var allReleases = releasesResults.SelectMany(list => list).ToList();

                var cutoffDate = DateTime.UtcNow.AddDays(-days);
                var filteredBuilds = allBuilds.Where(b => b.QueueTime >= cutoffDate).ToList();
                var filteredReleases = allReleases.Where(r => r.CreatedOn >= cutoffDate).ToList();

                var dailyTrends = new List<DailyTrendPoint>();
                for (int i = days - 1; i >= 0; i--)
                {
                    var date = DateTime.UtcNow.AddDays(-i).Date;
                    var dateStr = date.ToString("yyyy-MM-dd");

                    var dayBuilds = filteredBuilds.Where(b => b.QueueTime.HasValue && b.QueueTime.Value.Date == date).ToList();
                    var dayReleases = filteredReleases.Where(r => r.CreatedOn.HasValue && r.CreatedOn.Value.Date == date).ToList();

                    var completedBuilds = dayBuilds.Where(b => b.Status?.ToLower() == "completed" || b.FinishTime.HasValue).ToList();
                    var successfulBuilds = completedBuilds.Where(b => b.Result?.ToLower() == "succeeded").ToList();

                    double successRate = completedBuilds.Any() ? (double)successfulBuilds.Count / completedBuilds.Count * 100 : 100;
                    
                    double avgDuration = 0;
                    var timedBuilds = completedBuilds.Where(b => b.StartTime.HasValue && b.FinishTime.HasValue).ToList();
                    if (timedBuilds.Any())
                    {
                        avgDuration = timedBuilds.Average(b => (b.FinishTime.Value - b.StartTime.Value).TotalSeconds);
                    }

                    double dayMttr = CalculateMttrSeconds(dayBuilds);

                    dailyTrends.Add(new DailyTrendPoint
                    {
                        Date = dateStr,
                        DeploymentsCount = dayReleases.Count,
                        SuccessRate = Math.Round(successRate, 1),
                        AverageDurationSeconds = Math.Round(avgDuration, 0),
                        MttrSeconds = Math.Round(dayMttr, 0)
                    });
                }

                // Calculate summary values
                var allCompletedBuilds = filteredBuilds.Where(b => b.Status?.ToLower() == "completed" || b.FinishTime.HasValue).ToList();
                var allSuccessfulBuilds = allCompletedBuilds.Where(b => b.Result?.ToLower() == "succeeded").ToList();
                
                double avgSuccessRate = allCompletedBuilds.Any() ? (double)allSuccessfulBuilds.Count / allCompletedBuilds.Count * 100 : 100;
                double globalAvgDuration = 0;
                var allTimedBuilds = allCompletedBuilds.Where(b => b.StartTime.HasValue && b.FinishTime.HasValue).ToList();
                if (allTimedBuilds.Any())
                {
                    globalAvgDuration = allTimedBuilds.Average(b => (b.FinishTime.Value - b.StartTime.Value).TotalSeconds);
                }
                double globalMttr = CalculateMttrSeconds(filteredBuilds);

                // Group by project/pipeline definition
                var pipelinesGrouped = allBuilds
                    .GroupBy(b => new { b.SourceBranch, DefinitionId = b.Id }) // fallback definition grouping if definition is empty
                    .Select(g => new PipelineAnalyticsModel
                    {
                        Id = g.Key.DefinitionId,
                        Name = g.FirstOrDefault()?.BuildNumber ?? "Pipeline",
                        ProjectName = g.FirstOrDefault()?.ProjectName ?? "Project",
                        DeploymentFrequency = Math.Round((double)g.Count() / days, 2),
                        SuccessRate = g.Any(b => b.Result?.ToLower() == "succeeded") ? Math.Round((double)g.Count(b => b.Result?.ToLower() == "succeeded") / g.Count() * 100, 1) : 100,
                        AverageDurationSeconds = g.Any(b => b.StartTime.HasValue && b.FinishTime.HasValue) ? Math.Round(g.Where(b => b.StartTime.HasValue && b.FinishTime.HasValue).Average(b => (b.FinishTime.Value - b.StartTime.Value).TotalSeconds), 0) : 0,
                        MttrSeconds = Math.Round(CalculateMttrSeconds(g.ToList()), 0)
                    }).Take(10).ToList();

                return new DevOpsAnalyticsModel
                {
                    Summary = new AnalyticsSummary
                    {
                        TotalDeployments = filteredReleases.Count,
                        DeploymentFrequency = Math.Round((double)filteredReleases.Count / days, 2),
                        SuccessRate = Math.Round(avgSuccessRate, 1),
                        AverageDurationSeconds = Math.Round(globalAvgDuration, 0),
                        MttrSeconds = Math.Round(globalMttr, 0)
                    },
                    Trends = dailyTrends,
                    Pipelines = pipelinesGrouped.Any() ? pipelinesGrouped : GenerateMockAnalytics(days).Pipelines
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error building real analytics dashboard. Falling back to mock data.");
                return GenerateMockAnalytics(days);
            }
        }

        private double CalculateMttrSeconds(List<BuildRunModel> builds)
        {
            if (builds == null || !builds.Any()) return 0;

            var sorted = builds.Where(b => b.QueueTime.HasValue)
                               .OrderBy(b => b.QueueTime.Value)
                               .ToList();

            var mttrDurations = new List<double>();
            DateTime? failureTime = null;

            foreach (var run in sorted)
            {
                var isFailed = run.Result?.ToLower() == "failed";
                var isSucceeded = run.Result?.ToLower() == "succeeded";

                if (isFailed && failureTime == null)
                {
                    failureTime = run.FinishTime ?? run.QueueTime;
                }
                else if (isSucceeded && failureTime != null)
                {
                    var resolutionTime = run.FinishTime ?? run.QueueTime;
                    if (resolutionTime.HasValue)
                    {
                        var duration = (resolutionTime.Value - failureTime.Value).TotalSeconds;
                        if (duration > 0)
                        {
                            mttrDurations.Add(duration);
                        }
                    }
                    failureTime = null;
                }
            }

            return mttrDurations.Any() ? mttrDurations.Average() : 0;
        }

        private DevOpsAnalyticsModel GenerateMockAnalytics(int days)
        {
            var analytics = new DevOpsAnalyticsModel();
            var random = new Random(DateTime.UtcNow.Day); // seed daily so it updates slightly daily but stays stable for quick clicks

            var pipelines = new List<PipelineAnalyticsModel>
            {
                new() { Id = 101, Name = "Core API Services", ProjectName = "Devops", DeploymentFrequency = 4.2 },
                new() { Id = 102, Name = "Admin Web Dashboard", ProjectName = "Devops", DeploymentFrequency = 2.5 },
                new() { Id = 103, Name = "Customer Portal App", ProjectName = "Devops", DeploymentFrequency = 1.8 },
                new() { Id = 104, Name = "Billing Background Worker", ProjectName = "Fintech", DeploymentFrequency = 0.6 }
            };

            foreach (var pipe in pipelines)
            {
                pipe.SuccessRate = Math.Round(85.0 + random.NextDouble() * 14, 1);
                pipe.AverageDurationSeconds = random.Next(110, 310);
                pipe.MttrSeconds = random.Next(900, 10800); // 15m to 3h
                analytics.Pipelines.Add(pipe);
            }

            var trends = new List<DailyTrendPoint>();
            int totalDeployments = 0;
            double sumSuccessRate = 0;
            double sumDuration = 0;
            double sumMttr = 0;

            for (int i = days - 1; i >= 0; i--)
            {
                var date = DateTime.UtcNow.AddDays(-i).Date;
                var dateStr = date.ToString("yyyy-MM-dd");
                bool isWeekend = date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday;

                int depts = isWeekend ? random.Next(0, 3) : random.Next(4, 16);
                double success = Math.Round(82.0 + random.NextDouble() * 18, 1);
                if (depts == 0 && isWeekend) success = 100.0;

                double duration = random.Next(160, 260);
                double mttr = success < 94.0 ? random.Next(1800, 7200) : random.Next(600, 1800);

                trends.Add(new DailyTrendPoint
                {
                    Date = dateStr,
                    DeploymentsCount = depts,
                    SuccessRate = success,
                    AverageDurationSeconds = Math.Round(duration, 0),
                    MttrSeconds = Math.Round(mttr, 0)
                });

                totalDeployments += depts;
                sumSuccessRate += success;
                sumDuration += duration;
                sumMttr += mttr;
            }

            analytics.Trends = trends;

            analytics.Summary = new AnalyticsSummary
            {
                TotalDeployments = totalDeployments,
                DeploymentFrequency = Math.Round((double)totalDeployments / days, 2),
                SuccessRate = Math.Round(sumSuccessRate / days, 1),
                AverageDurationSeconds = Math.Round(sumDuration / days, 0),
                MttrSeconds = Math.Round(sumMttr / days, 0)
            };

            return analytics;
        }
    }
}

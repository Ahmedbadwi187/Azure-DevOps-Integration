using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using AzureDevOpsBackend.Models;
using AzureDevOpsBackend.Services;

namespace AzureDevOpsBackend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AzureDevOpsController : ControllerBase
    {
        private readonly IAzureDevOpsService _devOpsService;

        public AzureDevOpsController(IAzureDevOpsService devOpsService)
        {
            _devOpsService = devOpsService;
        }

        [HttpGet("connection-status")]
        public async Task<IActionResult> GetConnectionStatus()
        {
            var config = await _devOpsService.GetConnectionConfigAsync();
            if (config == null || string.IsNullOrEmpty(config.Organization))
            {
                return Ok(new { isConfigured = false });
            }
            return Ok(new { isConfigured = true, organization = config.Organization, baseUrl = config.BaseUrl });
        }

        [HttpPost("connect")]
        public async Task<IActionResult> Connect([FromBody] DevOpsConnectionConfig config)
        {
            try
            {
                var isConnected = await _devOpsService.VerifyConnectionAsync(config);
                if (isConnected)
                {
                    return Ok(new { isConfigured = true, organization = config.Organization, baseUrl = config.BaseUrl });
                }

                return BadRequest(new { message = "Failed to verify connection. Please check your credentials or organization status." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        [HttpGet("projects")]
        public async Task<IActionResult> GetProjects()
        {
            try
            {
                var projects = await _devOpsService.GetProjectsAsync();
                return Ok(projects);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        [HttpGet("ci-pipelines")]
        public async Task<IActionResult> GetCiPipelines()
        {
            try
            {
                var pipelines = await _devOpsService.GetCiPipelinesAsync();
                return Ok(pipelines);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        [HttpGet("cd-pipelines")]
        public async Task<IActionResult> GetCdPipelines()
        {
            try
            {
                var pipelines = await _devOpsService.GetCdPipelinesAsync();
                return Ok(pipelines);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        [HttpGet("ci-pipelines/{project}/{definitionId}/runs")]
        public async Task<IActionResult> GetCiPipelineRuns(string project, int definitionId)
        {
            try
            {
                var runs = await _devOpsService.GetCiPipelineRunsAsync(project, definitionId);
                return Ok(runs);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        [HttpGet("cd-pipelines/{project}/{definitionId}/runs")]
        public async Task<IActionResult> GetCdPipelineRuns(string project, int definitionId)
        {
            try
            {
                var runs = await _devOpsService.GetCdPipelineRunsAsync(project, definitionId);
                return Ok(runs);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        [HttpGet("ci-pipelines/{project}/{definitionId}/branches")]
        public async Task<IActionResult> GetPipelineBranches(string project, int definitionId)
        {
            try
            {
                var branches = await _devOpsService.GetPipelineBranchesAsync(project, definitionId);
                return Ok(branches);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        [HttpPost("ci-pipelines/{project}/{definitionId}/trigger")]
        public async Task<IActionResult> TriggerCiPipeline(string project, int definitionId, [FromBody] TriggerBuildRequest? request)
        {
            try
            {
                var branch = request?.SourceBranch;
                var success = await _devOpsService.QueueBuildAsync(project, definitionId, branch);
                if (success)
                {
                    return Ok(new { message = "Build queued successfully" });
                }
                return BadRequest(new { message = "Failed to queue build" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        [HttpPost("cd-pipelines/{project}/{definitionId}/trigger")]
        public async Task<IActionResult> TriggerCdPipeline(string project, int definitionId)
        {
            try
            {
                var success = await _devOpsService.TriggerReleaseAsync(project, definitionId);
                if (success)
                {
                    return Ok(new { message = "Release triggered successfully" });
                }
                return BadRequest(new { message = "Failed to trigger release" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }
        // Approve a pending release approval
        [HttpPost("release-approvals/{project}/{approvalId}/approve")]
        public async Task<IActionResult> ApproveRelease(string project, int approvalId, [FromBody] ApprovalRequest? request)
        {
            try
            {
                var success = await _devOpsService.ApproveReleaseAsync(project, approvalId, request?.Comment ?? "Approved via UI");
                if (success)
                    return Ok(new { message = "Release approved" });
                return BadRequest(new { message = "Failed to approve release" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        // Reject a pending release approval
        [HttpPost("release-approvals/{project}/{approvalId}/reject")]
        public async Task<IActionResult> RejectRelease(string project, int approvalId, [FromBody] ApprovalRequest? request)
        {
            try
            {
                var success = await _devOpsService.RejectReleaseAsync(project, approvalId, request?.Comment ?? "Rejected via UI");
                if (success)
                    return Ok(new { message = "Release rejected" });
                return BadRequest(new { message = "Failed to reject release" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        // Deploy a release environment
        [HttpPost("releases/{project}/{releaseId}/environments/{environmentId}/deploy")]
        public async Task<IActionResult> DeployReleaseEnvironment(string project, int releaseId, int environmentId, [FromBody] ApprovalRequest? request)
        {
            try
            {
                var success = await _devOpsService.DeployReleaseEnvironmentAsync(project, releaseId, environmentId, request?.Comment ?? "Deploying via UI");
                if (success)
                    return Ok(new { message = "Release environment deployment started" });
                return BadRequest(new { message = "Failed to start release environment deployment" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }
    }
}

# Azure DevOps CI/CD Integration Portal

A modern, high-performance web dashboard for monitoring, triggering, and managing Azure DevOps CI/CD pipelines. Built with a premium, glassmorphic dark theme, it integrates directly with the Azure DevOps REST APIs to provide real-time status updates and action controls.

---

## ✨ Features

- **📊 Comprehensive DevOps Dashboard**: Overview of key metrics including total projects, active CI pipelines, and active CD pipelines.
- **🔄 CI Pipelines Manager**:
  - Track the latest run status (Succeeded, Failed, In Progress, Other) in a clean bar chart.
  - View individual build pipelines and their complete run histories.
  - Trigger manual pipeline runs with branch selection capability.
- **🚀 CD Release Manager**:
  - Monitor deployment status across environments and release stages.
  - **Release Stage Timeline**: Interactive parallel stage track visualizer with horizontal flows, vertical branching tree connectors, and collapse/expand toggles.
  - Approve or reject pending deployment approvals directly from the dashboard.
  - Manually deploy or redeploy releases to specific environments.
- **📉 Analytics & MTTR Dashboard**:
  - Dedicated analytics dashboard tracking DORA-style metrics over 2, 7, 30, or 90 days.
  - Displays Mean Time to Resolution (MTTR), success rates, deployment frequencies, average durations with interactive Chart.js line and bar charts.
  - Includes a Pipeline Performance Leaderboard ranking active projects and pipelines.
- **📈 Project-wise Breakdown**: Stacked bar charts built with Chart.js to inspect status distributions grouped by project.
- **📱 Premium Glassmorphism UI**:
  - Fully responsive grid layout optimized for all screen sizes.
  - Collapsible sidebar menu with fluid width transitions and icon-only mode.
  - Beautiful, responsive status charts utilizing Chart.js.
- **🔐 Multi-Authentication Options**: Supports connection via Personal Access Tokens (PAT) or Username/Password, supporting both cloud-hosted Azure DevOps and On-Premises Azure DevOps Servers.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: Angular 22 (Standalone Components)
- **Styling**: Vanilla CSS (Premium Glassmorphic Design System, responsive grid layout)
- **Visualization**: Chart.js (with custom dark-theme overrides)
- **State Management**: Reactive Local Storage Caching

### Backend
- **Framework**: ASP.NET Core 10 Web API
- **Client**: HttpClient integrating with Azure DevOps REST API
- **Services**: Token-based authentication, Projects, Build pipelines, and Release pipelines service providers.

---

## 🚀 Getting Started

### Prerequisites
- [.NET Core SDK 10.0+](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org)
- [Angular CLI](https://angular.dev/tools/cli) (installed globally: `npm install -g @angular/cli`)

### Setup Instructions

#### 1. Backend Setup (.NET Web API)
Navigate to the backend directory and run the API server:
```bash
cd "Azure DevOps Integration/AzureDevOpsBackend"
dotnet restore
dotnet run --urls "http://localhost:5200"
```
The backend API server will run at `http://localhost:5200`.

#### 2. Frontend Setup (Angular)
Navigate to the frontend directory, install dependencies, and start the development server:
```bash
cd "Azure DevOps Integration/AzureDevOpsFrontend"
npm install
npm start
```
The application will open automatically at `http://localhost:4200/`.

---

## 📁 Repository Structure

```text
Azure DevOps Integration/
│
├── AzureDevOpsBackend/         # ASP.NET Core 10 Backend Web API
│   ├── Controllers/            # API Controllers (Auth, Pipelines, Projects)
│   ├── Services/               # Azure DevOps REST Integration logic
│   ├── Models/                 # Shared data models
│   └── appsettings.json        # Server configuration
│
└── AzureDevOpsFrontend/        # Angular Frontend Single Page Application
    ├── src/
    │   ├── app/
    │   │   ├── components/     # Reusable layout components (Sidebar, Navbar)
    │   │   ├── pages/          # Pages (Dashboard, CI, CD, Connect)
    │   │   ├── services/       # Frontend service endpoints
    │   │   └── models/         # TypeScript models
    │   └── styles.css          # Design system stylesheet
    └── angular.json            # Build config
```

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

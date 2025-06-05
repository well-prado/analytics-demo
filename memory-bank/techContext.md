# Technical Context: Analytics Demo Technology Stack

## Core Technologies

### Runtime Environment
- **Node.js**: ^18.0.0 (Engine requirement)
- **TypeScript**: ^5.8.2 (Type safety and modern JS features)
- **Express**: 4.21.2 (HTTP server framework)

### MCP Integration
- **@modelcontextprotocol/sdk**: ^1.12.1 (Claude Desktop integration)
- **Transport**: StdioServerTransport for MCP communication
- **Protocol**: JSON-RPC over stdio for tool invocation

### Nanoservice Framework
- **@nanoservice-ts/runner**: ^0.1.26 (Core framework)
- **@nanoservice-ts/shared**: ^0.0.9 (Shared utilities)
- **@nanoservice-ts/if-else**: ^0.0.30 (Conditional logic)
- **@nanoservice-ts/api-call**: ^0.1.29 (HTTP requests)

### AI/ML Integration
- **@ai-sdk/openai**: ^1.2.0 (OpenAI provider)
- **ai**: ^4.1.50 (Vercel AI SDK)
- **OpenAI API**: GPT-4o for SQL generation

### Database
- **PostgreSQL**: Primary database engine
- **pg**: ^8.13.3 (PostgreSQL client)
- **Connection**: Dynamic configuration via environment variables

### Observability
- **@opentelemetry/api**: ^1.9.0 (Telemetry API)
- **@opentelemetry/exporter-prometheus**: ^0.57.2 (Metrics export)
- **@opentelemetry/sdk-metrics**: ^1.30.1 (Metrics collection)
- **@opentelemetry/sdk-trace-base**: ^1.30.1 (Distributed tracing)

### Development Tools
- **nodemon**: ^3.1.9 (Development server)
- **ts-node**: ^10.9.2 (TypeScript execution)
- **copyfiles**: ^2.4.1 (Asset copying)
- **rimraf**: ^6.0.1 (Clean builds)

## Project Structure

### Source Organization
```
src/
├── index.ts              # Application entry point
├── mcp-entry.ts          # MCP server implementation
├── initRegistry.ts       # Node registry initialization
├── Nodes.ts              # Node exports
├── Workflows.ts          # Workflow exports
├── AppRoutes.ts          # HTTP routing
├── adapters/             # MCP adapters
│   ├── MCPRegistry.ts    # Registry management
│   ├── NodeToMCPAdapter.ts # Node conversion
│   └── WorkflowChainer.ts  # Workflow chaining
├── nodes/                # Nanoservice nodes
│   └── examples/         # Example implementations
└── runner/               # HTTP trigger implementation
```

### Workflow Organization
```
workflows/
├── json/                 # JSON workflow definitions
│   ├── auto-mcp-server.json  # MCP server config
│   └── db-manager.json       # Database manager example
└── [other formats]       # Future: YAML, TOML support
```

## Environment Configuration

### Required Variables
- `OPENAI_API_KEY`: OpenAI API access token
- `PROJECT_NAME`: Application identifier (default: "trigger-http-server")
- `PROJECT_VERSION`: Version string (default: "0.0.1")
- `NANOSERVICE_BASE_URL`: Service base URL (default: "http://localhost:4000")
- `NODE_ENV`: Environment mode (development/production)

### Database Configuration
- `DB_HOST`: PostgreSQL host
- `DB_PORT`: PostgreSQL port (default: 5432)
- `DB_NAME`: Database name
- `DB_USER`: Database username  
- `DB_PASSWORD`: Database password

## Build and Deployment

### Development Workflow
```bash
npm run dev          # Start development server with hot reload
npm run reload       # Manual restart with environment loading
npm run build        # Production build with asset copying
```

### Docker Support
```bash
npm run infra:dev    # Docker Compose development environment
npm run infra:build  # Watch mode TypeScript compilation
```

### Build Process
1. **TypeScript Compilation**: `tsc` → `dist/` directory
2. **Asset Copying**: HTML, MD files → `dist/nodes/`
3. **Clean Builds**: `rimraf` removes old builds

## API Architecture

### HTTP Server
- **Port**: Configurable (default: 4000)
- **Middleware**: CORS, body-parser
- **Routing**: Express-based with dynamic registration

### MCP Server
- **Transport**: stdio (for Claude Desktop)
- **Protocol**: JSON-RPC
- **Tools**: Dynamic registration from nodes/workflows

### Node Execution
- **Context**: Request/response simulation
- **Validation**: JSON Schema for inputs/outputs
- **Error Handling**: Standardized error responses

## Security Considerations

### API Keys
- OpenAI API key via environment variables
- No hardcoded credentials in source code

### Database Access
- Parameterized queries to prevent SQL injection
- Connection pooling for resource management
- Environment-based configuration

### Input Validation
- JSON Schema validation for all node inputs
- Type checking via TypeScript
- Runtime validation in nanoservice framework

## Performance Characteristics

### Cold Start
- Application initialization metrics
- Node registry population time
- MCP server startup latency

### Query Processing
- SQL generation latency (AI-dependent)
- Database query execution time
- Response serialization overhead

### Scalability
- Stateless node architecture
- Connection pooling for database
- Horizontal scaling via containerization 
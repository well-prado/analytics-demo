# System Patterns: MCP Nanoservice Architecture

## Core Architecture Patterns

### 1. MCP Server Integration
**Pattern**: `mcp-entry.ts` serves as the bridge between Claude Desktop and nanoservice infrastructure
- **Entry Point**: Stdio transport for MCP communication
- **Tool Discovery**: Dynamic registration of nodes and workflows as MCP tools
- **Execution**: HTTP calls to nanoservice endpoints based on tool invocations

### 2. Node Registry System
**Pattern**: Global registry manages all available nanoservice nodes
```typescript
// MCPRegistry.ts - Central node management
global.nodeRegistry: Record<string, NanoService<any>>
```
- **Registration**: Automatic discovery from `src/nodes/` directory
- **Conversion**: Nodes transformed to MCP tools via `NodeToMCPAdapter`
- **Execution**: Runtime invocation through context-aware handlers

### 3. Workflow-to-MCP Conversion
**Pattern**: JSON workflows become callable MCP tools
- **Discovery**: Scans `workflows/json/` for workflow definitions
- **Schema Extraction**: Generates MCP schemas from workflow triggers
- **HTTP Method Mapping**: Preserves REST semantics (GET, POST, etc.)

### 4. Dynamic Tool Generation
**Current Implementation**: `NodeToMCPAdapter.convertNodesToMCPTools()`
- **Schema Mapping**: JSON Schema → MCP Tool Schema
- **Implementation Code**: Generated JavaScript execution context
- **Context Creation**: Simulates workflow execution environment

### 5. Workflow Chaining Pattern
**Pattern**: `WorkflowChainer` enables tool composition
- **Sequence Execution**: Chain multiple nodes/workflows
- **Data Flow**: Output of one tool becomes input of next
- **Error Handling**: Graceful failure with error propagation

## Current Node Patterns

### Base Node Structure
```typescript
export default class ExampleNode extends NanoService<InputType> {
  inputSchema: JSONSchema7  // Input validation
  outputSchema: JSONSchema7 // Output validation
  handle(ctx: Context, inputs: InputType): Promise<INanoServiceResponse>
}
```

### Database Node Pattern
**Example**: `postgres-query/index.ts`
- **Connection Management**: Client creation and cleanup
- **Query Execution**: Parameterized queries
- **Result Formatting**: Standardized response structure

### UI Node Pattern  
**Example**: `database-ui/index.ts`
- **Content Type**: `text/html` for web interfaces
- **Template Rendering**: EJS for dynamic content
- **Static Assets**: Bundled HTML/CSS/JS

### AI Integration Pattern
**Example**: `QueryGeneratorNode.ts`
- **Provider**: OpenAI integration via `@ai-sdk/openai`
- **Prompt Engineering**: Structured prompts for SQL generation
- **Context Passing**: Variable sharing between nodes

## Workflow Execution Patterns

### HTTP Trigger Pattern
```json
{
  "trigger": {
    "http": {
      "method": "*",
      "path": "/:function?",
      "accept": "application/json"
    }
  }
}
```

### Conditional Logic Pattern
**Example**: `db-manager.json` uses `@nanoservice-ts/if-else`
- **Method Routing**: GET/POST handling
- **Parameter-based Logic**: URL parameter conditions
- **Fallback Handling**: Default error responses

### Data Flow Pattern
- **Context Variables**: `ctx.vars` for inter-node communication
- **Response Chaining**: Previous node output as next node input
- **Error Propagation**: Standardized error handling

## Design Principles

### 1. Dynamic Configuration
- No hardcoded values in workflow definitions
- Environment-based configuration
- Runtime parameter resolution

### 2. Reusability
- Nodes are workflow-agnostic
- Common patterns extracted to base classes
- Shared utilities and helpers

### 3. Type Safety
- TypeScript throughout the stack
- JSON Schema validation for all inputs/outputs
- Compile-time error detection

### 4. Error Handling
- Consistent error response format
- Graceful degradation
- Detailed error logging and tracing

### 5. Observability
- OpenTelemetry integration
- Performance metrics collection
- Distributed tracing support 
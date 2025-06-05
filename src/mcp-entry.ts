#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";

// Create logging
// Use the directory where the script is located, not the root
const projectDir = process.env.PROJECT_DIR || process.cwd();
const logDir = path.join(projectDir, "logs");

try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (error) {
  // If we can't create the log directory, log to stderr only
  console.error(`[${new Date().toISOString()}] Unable to create log directory: ${error}`);
}

// Setup logging function that works even without a log file
function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  // Always log to stderr
  fs.writeSync(process.stderr.fd, logMessage + "\n");
  
  // Try to log to file if possible
  try {
    if (!fs.existsSync(logDir)) {
      return; // Skip file logging if directory doesn't exist
    }
    
    const logFilePath = path.join(logDir, "mcp-entry.log");
    fs.appendFileSync(logFilePath, logMessage + "\n");
  } catch (error) {
    // Silently fail on file logging errors
    fs.writeSync(process.stderr.fd, `[${timestamp}] Error writing to log file: ${error}\n`);
  }
}

// Environment variables
const nanoserviceUrl = process.env.NANOSERVICE_BASE_URL || "http://localhost:4000";
log(`Using nanoservice URL: ${nanoserviceUrl}`);

// Simple dictionary to store tools by name
let availableTools: any[] = [];

// Create server
const server = new Server(
  {
    name: "nanoservice",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Fetch all available workflows and tools
async function fetchAvailableTools(): Promise<any[]> {
  try {
    log("Fetching tools from nanoservice...");
    
    // First try the auto-mcp-server endpoint which should have all tools and workflows
    try {
      // Add mode=node_first param to prioritize nodes over workflows
      const response = await fetch(`${nanoserviceUrl}/auto-mcp-server/tools?mode=node_first`);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      const data = await response.json();
      availableTools = data.tools || [];
      log(`Found ${availableTools.length} tools via auto-mcp-server endpoint (node-first mode)`);
      return availableTools;
    } catch (error: any) {
      log(`Auto-MCP endpoint failed: ${error.message}, trying fallback endpoint...`);
      
      // Fallback to /tools endpoint
      try {
        const response = await fetch(`${nanoserviceUrl}/tools`);
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        availableTools = data.tools || [];
        log(`Found ${availableTools.length} tools via base /tools endpoint`);
        return availableTools;
      } catch (error: any) {
        log(`Tools endpoint failed: ${error.message}`);
        
        // Try to get nodes directly first
        try {
          log("Attempting to fetch nodes directly...");
          const response = await fetch(`${nanoserviceUrl}/nodes`);
          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
          }
          const nodes = await response.json() || [];
          
          // Convert nodes to tool format
          const nodeTools = nodes.map((node: any) => ({
            name: node.name,
            description: node.description || `Node: ${node.name}`,
            schema: node.schema || {}
          }));
          
          log(`Found ${nodeTools.length} nodes directly`);
          availableTools = nodeTools;
          
          // Then try to add workflows
          try {
            const workflowResponse = await fetch(`${nanoserviceUrl}/workflows`);
            if (!workflowResponse.ok) {
              throw new Error(`HTTP error: ${workflowResponse.status}`);
            }
            const workflows = await workflowResponse.json() || [];
            
            // Convert workflows to tool format
            const workflowTools = workflows.map((workflow: any) => ({
              name: workflow.path,
              description: workflow.description || `Workflow: ${workflow.path}`,
              schema: workflow.schema || {}
            }));
            
            log(`Found ${workflowTools.length} workflows directly`);
            
            // Add workflows that don't clash with node names
            const nodeNames = new Set(nodeTools.map((tool: any) => tool.name.toLowerCase()));
            const uniqueWorkflows = workflowTools.filter((tool: any) => 
              !nodeNames.has(tool.name.toLowerCase())
            );
            
            log(`Adding ${uniqueWorkflows.length} unique workflows (prioritizing nodes)`);
            availableTools = [...nodeTools, ...uniqueWorkflows];
            return availableTools;
          } catch (error: any) {
            log(`Workflows endpoint failed: ${error.message}`);
            return nodeTools; // Return just the nodes if workflows fail
          }
        } catch (error: any) {
          log(`Nodes endpoint failed: ${error.message}`);
          
          // Final attempt - directly query workflows if possible
          try {
            const response = await fetch(`${nanoserviceUrl}/workflows`);
            if (!response.ok) {
              throw new Error(`HTTP error: ${response.status}`);
            }
            const workflows = await response.json() || [];
            
            // Convert workflows to tool format
            availableTools = workflows.map((workflow: any) => ({
              name: workflow.path,
              description: workflow.description || `Workflow: ${workflow.path}`,
              schema: workflow.schema || {}
            }));
            
            log(`Found ${availableTools.length} workflows directly`);
            return availableTools;
          } catch (error: any) {
            log(`Workflows endpoint failed: ${error.message}`);
            
            // If all endpoints fail, return an empty array
            return [];
          }
        }
      }
    }
  } catch (error) {
    log(`Error fetching tools: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Fetch the latest tools
  const tools = await fetchAvailableTools();
  
  // Log all tools for debugging
  tools.forEach(tool => {
    log(`Available tool: ${tool.name} - ${tool.description}`);
  });
  
  // Convert tools to MCP format
  return {
    tools: tools.map(tool => {
      // Preserve the original tool name exactly as provided by the server
      const schema = tool.schema || {};
      
      return {
        name: tool.name,
        description: tool.description || `Tool: ${tool.name}`,
        inputSchema: {
          type: "object",
          properties: Object.entries(schema).reduce((acc: any, [key, val]: [string, any]) => {
            acc[key] = {
              type: "string",
              description: val.description || `Parameter: ${key}`
            };
            return acc;
          }, {}),
          required: Object.keys(schema)
        }
      };
    })
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args = {} } = request.params;
    log(`Executing tool: ${name} with args: ${JSON.stringify(args)}`);
    
    // Find the tool from our available tools list
    const tool = availableTools.find(t => t.name === name);
    
    if (!tool) {
      // If tool not found, refresh tool list and try again
      await fetchAvailableTools();
      const refreshedTool = availableTools.find(t => t.name === name);
      
      if (!refreshedTool) {
        throw new Error(`Tool not found: ${name}`);
      }
    }
    
    // Special handling for chain_tools which allows workflow composition
    if (name === 'chain_tools') {
      log(`Executing chain_tools with sequence: ${JSON.stringify(args.tool_sequence)}`);
      
      // Execute each tool in sequence
      const toolSequence = Array.isArray(args.tool_sequence) ? args.tool_sequence : [];
      const initialInput = args.initial_input || {};
      
      if (toolSequence.length === 0) {
        throw new Error("No tools specified in the sequence");
      }
      
      let currentInput = initialInput;
      let finalResult: any = null;
      
      // Execute each tool in sequence
      for (const sequenceTool of toolSequence) {
        log(`Chain executing tool: ${sequenceTool}`);
        
        // Call the tool directly
        const toolResponse = await fetch(`${nanoserviceUrl}/auto-mcp-server/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: sequenceTool,
            parameters: currentInput
          })
        });
        
        if (!toolResponse.ok) {
          throw new Error(`Tool execution failed with status: ${toolResponse.status}`);
        }
        
        // Extract result and use as input for next tool
        const responseData = await toolResponse.json();
        finalResult = responseData?.result || responseData;
        currentInput = finalResult;
      }
      
      return {
        content: [
          {
            type: "text",
            text: typeof finalResult === "string" 
              ? finalResult 
              : JSON.stringify(finalResult, null, 2)
          }
        ]
      };
    }
    
    // Get the HTTP method for this tool (default to POST if not specified)
    const httpMethod = (tool.httpMethod || 'POST').toLowerCase();
    log(`Using HTTP method: ${httpMethod} for tool: ${name}`);
    
    // Call the nanoservice API using the appropriate HTTP method
    log(`Calling endpoint: ${nanoserviceUrl}/${name} with method: ${httpMethod}`);
    let response;
    
    switch (httpMethod) {
      case 'get':
        // For GET requests, convert args to query parameters
        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(args)) {
          if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
          }
        }
        const queryString = queryParams.toString();
        response = await fetch(`${nanoserviceUrl}/${name}${queryString ? '?' + queryString : ''}`);
        break;
      
      case 'delete':
        response = await fetch(`${nanoserviceUrl}/${name}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(args)
        });
        break;
      
      case 'put':
        response = await fetch(`${nanoserviceUrl}/${name}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(args)
        });
        break;
      
      case 'patch':
        response = await fetch(`${nanoserviceUrl}/${name}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(args)
        });
        break;
      
      case 'post':
      default:
        // Default to POST for backward compatibility
        response = await fetch(`${nanoserviceUrl}/${name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(args)
        });
        break;
    }
    
    if (!response.ok) {
      throw new Error(`Request failed with status: ${response.status}`);
    }
    
    const responseData = await response.json();
    
    return {
      content: [
        {
          type: "text",
          text: typeof responseData === "string" 
            ? responseData 
            : JSON.stringify(responseData, null, 2)
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error executing tool: ${errorMessage}`);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function runServer() {
  log("Starting MCP server...");
  
  // Pre-fetch tools to establish initial availability
  await fetchAvailableTools();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio transport");
}

// Handle errors
process.on("uncaughtException", (error) => {
  log(`Uncaught exception: ${error.message}\n${error.stack}`);
});

process.on("unhandledRejection", (reason) => {
  log(`Unhandled rejection: ${reason}`);
});

// Start the server
runServer().catch((error) => {
  log(`Fatal error running server: ${error.message}`);
  process.exit(1);
});
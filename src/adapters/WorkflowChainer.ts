import { NanoServiceResponse } from "@nanoservice-ts/runner";
import path from "node:path";
import { MCPTool } from "./NodeToMCPAdapter";
import fs from "fs";
import { NodeToMCPAdapter } from "./NodeToMCPAdapter";

/**
 * Custom context interface compatible with the nanoservice context structure
 */
interface WorkflowContext {
  request: {
    body: any;
    method: string;
    headers: Record<string, any>;
    query: Record<string, any>;
    params: Record<string, any>;
  };
  response: {
    data: any;
    error: any;
  };
  vars: Record<string, any>;
}

/**
 * WorkflowChainer - Provides utilities for chaining nodes and workflows
 * This adapter helps with executing workflows in sequence when the MCP client
 * needs to chain multiple operations.
 */
export class WorkflowChainer {
  /**
   * Execute a sequence of nodes based on the inputs
   * @param nodeSequence Array of node names to execute in sequence
   * @param initialInputs The initial inputs to the first node
   */
  static async executeNodeSequence(
    nodeSequence: string[],
    initialInputs: Record<string, any>
  ): Promise<any> {
    if (!nodeSequence.length) {
      return { error: "No nodes specified for sequence execution" };
    }
    
    let currentInputs = { ...initialInputs };
    let finalResult: any = null;
    
    // Execute each node in sequence, passing outputs as inputs to the next
    for (const nodeName of nodeSequence) {
      try {
        const node = global.nodeRegistry[nodeName];
        
        if (!node) {
          throw new Error(`Node not found: ${nodeName}`);
        }
        
        // Create a basic context using our compatible interface
        const context: WorkflowContext = {
          request: {
            body: currentInputs,
            method: "POST",
            headers: {},
            query: {},
            params: {}
          },
          response: { 
            data: {},
            error: null
          },
          vars: {}
        };
        
        // Execute the node
        const result = await node.handle(context as any, currentInputs);
        
        // Extract result data
        if (result instanceof NanoServiceResponse) {
          finalResult = result.data;
          
          // Check for error
          if (result.error) {
            throw new Error(`Error in node ${nodeName}: ${result.error.message}`);
          }
        } else {
          finalResult = result;
        }
        
        // Use result as input for next node
        currentInputs = typeof finalResult === 'object' ? { ...finalResult } : { result: finalResult };
      } catch (error) {
        return { error: `Error in node sequence at ${nodeName}: ${(error as Error).message}` };
      }
    }
    
    return finalResult;
  }

  /**
   * Create an MCP tool that represents a node sequence
   * @param name Name for the chained tool
   * @param description Description of what the tool does
   * @param nodeSequence Array of node names to execute in sequence
   * @param inputSchema Schema for the inputs to the first node
   */
  static createNodeSequenceTool(
    name: string,
    description: string,
    nodeSequence: string[],
    inputSchema: Record<string, any>
  ): MCPTool {
    return {
      name,
      description,
      schema: inputSchema,
      implementation: `
        try {
          const WorkflowChainer = require('${path.resolve(__dirname, 'WorkflowChainer.js')}').WorkflowChainer;
          const result = await WorkflowChainer.executeNodeSequence(
            ${JSON.stringify(nodeSequence)},
            inputs
          );
          return result;
        } catch (error) {
          console.error("Error executing node sequence:", error);
          return { error: error.message };
        }
      `
    };
  }

  /**
   * Discover workflows and convert them to node sequence tools
   * This allows workflows to be used as building blocks for MCP tools
   */
  static async discoverNodeSequencesFromWorkflows(
    workflowsDir: string = path.resolve(process.cwd(), "workflows"),
    options: { excludeWorkflows?: string[] } = {}
  ): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];
    const { excludeWorkflows = [] } = options;
    
    try {
      // Get workflows directly from the filesystem instead of API
      const jsonDir = path.join(workflowsDir, 'json');
      
      // Check if the directory exists
      if (!fs.existsSync(jsonDir)) {
        console.warn(`Workflow directory not found: ${jsonDir}`);
        return tools;
      }
      
      // Read all JSON files in the directory
      const files = fs.readdirSync(jsonDir).filter(file => file.endsWith('.json'));
      console.log(`Found ${files.length} potential workflow files in ${jsonDir}`);
      
      for (const file of files) {
        try {
          // Skip excluded workflows
          if (excludeWorkflows.includes(file.replace(/\.json$/, ''))) {
            console.log(`Skipping excluded workflow: ${file}`);
            continue;
          }
          
          const filePath = path.join(jsonDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const workflow = JSON.parse(content);
          
          // Skip workflows with no HTTP trigger
          if (!workflow.trigger?.http) {
            console.log(`Skipping workflow ${file}: No HTTP trigger`);
            continue;
          }
          
          // Extract workflow information
          const workflowName = file.replace(/\.json$/, '');
          const workflowPath = `/${workflowName}`;
          const httpMethod = workflow.trigger.http.method || 'POST';
          
          // Use the enhanced schema extraction from NodeToMCPAdapter
          const schema = NodeToMCPAdapter.extractSchemaFromWorkflow(workflow);
          
          // Create a tool that uses the workflow
          const tool: MCPTool = {
            name: this.sanitizeToolName(workflowName),
            description: workflow.description || `Workflow: ${workflowName}`,
            httpMethod: httpMethod === '*' ? 'GET' : httpMethod.toUpperCase(), // Default to GET for wildcard
            schema: schema,
            implementation: `
              try {
                const axios = require('axios');
                const baseUrl = process.env.NANOSERVICE_BASE_URL || 'http://localhost:4000';
                const url = \`\${baseUrl}${workflowPath}\`;
                const method = '${httpMethod === '*' ? 'GET' : httpMethod.toLowerCase()}';
                
                let response;
                if (method === 'get') {
                  // For GET, convert inputs to query params
                  const queryParams = new URLSearchParams(inputs.data || inputs).toString();
                  response = await axios.get(url + (queryParams ? '?' + queryParams : ''));
                } else {
                  // For other methods, use the appropriate axios method
                  response = await axios[method](url, inputs.data || inputs);
                }
                
                return response.data;
              } catch (error) {
                throw new Error(\`Error executing workflow ${workflowName}: \${error.message}\`);
              }
            `
          };
          
          tools.push(tool);
          console.log(`Added workflow as tool: ${workflowName} (HTTP method: ${tool.httpMethod})`);
        } catch (error) {
          console.error(`Error processing workflow file ${file}:`, error);
        }
      }
    } catch (error) {
      console.error("Error discovering workflows from filesystem:", error);
    }
    
    return tools;
  }

  /**
   * Create a tool that can chain multiple other tools together
   */
  static createChainExecutorTool(): MCPTool {
    return {
      name: "chain_tools",
      description: "Chain multiple tools together, passing the output of one tool as input to the next. This is useful for complex operations that require multiple steps.",
      schema: {
        tool_sequence: {
          type: { type: "array" },
          description: "Array of tool names to execute in sequence"
        },
        initial_input: {
          type: { type: "object" },
          description: "The input data for the first tool in the sequence"
        }
      },
      implementation: `
        try {
          if (!inputs.tool_sequence || !Array.isArray(inputs.tool_sequence) || inputs.tool_sequence.length === 0) {
            throw new Error("No tools specified in the sequence");
          }
          
          const axios = require('axios');
          const baseUrl = process.env.NANOSERVICE_BASE_URL || 'http://localhost:4000';
          let currentInput = inputs.initial_input || {};
          let finalResult = null;
          
          for (const toolName of inputs.tool_sequence) {
            const executeUrl = \`\${baseUrl}/auto-mcp-server/execute\`;
            
            const response = await axios.post(executeUrl, {
              name: toolName,
              parameters: currentInput
            });
            
            finalResult = response.data?.result || response.data;
            currentInput = finalResult;
          }
          
          return {
            result: finalResult,
            chained_tools: inputs.tool_sequence
          };
        } catch (error) {
          return { error: error.message };
        }
      `
    };
  }
  
  /**
   * Sanitize a name to be used as a tool name
   */
  private static sanitizeToolName(name: string): string {
    // Remove special characters but preserve hyphens and underscores
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  }
} 
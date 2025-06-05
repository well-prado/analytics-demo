import { NanoService } from "@nanoservice-ts/runner";
import fs from "node:fs";
import path from "node:path";

/**
 * Interface for MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  schema: Record<string, any>;
  implementation: string;
  httpMethod?: string;
}

/**
 * Adapter that converts nanoservice nodes to MCP tools
 */
export class NodeToMCPAdapter {
  /**
   * Convert a node registry to MCP tools
   */
  static convertNodesToMCPTools(
    nodeRegistry: Record<string, NanoService<any>>,
    options: {
      excludeNodes?: string[];
    } = {}
  ): MCPTool[] {
    const { excludeNodes = [] } = options;
    
    return Object.entries(nodeRegistry)
      .filter(([name]) => !excludeNodes.includes(name))
      .map(([name, node]) => {
        return {
          name,
          description: this.generateNodeDescription(name, node),
          schema: this.convertInputSchemaToMCPSchema(node.inputSchema),
          implementation: this.generateNodeImplementation(name)
        };
      });
  }

  /**
   * Generate a description for a node
   */
  private static generateNodeDescription(name: string, node: NanoService<any>): string {
    // Try to extract description from JSDoc or node properties
    // For now, use a simple description
    return `Nanoservice node: ${name}`;
  }

  /**
   * Convert a node's JSON Schema to MCP schema format
   */
  private static convertInputSchemaToMCPSchema(schema: any): Record<string, any> {
    if (!schema || !schema.properties) {
      return {};
    }

    const result: Record<string, any> = {};
    
    // Convert each property in the schema
    Object.entries(schema.properties).forEach(([propName, propSchema]: [string, any]) => {
      result[propName] = {
        type: {
          type: propSchema.type || "string"
        },
        description: propSchema.description || `Parameter: ${propName}`
      };
    });
    
    return result;
  }

  /**
   * Generate implementation code for invoking a node
   */
  private static generateNodeImplementation(nodeName: string): string {
    return `
      const nodeRegistry = global.nodeRegistry || {};
      const node = nodeRegistry["${nodeName}"];
      
      if (!node) {
        throw new Error("Node not found: ${nodeName}");
      }
      
      // Create a context object similar to what the workflow runner would create
      const context = { 
        id: inputs.context?.client?.id || inputs.context?.operation || 'mcp-execution',
        request: { 
          body: inputs,
          method: inputs.context?.method || "POST",
          headers: inputs.context?.headers || {},
          query: inputs.context?.query || {},
          params: inputs.context?.params || {}
        },
        response: { data: {} },
        vars: {},
        error: {},
        logger: console,
        config: {},
        eventLogger: console
      };
      
      try {
        // Remove context from inputs to avoid circular references
        const nodeInputs = { ...inputs };
        if (nodeInputs.context) {
          delete nodeInputs.context;
        }
        
        // Call the node's handle method with the context and inputs
        const response = await node.handle(context, nodeInputs);
        
        // Return the response data
        return response.data || response.content || {};
      } catch (error) {
        throw new Error(\`Error executing node ${nodeName}: \${error.message}\`);
      }
    `;
  }

  /**
   * Discover all nodes from the src/nodes directory
   */
  static async discoverNodesFromDirectory(
    baseDir: string = path.resolve(process.cwd(), "src/nodes")
  ): Promise<Record<string, NanoService<any>>> {
    const nodeRegistry: Record<string, NanoService<any>> = {};
    
    // Helper function to recursively scan directories
    const scanDir = async (dir: string, registry: Record<string, NanoService<any>>) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await scanDir(fullPath, registry);
        } else if (entry.name === "index.ts" || entry.name === "index.js") {
          try {
            // Import the node module
            const module = await import(fullPath);
            
            // If the module exports a default that extends NanoService, add it to registry
            if (module.default && module.default.prototype instanceof NanoService) {
              const nodeName = path.basename(dir);
              registry[nodeName] = new module.default();
            }
            // If the module exports multiple nodes
            else if (typeof module.default === "object") {
              Object.entries(module.default).forEach(([name, NodeClass]: [string, any]) => {
                if (NodeClass.prototype instanceof NanoService) {
                  registry[name] = new NodeClass();
                }
              });
            }
          } catch (error) {
            console.error(`Error importing node from ${fullPath}:`, error);
          }
        }
      }
    };
    
    await scanDir(baseDir, nodeRegistry);
    return nodeRegistry;
  }

  /**
   * Discover workflows from multiple formats (JSON, TOML, YAML)
   */
  static discoverWorkflowsAsMCPTools(
    workflowsDir: string = path.resolve(process.cwd(), "workflows"),
    options: {
      excludeWorkflows?: string[];
    } = {}
  ): MCPTool[] {
    const { excludeWorkflows = [] } = options;
    const tools: MCPTool[] = [];
    
    // Process different format directories
    const formats = [
      { dir: "json", parse: JSON.parse, ext: ".json" },
    ];
    
    for (const format of formats) {
      const formatDir = path.join(workflowsDir, format.dir);
      
      if (!fs.existsSync(formatDir)) {
        console.log(`Workflow directory not found: ${formatDir}`);
        continue;
      }
      
      // Read all files with the specific extension
      const workflowFiles = fs.readdirSync(formatDir)
        .filter(file => file.endsWith(format.ext))
        .filter(file => !excludeWorkflows.includes(file.replace(format.ext, "")));
      
      console.log(`Found ${workflowFiles.length} workflow files in ${formatDir}`);
      
      for (const file of workflowFiles) {
        try {
          const filePath = path.join(formatDir, file);
          const content = fs.readFileSync(filePath, "utf8");
          const workflow = format.parse(content);
          
          // Extract workflow information
          const name = workflow.name || file.replace(format.ext, "");
          const description = workflow.description || `Workflow: ${name}`;
          
          // Skip workflows with no HTTP trigger
          if (!workflow.trigger?.http) {
            console.log(`Skipping workflow ${file}: No HTTP trigger`);
            continue;
          }
          
          // Extract HTTP method information
          const httpMethod = workflow.trigger.http.method || 'POST';
          // Default to GET for wildcard (*) method
          const normalizedMethod = httpMethod === '*' ? 'GET' : httpMethod.toUpperCase();
          
          // Generate schema based on workflow trigger and steps
          const schema = this.extractSchemaFromWorkflow(workflow);
          
          // Generate implementation that calls the workflow with correct HTTP method
          const implementation = this.generateWorkflowImplementation(
            file.replace(format.ext, ""),
            normalizedMethod
          );
          
          tools.push({
            name: this.sanitizeToolName(file.replace(format.ext, "")),
            description,
            schema,
            httpMethod: normalizedMethod,
            implementation
          });
          
          console.log(`Added workflow as tool: ${file.replace(format.ext, "")} (HTTP Method: ${normalizedMethod})`);
        } catch (error) {
          console.error(`Error processing workflow ${file}:`, error);
        }
      }
    }
    
    return tools;
  }

  /**
   * Extract schema from a workflow
   */
  static extractSchemaFromWorkflow(workflow: any): Record<string, any> {
    // If workflow has an inputSchema field, use it
    if (workflow.inputSchema && workflow.inputSchema.properties) {
      const schema: Record<string, any> = {};
      
      // Convert workflow inputSchema to MCP schema format
      Object.entries(workflow.inputSchema.properties).forEach(([propName, propSchema]: [string, any]) => {
        schema[propName] = {
          type: { type: propSchema.type || "string" },
          description: propSchema.description || `Parameter: ${propName}`
        };
      });
      
      return schema;
    }
    
    // Fallback to original schema extraction logic
    const schema: Record<string, any> = {};
    
    // If workflow has HTTP trigger with path parameters, extract them
    if (workflow.trigger?.http?.path) {
      const pathParams = this.extractPathParams(workflow.trigger.http.path);
      
      pathParams.forEach(param => {
        schema[param.name] = {
          type: { type: "string" },
          description: `Path parameter: ${param.name}`
        };
      });
    }
    
    // For workflows without inputSchema, add a generic 'data' parameter for request body
    schema.data = {
      type: { type: "object" },
      description: "Data to send to the workflow"
    };
    
    return schema;
  }

  /**
   * Extract path parameters from an HTTP path
   */
  private static extractPathParams(path: string): { name: string, required: boolean }[] {
    const params: { name: string, required: boolean }[] = [];
    const regex = /:([a-zA-Z0-9_]+)(\?)?/g;
    let match;
    
    while ((match = regex.exec(path)) !== null) {
      params.push({
        name: match[1],
        required: !match[2] // If there's a '?' after the param, it's optional
      });
    }
    
    return params;
  }

  /**
   * Generate implementation code for invoking a workflow
   */
  private static generateWorkflowImplementation(workflowName: string, httpMethod: string = 'POST'): string {
    const methodLower = httpMethod.toLowerCase();
    
    return `
      // This function will invoke the workflow via HTTP with method: ${httpMethod}
      const axios = require('axios');
      
      try {
        // Construct the URL for the workflow
        const baseUrl = process.env.NANOSERVICE_BASE_URL || 'http://localhost:4000';
        const url = \`\${baseUrl}/${workflowName}\`;
        
        ${methodLower === 'get' ? `
        // For GET requests, parameters become query parameters
        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(inputs.data || inputs)) {
          if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
          }
        }
        const queryString = queryParams.toString();
        const response = await axios.get(url + (queryString ? '?' + queryString : ''));
        ` : `
        // Send request to the workflow using ${methodLower} method
        const response = await axios.${methodLower}(url, inputs.data || inputs);
        `}
        
        // Return the response data
        return response.data;
      } catch (error) {
        throw new Error(\`Error executing workflow ${workflowName}: \${error.message}\`);
      }
    `;
  }

  /**
   * Sanitize a name to be used as a tool name
   */
  private static sanitizeToolName(name: string): string {
    // Remove special characters but preserve hyphens and underscores
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  }
} 
import {
	type INanoServiceResponse,
	NanoService,
	NanoServiceResponse,
} from "@nanoservice-ts/runner";
import { type Context, GlobalError } from "@nanoservice-ts/shared";
import { MCPRegistry } from "../../../adapters/MCPRegistry";
import { MCPTool } from "../../../adapters/NodeToMCPAdapter";
import { MCPRequestContext } from "../../../runner/types/mcp";

// Input type for the MCP server node
export interface InputType {
	context: MCPRequestContext;
	tools?: MCPTool[];
	excluded_nodes?: string[];
	excluded_workflows?: string[];
	workflows_directory?: string;
	debug_mode?: boolean;
	discover_nodes?: boolean;
	discover_workflows?: boolean;
}

/**
 * StatelessMCPNode - A revolutionary implementation of the Model Context Protocol
 * that operates in a completely stateless manner, compatible with nanoservice architecture.
 * 
 * This node implements the core MCP protocol without requiring a persistent server.
 */
export default class StatelessMCPNode extends NanoService<InputType> {
	constructor() {
		super();
		this.inputSchema = {
			type: "object",
			properties: {
				tools: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							description: { type: "string" },
							schema: { type: "object" },
							implementation: { type: "string" }
						},
						required: ["name", "description", "schema", "implementation"]
					}
				},
				debug_mode: { type: "boolean" },
				discover_workflows: { type: "boolean" },
				workflows_directory: { type: "string" },
				excluded_workflows: { 
					type: "array",
					items: { type: "string" }
				},
				excluded_nodes: { 
					type: "array",
					items: { type: "string" }
				}
			}
		};
	}

	/**
	 * Handle MCP requests in a stateless manner
	 * This method processes each request independently, with no server state
	 */
	async handle(ctx: Context, inputs: InputType): Promise<INanoServiceResponse> {
		const response = new NanoServiceResponse();

		try {
			// Extract the path from request to determine MCP operation
			const path = ctx.request.params.mcp_operation || '';
			const debug = inputs.debug_mode || false;

			// Log request in debug mode
			if (debug) {
				console.log(`MCP Request: ${path}`, {
					method: ctx.request.method,
					body: ctx.request.body,
					params: ctx.request.params
				});
			}

			// Get all available tools
			const allTools = await this.getAllTools(inputs);

			// Handle different MCP operations
			switch (path) {
				case 'tools':
					// List available tools
					return this.handleToolsRequest(allTools);
				
				case 'execute':
					// Execute a specific tool
					return this.handleExecuteRequest(ctx, allTools);
				
				default:
					// Handle root MCP endpoint (protocol info)
					return this.handleInfoRequest(allTools);
			}
		} catch (error: unknown) {
			// Error handling
			const nodeError = new GlobalError((error as Error).message);
			nodeError.setCode(500);
			nodeError.setStack((error as Error).stack);
			nodeError.setName(this.name);

			response.setError(nodeError);
			return response;
		}
	}

	/**
	 * Get all tools from various sources
	 */
	private async getAllTools(inputs: InputType): Promise<MCPTool[]> {
		// Start with manually defined tools
		let allTools: MCPTool[] = inputs.tools || [];
		
		const debug = inputs.debug_mode || false;
		if (debug) {
			console.log(`[MCP] Starting tool discovery...`);
		}
		
		// Use the improved fetchAvailableTools method for better error handling
		if (MCPRegistry) {
			try {
				const discoveredTools = await MCPRegistry.fetchAvailableTools({
					excludeNodes: inputs.excluded_nodes,
					workflowsDir: inputs.workflows_directory,
					excludeWorkflows: inputs.excluded_workflows,
					prioritizeNodes: true,  // Prioritize nodes over workflows
					includeChainTool: !(inputs.excluded_workflows || []).includes('chain-tools'),  // Only include chain_tools if not excluded
					discover_nodes: inputs.discover_nodes !== false, // Enable node discovery by default
					discover_workflows: inputs.discover_workflows === true // Explicitly enable workflow discovery
				});
				
				if (debug) {
					console.log(`[MCP] Found ${discoveredTools.length} tools from all sources`);
					if (inputs.discover_nodes !== false) {
						console.log(`[MCP] - Node discovery is enabled`);
					}
					if (inputs.discover_workflows === true) {
						console.log(`[MCP] - Workflow discovery is enabled`);
					}
					console.log(`[MCP] - Node tools have priority over workflow tools`);
				}
				
				allTools = [...allTools, ...discoveredTools];
			} catch (error) {
				console.error(`[MCP] Error during tool discovery:`, error);
				// Continue with any tools we already have
				if (debug) {
					console.log(`[MCP] Continuing with ${allTools.length} manually defined tools despite discovery error`);
				}
			}
		}
		
		// Add or replace the weather tool with our enhanced version
		// Only add if not in the excluded_workflows list
		if (!(inputs.excluded_workflows || []).includes('weather')) {
			const weatherToolIndex = allTools.findIndex(tool => 
				tool.name.toLowerCase().includes('weather')
			);
			
			// Create the enhanced weather tool
			const enhancedWeatherTool = this.convertWeatherToolToMCP();
			
			if (weatherToolIndex !== -1) {
				// Replace existing weather tool
				allTools[weatherToolIndex] = enhancedWeatherTool;
				if (debug) {
					console.log(`[MCP] Replaced existing weather tool with enhanced version`);
				}
			} else {
				// Add new weather tool
				allTools.push(enhancedWeatherTool);
				if (debug) {
					console.log(`[MCP] Added enhanced weather tool`);
				}
			}
		} else if (debug) {
			console.log(`[MCP] Skipping weather tool (in excluded_workflows list)`);
		}
		
		// Add the specialized tool for listing all available tools
		// Only add if not in the excluded_workflows list
		if (!(inputs.excluded_workflows || []).includes('list_available_tools')) {
			const listToolsTool = this.createListToolsTool();
			
			// Replace existing list_tools tool or add new one
			const listToolsIndex = allTools.findIndex(tool => 
				tool.name === 'list_available_tools'
			);
			
			if (listToolsIndex !== -1) {
				allTools[listToolsIndex] = listToolsTool;
				if (debug) {
					console.log(`[MCP] Replaced existing list_available_tools tool`);
				}
			} else {
				allTools.push(listToolsTool);
				if (debug) {
					console.log(`[MCP] Added specialized list_available_tools tool`);
				}
			}
		} else if (debug) {
			console.log(`[MCP] Skipping list_available_tools tool (in excluded_workflows list)`);
		}
		
		// Add node-to-workflow debugger tool
		// const debuggerTool = this.createNodeDebuggerTool();
		// allTools.push(debuggerTool);
		
		if (debug) {
			console.log(`[MCP] Total tools available: ${allTools.length}`);
			allTools.forEach(tool => {
				console.log(`[MCP] - ${tool.name}: ${tool.description}`);
			});
		}
		
		return allTools;
	}

	/**
	 * Handle requests to the /tools endpoint
	 * Lists all available tools and their schemas
	 */
	private handleToolsRequest(tools: MCPTool[]): INanoServiceResponse {
		const response = new NanoServiceResponse();

		const toolsData = tools.map(tool => ({
			name: tool.name,
			description: tool.description,
			schema: tool.schema,
			httpMethod: tool.httpMethod || "POST"
		}));

		response.setSuccess({
			protocol: "MCP",
			version: "1.0",
			type: "stateless",
			tools: toolsData
		});

		return response;
	}

	/**
	 * Handle requests to the /execute endpoint
	 * Executes a specified tool with the provided parameters
	 */
	private async handleExecuteRequest(ctx: Context, tools: MCPTool[]): Promise<INanoServiceResponse> {
		const response = new NanoServiceResponse();
		
		try {
			// Get tool name and parameters from the request body
			const body = ctx.request.body as Record<string, any>;
			const toolName = body?.name as string;
			const parameters = body?.parameters as Record<string, any> || {};
			
			if (!toolName) {
				throw new Error("Invalid request: Missing tool name");
			}
			
			// Find the requested tool
			const tool = tools.find(t => t.name === toolName);
			
			if (!tool) {
				throw new Error(`Tool '${toolName}' not found`);
			}
			
			// Create MCPRequestContext from ctx
			const mcpContext: MCPRequestContext = {
				operation: typeof ctx.request.params.mcp_operation === 'string' ? ctx.request.params.mcp_operation : 'execute',
				method: (ctx.request.method as unknown) as string,
				body: ctx.request.body as Record<string, any>,
				params: ctx.request.params as Record<string, any>,
				query: ctx.request.query as Record<string, any>,
				headers: ctx.request.headers as Record<string, any>,
				client: {
					id: ctx.id,
					name: 'mcp-server',
					version: '1.0.0'
				}
			};
			
			// Special handling for list_available_tools
			if (toolName === 'list_available_tools') {
				const toolsList = tools.map(t => ({
					name: t.name,
					description: t.description,
					schema: Object.entries(t.schema || {}).map(([paramName, schema]) => ({
						name: paramName,
						description: (schema as any)?.description || paramName,
						type: (schema as any)?.type?.type || 'string'
					}))
				}));
				
				// Filter by category if provided
				const category = parameters?.category?.toLowerCase();
				const filteredTools = category
					? toolsList.filter(t => 
						t.name.toLowerCase().includes(category) || 
						t.description.toLowerCase().includes(category))
					: toolsList;
				
				response.setSuccess({
					result: {
						tools: filteredTools,
						total: filteredTools.length,
						category: category || 'all'
					}
				});
				
				return response;
			}
			// Special handling for chain_tools
			else if (toolName === 'chain_tools') {
				const toolSequence = parameters.tool_sequence;
				const initialInput = parameters.initial_input || {};
				
				if (!toolSequence || !Array.isArray(toolSequence) || toolSequence.length === 0) {
					throw new Error("No tools specified in the sequence");
				}
				
				// Execute each tool in sequence, passing output as input to the next
				let currentInput = initialInput;
				let finalResult: any = null;
				
				for (const sequenceToolName of toolSequence) {
					// Find the tool
					const sequenceTool = tools.find(t => t.name === sequenceToolName);
					if (!sequenceTool) {
						throw new Error(`Tool '${sequenceToolName}' in sequence not found`);
					}
					
					// Execute the tool
					const executeResponse = await this.executeToolImplementation(sequenceTool, currentInput, mcpContext);
					finalResult = executeResponse?.result || executeResponse;
					
					// Use the result as input for the next tool
					currentInput = finalResult;
				}
				
				response.setSuccess({
					result: {
						result: finalResult,
						chained_tools: toolSequence
					}
				});
				
				return response;
			}
			
			// For all other tools, execute their implementation
			const result = await this.executeToolImplementation(tool, parameters, mcpContext);
			
			// Return the result
			response.setSuccess({
				result
			});
			
		} catch (error: unknown) {
			const nodeError = new GlobalError((error as Error).message);
			nodeError.setCode(500);
			nodeError.setStack((error as Error).stack);
			nodeError.setName(this.name);
			
			response.setError(nodeError);
		}
		
		return response;
	}
	
	/**
	 * Execute a tool's implementation
	 */
	private async executeToolImplementation(tool: MCPTool, parameters: Record<string, any>, mcpContext?: MCPRequestContext): Promise<any> {
		try {
			// Prepare inputs with context if available
			const inputs = {
				...parameters,
				context: mcpContext
			};
			
			// Convert function string to async function
			const asyncExecuteFn = new Function('inputs', `
				return (async () => {
					try {
						${tool.implementation}
					} catch (error) {
						if (error.message && error.message.includes('require is not defined')) {
							return { error: 'The tool implementation uses Node.js require() which is not supported. Please update the tool implementation to use browser-compatible code.' };
						}
						throw error;
					}
				})();
			`);
			
			// Execute the tool implementation with the provided parameters
			return await asyncExecuteFn(inputs);
		} catch (error) {
			throw new Error(`Error executing tool: ${(error as Error).message}`);
		}
	}

	/**
	 * Handle requests to the root MCP endpoint
	 * Provides information about the MCP implementation
	 */
	private handleInfoRequest(tools: MCPTool[]): INanoServiceResponse {
		const response = new NanoServiceResponse();
		
		response.setSuccess({
			protocol: "Model Context Protocol",
			implementation: "Stateless MCP",
			version: "1.0.0",
			description: "A revolutionary stateless implementation of MCP for nanoservices",
			endpoints: [
				{
					path: "/tools",
					description: "List all available tools"
				},
				{
					path: "/execute",
					description: "Execute a specific tool"
				}
			],
			tools_count: tools.length
		});
		
		return response;
	}

	// Convert a weather tool to MCP format
	private convertWeatherToolToMCP(): MCPTool {
		return {
			name: "weather",
			description: "Get current weather information for any city or location worldwide. Use this tool whenever a user asks about weather, temperature, conditions, humidity, or wind for a specific location. The tool returns real-time data from Open-Meteo API.",
			schema: {
				city: {
					type: {
						type: "string"
					},
					description: "The name of the city or location to get weather information for. Examples: 'Paris', 'New York', 'Tokyo', 'Toronto', etc."
				}
			},
			implementation: `
				try {
					const baseUrl = process.env.NANOSERVICE_BASE_URL || 'http://localhost:4000';
					console.log("Making HTTP POST request to: " + baseUrl + "/weather");
					
					// Use axios to make the HTTP request
					const axios = require('axios');
					const response = await axios.post(baseUrl + "/weather", {
						city: inputs.city
					});
					
					console.log("Weather API response:", response.data);
					return response.data;
				} catch (error) {
					console.error("Error calling weather API:", error.message);
					return { error: error.message };
				}
			`
		};
	}
	
	// Create a specialized tool for listing all available tools
	private createListToolsTool(): MCPTool {
		return {
			name: "list_available_tools",
			description: "Get a list of all tools available on this MCP server.",
			schema: {
				category: {
					type: { type: "string" },
					description: "Optional category filter"
				}
			},
			implementation: `
				return { message: "Tools listing feature is temporarily unavailable." };
			`
		};
	}
}
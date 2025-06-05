import { NanoService } from "@nanoservice-ts/runner";
import { NodeToMCPAdapter, MCPTool } from "./NodeToMCPAdapter";
import { WorkflowChainer } from "./WorkflowChainer";

declare global {
  var nodeRegistry: Record<string, any>;
}

/**
 * MCPRegistry - Manages global node registration and MCP tool generation
 */
export class MCPRegistry {
  // Initialize the global registry
  static {
    if (!global.nodeRegistry) {
      global.nodeRegistry = {};
    }
  }

  /**
   * Register a node in the global registry
   */
  static registerNode(name: string, node: NanoService<any>): void {
    global.nodeRegistry[name] = node;
  }

  /**
   * Register multiple nodes at once
   */
  static registerNodes(nodes: Record<string, NanoService<any>>): void {
    Object.entries(nodes).forEach(([name, node]) => {
      this.registerNode(name, node);
    });
  }

  /**
   * Get all registered nodes
   */
  static getRegisteredNodes(): Record<string, NanoService<any>> {
    return global.nodeRegistry;
  }

  /**
   * Convert registered nodes to MCP tools
   */
  static getNodeMCPTools(options: { excludeNodes?: string[] } = {}): MCPTool[] {
    return NodeToMCPAdapter.convertNodesToMCPTools(
      this.getRegisteredNodes(),
      options
    );
  }

  /**
   * Get workflow MCP tools - now marked as legacy method, use only for backward compatibility
   */
  static getWorkflowMCPTools(
    options: {
      workflowsDir?: string;
      excludeWorkflows?: string[];
    } = {}
  ): MCPTool[] {
    return NodeToMCPAdapter.discoverWorkflowsAsMCPTools(options.workflowsDir, {
      excludeWorkflows: options.excludeWorkflows,
    });
  }

  /**
   * Get enhanced workflow tools that can be chained with nodes
   */
  static async getChainableWorkflowTools(
    options: {
      workflowsDir?: string;
      excludeWorkflows?: string[];
    } = {}
  ): Promise<MCPTool[]> {
    return WorkflowChainer.discoverNodeSequencesFromWorkflows(
      options.workflowsDir,
      { excludeWorkflows: options.excludeWorkflows }
    );
  }

  /**
   * Get all MCP tools (nodes + workflows)
   * The order is important - nodes take priority over workflows
   */
  static async getAllMCPTools(
    options: {
      excludeNodes?: string[];
      workflowsDir?: string;
      excludeWorkflows?: string[];
      prioritizeNodes?: boolean;
      includeChainTool?: boolean;
      discover_nodes?: boolean;
      discover_workflows?: boolean;
    } = {}
  ): Promise<MCPTool[]> {
    // Default to prioritizing nodes
    const prioritizeNodes = options.prioritizeNodes !== false;
    const allTools: MCPTool[] = [];
    const toolNames = new Set<string>();

    // Get node tools first (highest priority) if discovery is enabled
    if (options.discover_nodes !== false) {
      const nodeTools = this.getNodeMCPTools({
        excludeNodes: options.excludeNodes,
      });

      // Add node tools first (they get priority)
      for (const tool of nodeTools) {
        toolNames.add(tool.name.toLowerCase());
        allTools.push(tool);
      }
    }

    // Get workflow tools if workflow discovery is enabled
    if (options.discover_workflows === true) {
      let workflowTools: MCPTool[] = [];

      try {
        if (prioritizeNodes) {
          // Use the new chainable workflow tools
          workflowTools = await this.getChainableWorkflowTools({
            workflowsDir: options.workflowsDir,
            excludeWorkflows: options.excludeWorkflows,
          });
        } else {
          // Fall back to legacy workflow discovery for backward compatibility
          workflowTools = this.getWorkflowMCPTools({
            workflowsDir: options.workflowsDir,
            excludeWorkflows: options.excludeWorkflows,
          });
        }

        // Add workflow tools only if no node with the same name exists
        for (const tool of workflowTools) {
          if (!toolNames.has(tool.name.toLowerCase())) {
            toolNames.add(tool.name.toLowerCase());
            allTools.push(tool);
          }
        }
      } catch (error) {
        console.error("Error during workflow discovery:", error);
        // Continue without workflow tools on error
      }
    }

    // Add the chain tool if requested
    if (options.includeChainTool) {
      try {
        const chainTool = WorkflowChainer.createChainExecutorTool();
        if (!toolNames.has(chainTool.name.toLowerCase())) {
          allTools.push(chainTool);
        }
      } catch (error) {
        console.error("Error creating chain tool:", error);
        // Continue without chain tool on error
      }
    }

    return allTools;
  }

  /**
   * Register all nodes from the src/nodes directory
   */
  static async discoverAndRegisterAllNodes(baseDir?: string): Promise<void> {
    const nodes = await NodeToMCPAdapter.discoverNodesFromDirectory(baseDir);
    this.registerNodes(nodes);
  }

  /**
   * Create a sequence of nodes as a chained tool
   */
  static createNodeSequenceTool(
    name: string,
    description: string,
    nodeSequence: string[],
    inputSchema: Record<string, any>
  ): MCPTool {
    return WorkflowChainer.createNodeSequenceTool(
      name,
      description,
      nodeSequence,
      inputSchema
    );
  }

  /**
   * Fetch available tools from multiple sources with improved error handling
   * Uses Promise.allSettled to handle individual failures gracefully
   */
  static async fetchAvailableTools(
    options: {
      discover_nodes?: boolean;
      discover_workflows?: boolean;
      workflowsDir?: string;
      excludeNodes?: string[];
      excludeWorkflows?: string[];
      includeChainTool?: boolean;
      prioritizeNodes?: boolean;
    } = {}
  ): Promise<MCPTool[]> {
    const toolSources = [];

    // Add MCP tools from nodes if enabled
    if (options.discover_nodes !== false) {
      toolSources.push(() =>
        Promise.resolve(
          this.getNodeMCPTools({
            excludeNodes: options.excludeNodes,
          })
        )
      );
    }

    // Add MCP tools from workflows if enabled
    if (options.discover_workflows === true) {
      // Determine which workflow discovery method to use
      if (options.prioritizeNodes !== false) {
        toolSources.push(() =>
          this.getChainableWorkflowTools({
            workflowsDir: options.workflowsDir,
            excludeWorkflows: options.excludeWorkflows,
          })
        );
      } else {
        toolSources.push(() =>
          Promise.resolve(
            this.getWorkflowMCPTools({
              workflowsDir: options.workflowsDir,
              excludeWorkflows: options.excludeWorkflows,
            })
          )
        );
      }
    }

    // Add chain tool if requested
    if (options.includeChainTool) {
      toolSources.push(() =>
        Promise.resolve([WorkflowChainer.createChainExecutorTool()])
      );
    }

    // Execute all tool source functions in parallel
    const results = await Promise.allSettled(
      toolSources.map((fetchFn) => fetchFn())
    );

    // Process results, handling errors gracefully
    const tools: MCPTool[] = [];
    const toolNames = new Set<string>();

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        // Add successful tools, avoiding duplicates
        for (const tool of result.value) {
          const toolLowerName = tool.name.toLowerCase();
          if (!toolNames.has(toolLowerName)) {
            toolNames.add(toolLowerName);
            tools.push(tool);
          }
        }
      } else {
        // Log errors but continue with other tools
        console.error(
          `Error fetching tools from source ${index}:`,
          result.reason
        );
      }
    });

    return tools;
  }
}
